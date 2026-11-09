const commands=['draw','confirmRoute','method','plan','place','confirmOrigin','film','height','speed','pause','stop','show'];
export const CINEMATIC_VOICE_TOOL={name:'cinematic_camera',description:'本機電影空拍只有手繪空拍軌跡與自由空拍。draw讓使用者畫軌跡，confirmRoute確認既有路徑，method開啟拍攝手法，plan以description規劃並檢查地形建物；place讓使用者放置3D無人機，confirmOrigin檢查起飛位置。film只開啟確認視窗，必須由使用者按確認才拍攝。沒有路徑／起飛位置或障礙資料未知時請說明缺少條件，不宣稱已拍攝。',parameters:{type:'OBJECT',properties:{command:{type:'STRING',enum:commands},description:{type:'STRING',description:'使用者描述的拍攝方式，僅作為結構化計畫資料'},value:{type:'NUMBER'},delta:{type:'NUMBER'},factor:{type:'NUMBER'}},required:['command']}};
export function parseCinematicUtterance(text=''){
  if(/不要|不用|如何|怎麼|例如/.test(text))return null;
  let command,args={};
  if(/停止(?:電影)?(?:空拍|運鏡|拍攝)/.test(text))command='stop';
  else if(/暫停(?:電影)?(?:空拍|運鏡|拍攝)/.test(text))command='pause';
  else if(/確認(?:這條|手繪|空拍)?(?:路徑|軌跡)/.test(text))command='confirmRoute';
  else if(/確認(?:無人機)?(?:起飛)?位置/.test(text))command='confirmOrigin';
  else if(/(?:開始|確認|繼續)(?:空拍)?拍攝/.test(text))command='film';
  else if(/拍攝手法(?:說明|視窗)|(?:開啟|修改|返回)拍攝手法/.test(text))command='method';
  else if(/(?:規劃|設計)(?:空拍|拍攝)(?:方式|手法|路徑)/.test(text)){command='plan';args.description=text;}
  else if(/手繪(?:空拍)?(?:軌跡|路徑)/.test(text))command='draw';
  else if(/自由空拍|放置(?:3D|三維)?無人機/.test(text))command='place';
  else if(/(?:升高|降低|升空)一點/.test(text)){command='height';args.delta=/降低/.test(text)?-20:20;}
  else if(/(?:速度)?(?:慢|快)一點/.test(text)){command='speed';args.factor=/慢/.test(text)?.7:1.3;}
  else if(/(?:開啟|顯示)電影空拍/.test(text))command='show';
  if(command&&/電影|空拍|無人機|運鏡/.test(text))args.contextExplicit=true;
  return command?{name:'cinematic_camera',args:{command,...args}}:null;
}
export async function runCinematicVoice(panel,args){
  if(!panel||!commands.includes(args.command))throw new Error('不支援的電影空拍指令');for(const key of ['value','delta','factor'])if(key in args&&!Number.isFinite(args[key]))throw new Error('運鏡參數必須是數值');
  panel.show();if(['height','speed'].includes(args.command)&&!panel.core?.active&&!args.contextExplicit)return {ok:false,awaitingUser:true,message:'目前沒有進行空拍。你是要調整電影空拍的預設高度／速度嗎？請先在控制視窗確認。'};
  const result=await panel.execute(args.command,{...args,confirmed:false});if(result?.needsConfirmation)return {ok:false,awaitingUser:true,message:result.message};
  if(result?.heightTarget!==undefined)return {ok:true,message:'已設定安全升降目標；遇到障礙或資料不足會懸停。'};
  const labels={draw:'已開啟手繪空拍軌跡，請在地圖畫路徑後確認',confirmRoute:'已確認手繪路徑，請描述拍攝手法',method:'已開啟拍攝手法說明',plan:'已處理飛行計畫，請查看安全檢查結果；未確認前不會拍攝',place:'已開啟自由空拍，請放置無人機並確認起飛位置',confirmOrigin:'已完成起飛位置檢查，請在視窗確認拍攝',film:'請在控制視窗確認拍攝',height:'已調整下一次空拍的預設高度；實際拍攝仍須安全檢查',speed:'已調整空拍速度設定；手繪計畫需重新檢查後才套用',pause:'已切換拍攝暫停／繼續',stop:'已停止運鏡與拍攝',show:'已開啟電影空拍控制視窗'};
  return {ok:result?.ok!==false,message:labels[args.command]};
}
