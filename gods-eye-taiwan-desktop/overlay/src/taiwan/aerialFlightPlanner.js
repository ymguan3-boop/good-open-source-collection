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
  const plan={version:candidate.version,coordinates:candidate.coordinates?.map(p=>Array.isArray(p)?p.slice():p),description:candidate.description,speed:candidate.speed,pitch:candidate.pitch,roll:candidate.roll,fov:candidate.fov,lookAhead:candidate.lookAhead,acceleration:candidate.acceleration,clearance:candidate.clearance,source:'AI 修正規劃'};
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

/** Check locally first. A user-requested AI repair is one call followed by a
 * fresh local collision check; no retry loop can start filming.
 */
export async function prepareAerialFlight({coordinates,description='',settings={},collision,signal,onProgress=()=>{},cloudPlanner,model='auto-free',forceCloud=false}){
  const localPlan=makeLocalFlightPlan(coordinates,description,settings);
  const baseline=forceCloud&&cloudPlanner?{plan:localPlan,path:planPath(localPlan),validation:{status:'NOT_CHECKED',safe:false,reason:'請依使用者拍攝說明與已確認手繪軌跡規劃；幾何安全稍後由本機確認'},ok:false}:await checkPlan(localPlan,collision,signal,onProgress,0);
  if((baseline.ok&&!forceCloud)||!cloudPlanner)return {...baseline,corrections:[],canAiRepair:!baseline.ok,explanation:explanation(baseline),usedCloud:false};
  signal?.throwIfAborted();let response;try{response=await cloudPlanner({description,coordinates:coordinates.map(p=>p.slice()),localPlan,validation:baseline.validation,model,signal});}catch(error){signal?.throwIfAborted();if(forceCloud&&/請先輸入\s*OpenRouter\s*金鑰/i.test(error?.message||'')){const checked=await checkPlan(localPlan,collision,signal,onProgress,0);return {...checked,corrections:[],usedCloud:false,canAiRepair:!checked.ok,explanation:'未設定 OpenRouter 金鑰，本次未使用 AI，改為本機結構化規劃。'+explanation(checked)};}throw error;}signal?.throwIfAborted();
  const plan=normalizeAiFlightPlan(response?.plan||response,coordinates);
  const corrections=[];for(const key of ['speed','pitch','roll','fov','lookAhead','clearance'])if(plan[key]!==localPlan[key])corrections.push(`${{speed:'速度',pitch:'俯仰角',roll:'傾斜角',fov:'視野角',lookAhead:'前視距離',clearance:'安全距離'}[key]}由 ${localPlan[key]} 改為 ${plan[key]}`);
  const heightChanges=plan.coordinates.filter((p,i)=>Math.abs(p[2]-localPlan.coordinates[i][2])>.01).length;if(heightChanges)corrections.push(`修正 ${heightChanges} 個航點高度`);
  if(plan.description!==description)corrections.push(`拍攝描述改為「${plan.description}」`);
  const aiExplanation=typeof response?.explanation==='string'?response.explanation.trim().slice(0,2000):'';if(aiExplanation)corrections.push(aiExplanation);
  if(!corrections.length)corrections.push('AI 保留原計畫；已重新檢查碰撞條件');
  const checked=await checkPlan(plan,collision,signal,onProgress,1);
  return {...checked,corrections,canAiRepair:!checked.ok,usedCloud:true,model,explanation:explanation(checked,corrections)};
}
