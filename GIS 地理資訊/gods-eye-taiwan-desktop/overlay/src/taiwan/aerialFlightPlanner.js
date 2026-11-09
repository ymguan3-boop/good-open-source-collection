import * as Cesium from 'cesium';
import { smoothPath, clamp } from './cinematicCameraPaths.js';

export function validateFlightPlan(plan){
  if(!plan||plan.version!==1||!Array.isArray(plan.coordinates)||plan.coordinates.length<2||plan.coordinates.length>3000)throw new Error('飛行計畫缺少有效路徑');
  for(const p of plan.coordinates)if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90||p[2]<-500||p[2]>15000)throw new Error('飛行計畫座標／高度無效');
  const ranges={speed:[1,50],pitch:[-85,45],roll:[-20,20],fov:[25,100],lookAhead:[5,500],acceleration:[.5,15],clearance:[3,30]};
  for(const [key,[min,max]] of Object.entries(ranges))if(!Number.isFinite(plan[key])||plan[key]<min||plan[key]>max)throw new Error(`飛行計畫的 ${key} 超出允許範圍`);
  if(typeof plan.description!=='string'||plan.description.length>4000)throw new Error('拍攝說明過長');return plan;
}

/** Plain language becomes bounded flight data. Descriptions are never executed. */
export function makeLocalFlightPlan(coordinates,description='',settings={}){
  let speed=Number(settings.speed)||12,pitch=-20,height=Number(settings.height)||80,fov=65;
  if(/慢|緩|細看|穩/.test(description))speed=6;if(/快|快速/.test(description))speed=24;
  if(/俯瞰|鳥瞰|垂直向下/.test(description))pitch=-75;if(/平視|水平/.test(description))pitch=-5;
  if(/升空|拉升|升高|揭露/.test(description))height+=50;if(/低空|貼近/.test(description))height=Math.max(12,height*.5);
  const statedHeight=description.match(/(?:高度|離地|飛高|升到)\s*(\d+(?:\.\d+)?)\s*(?:公尺|米|m)/i),statedSpeed=description.match(/(?:速度)\s*(\d+(?:\.\d+)?)\s*(?:公尺|米|m)/i);
  if(statedHeight)height=clamp(Number(statedHeight[1]),8,3000);if(statedSpeed)speed=clamp(Number(statedSpeed[1]),1,50);
  const raw=coordinates.map((p,i)=>[p[0],p[1],Math.max(-500,Number(p[2])||0)+height+(/升空|拉升|揭露/.test(description)?i/Math.max(1,coordinates.length-1)*70:0)]);
  return validateFlightPlan({version:1,coordinates:raw,description,speed:clamp(speed,1,50),pitch,roll:0,fov,lookAhead:Math.max(10,speed*3),acceleration:3,clearance:clamp(Number(settings.margin)||3,3,30),source:'本機結構化規劃',heightIntent:height});
}

export function planPath(plan){validateFlightPlan(plan);return smoothPath(plan.coordinates.map(p=>{const c=Cesium.Cartesian3.fromDegrees(...p);return [c.x,c.y,c.z];}),12);}

/** Only known scalar fields and the user's confirmed horizontal route survive. */
export function normalizeAiFlightPlan(candidate,coordinates){
  if(!candidate||typeof candidate!=='object')throw new Error('AI 沒有回傳有效的結構化飛行計畫');
  const plan={version:candidate.version,coordinates:candidate.coordinates?.map(p=>Array.isArray(p)?p.slice():p),description:candidate.description,speed:candidate.speed,pitch:candidate.pitch,roll:candidate.roll,fov:candidate.fov,lookAhead:candidate.lookAhead,acceleration:candidate.acceleration,clearance:candidate.clearance,source:'AI 修正規劃',heightIntent:candidate.heightIntent,model:candidate.model};
  validateFlightPlan(plan);
  if(plan.coordinates.length!==coordinates.length||plan.coordinates.some((p,i)=>Math.abs(p[0]-coordinates[i][0])>.00001||Math.abs(p[1]-coordinates[i][1])>.00001))throw new Error('AI 更動了已確認的手繪位置；請重畫並重新確認路徑');
  return plan;
}

async function checkPlan(plan,collision,signal,onProgress,stage){
  signal?.throwIfAborted();const path=planPath(plan),radius=collision.margin({speed:plan.speed,dt:.2,margin:plan.clearance})+3;
  const validation=await collision.validate(path.points,{radius,signal,onProgress:progress=>onProgress({attempt:stage,progress})});signal?.throwIfAborted();
  return {plan,path,validation,ok:validation.status!=='UNKNOWN'&&validation.safe===true};
}
function explanation(result,corrections=[]){
  const {plan,path,validation,ok}=result;
  if(!ok){const reason=validation.reason||validation.unsafe?.[0]?.reason||'路徑與地形／建物衝突';return `尚不能開始拍攝：${reason}。${validation.status==='UNKNOWN'?'目前障礙資料不足；AI 建議也不能取代實際幾何驗證。請等圖資載入或縮短路徑。':'可修改拍攝描述、增加高度或重畫路徑，再確認規劃；也可使用 AI 修正規劃。'}`;}
  return `飛行計畫：距離 ${Math.round(path.total)} 公尺，約 ${Math.ceil(path.total/plan.speed)} 秒。已完成 ${validation.checkedSamples||0} 個位置及連續路段的地形${validation.checked3D?'與 3D 建物':''}體積預檢。${corrections.length?`改寫說明：${corrections.join('；')}。`:''}請檢視安全預覽後按「開拍」。${validation.limitations||'檢查僅依目前場景可用的幾何，不代表未提供的障礙'}。`;
}

