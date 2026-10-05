const MAP_KEYS=new Set(['google','cesium','GOOGLE_MAPS_API_KEY','CESIUM_ION_TOKEN']);
export function requiresApplicationRestart(names=[]){return names.some(name=>MAP_KEYS.has(name));}

// AI providers read keys on each request; Live settings restart only the active
// session. Map SDK tokens are captured at Viewer startup and need a page restart.
export function createApplicationRestart({checkpoint,stop,reload=()=>location.reload(),onStatus=()=>{}}){
  let pending=null;
  return {
    request(reason){
      if(pending)return pending;
      pending=(async()=>{
        onStatus('設定已儲存，正在保存工作並自動重新啟動地圖…');
        await checkpoint?.(reason);
        await stop?.();
        reload();
      })().catch(error=>{pending=null;onStatus(`設定已保存，但重新啟動前保存工作失敗：${error.message}。請保留目前視窗並重試。`);throw error;});
      return pending;
    },
    get pending(){return !!pending;}
  };
}