/** User requests one automatic workflow: format repair, bounded camera intent
 * repair, then actual geometry validation. Unknown data never becomes PASS. */
export async function prepareAerialFlight({coordinates,description='',settings={},collision,signal,onProgress=()=>{},cloudPlanner,model='auto-free',forceCloud=false,onGeometryRetry=async()=>{}}){
  const original=makeLocalFlightPlan(coordinates,description,settings);
  let current=original,checked=forceCloud&&cloudPlanner?{plan:original,path:planPath(original),validation:{status:'NOT_CHECKED',safe:false,reason:'先規劃拍攝參數，再檢查實際地形與建物'},ok:false}:await checkPlan(original,collision,signal,onProgress,0);
  if((checked.ok&&!forceCloud)||!cloudPlanner)return {...checked,corrections:[],canAiRepair:!checked.ok,explanation:explanation(checked),usedCloud:false};
  const corrections=[],attempts=[];let usedCloud=false,feedback='',lastError;
  for(let attempt=1;attempt<=3;attempt++){
    signal?.throwIfAborted();onProgress({attempt,progress:0,phase:'ai',message:`AI 自動修正規劃 ${attempt}/3；格式不符會重試，完成後仍需安全檢查`});
    let response;
    try{
      response=await cloudPlanner({description,coordinates:coordinates.map(p=>p.slice()),localPlan:current,validation:checked.validation,model,signal,feedback,attempt,onStatus:message=>onProgress({attempt,phase:'ai',progress:0,message})});signal?.throwIfAborted();
      current=normalizeAiFlightPlan(response?.plan||response,coordinates);usedCloud=true;lastError=null;
    }catch(error){
      signal?.throwIfAborted();
      if(/請先輸入\s*OpenRouter\s*金鑰/i.test(error?.message||'')){checked=await checkPlan(original,collision,signal,onProgress,0);return {...checked,corrections:[],usedCloud:false,canAiRepair:!checked.ok,explanation:'未設定 OpenRouter 金鑰，本次未使用 AI，改為本機結構化規劃。'+explanation(checked)};}
      if(!/格式|參數|飛行計畫|更動了|座標|高度|超出/.test(error?.message||''))throw error;
      lastError=error;feedback=`上一回格式不符：${error.message}。請依合法範圍修正，平面路徑保持原樣。`;attempts.push({attempt,status:'INVALID',reason:error.message});continue;
    }
    if(typeof response?.explanation==='string'&&response.explanation.trim())corrections.push(response.explanation.trim().slice(0,1000));
    checked=await checkPlan(current,collision,signal,onProgress,attempt);
    // Reload geometry only, instead of repeatedly paying AI for missing tiles.
    for(let retry=0;checked.validation.status==='UNKNOWN'&&retry<2;retry++){
      signal?.throwIfAborted();onProgress({attempt,phase:'geometry-retry',progress:0,message:`正在補齊拍攝範圍的障礙資料 ${retry+1}/2；尚未開拍`});
      await onGeometryRetry({plan:current,path:checked.path,signal,retry});signal?.throwIfAborted();checked=await checkPlan(current,collision,signal,onProgress,attempt);
    }
    attempts.push({attempt,status:checked.validation.status,reason:checked.validation.reason});
    if(checked.ok)break;
    if(checked.validation.status==='UNKNOWN')break;
    // A measured surface conflict provides an exact minimum raise. Wall-only
    // conflicts use a stated local altitude adjustment and must pass fresh rays.
    const unsafe=checked.validation.unsafe||[],needed=unsafe.reduce((delta,item)=>{const raw=item.point||checked.validation.points?.[item.index];if(!Number.isFinite(item.requiredHeight)||!raw)return delta;const point=Array.isArray(raw)?new Cesium.Cartesian3(...raw):raw;return Math.max(delta,item.requiredHeight-Cesium.Cartographic.fromCartesian(point).height+3);},0);
    const raise=Math.max(needed,20*attempt),heightIntent=(current.heightIntent??original.heightIntent)+raise;
    if(heightIntent>3000)break;
    current=validateFlightPlan({...current,heightIntent,coordinates:current.coordinates.map(p=>[p[0],p[1],p[2]+raise]),speed:Math.max(1,Math.min(current.speed,original.speed)),description:`${current.description}；依幾何檢查提高 ${Math.ceil(raise)} 公尺後重新驗證`});
    corrections.push(`本機根據障礙檢查將計畫提高 ${Math.ceil(raise)} 公尺，沒有改動手繪平面位置`);
    checked=await checkPlan(current,collision,signal,onProgress,attempt);if(checked.ok)break;
    if(checked.validation.status==='UNKNOWN')break;
    feedback=`上次未通過：${checked.validation.reason||checked.validation.unsafe?.[0]?.reason||'與建物衝突'}。目前起點相對高度 ${heightIntent} 公尺，請調整高度與速度。`;
  }
  if(lastError&&!usedCloud)throw new Error(`AI 已自動修正三次仍未取得合法參數：${lastError.message}。未允許開拍，請更換模型或調整描述。`);
  if(usedCloud){for(const key of ['speed','pitch','roll','fov','lookAhead','clearance'])if(current[key]!==original[key])corrections.push(`${key} ${original[key]} → ${current[key]}`);const count=current.coordinates.filter((p,i)=>Math.abs(p[2]-original.coordinates[i][2])>.01).length;if(count)corrections.push(`修正 ${count} 個航點高度`);}
  return {...checked,corrections,attempts,canAiRepair:!checked.ok,usedCloud,model,explanation:explanation(checked,corrections)};
}
