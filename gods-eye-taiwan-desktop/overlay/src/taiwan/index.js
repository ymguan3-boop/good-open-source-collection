
import { installTraditionalChinese } from './i18n.js';
import { ResourceGovernor } from './resourceGovernor.js';
import { mountShell } from './ui.js';
import { ensureCounties } from './dataScope.js';

export function installTaiwanEdition({ components }) {
  void ensureCounties().catch(error=>console.warn('縣市界尚未就緒',error.message));
  document.documentElement.lang = 'zh-Hant-TW';
  document.title = '上帝之眼・台灣版';
  const viewer = components?.scene?.viewer;
  if (!viewer) throw new Error('Taiwan edition requires upstream scene.viewer');
  // A new desktop session always starts idle, regardless of the previous URL
  // or layer restore state. The globe and resource safety monitor remain ready.
  viewer.camera.cancelFlight();
  viewer.trackedEntity = undefined;
  components?.tools?.voiceCommands?.stop?.();
  components?.tools?.sceneDirector?.stopScene?.('重新開啟後保持停止');
  const manager = components?.data?.dataManager;
  const originalIntent = manager?._setEnabledWithIntent;
  if (originalIntent) manager._setEnabledWithIntent = function(id,enabled,options={}) {
    // CCTV requires a direct user choice. Camera/project/URL restores cannot
    // opt the user into a live feed after the initial idle reset.
    const explicit = ['user','voice','taiwan-user'].includes(options.origin) || (options.origin === 'scene' && components?.tools?.sceneDirector?.running);
    if (id === 'cctv' && enabled && !explicit) enabled = false;
    return originalIntent.call(this,id,enabled,options);
  };
  if (manager?.layers) {
    for (const id of manager.layers.keys()) {
      if (manager.isEnabled(id)) void manager.setEnabled(id, false, { origin:'taiwan-startup-idle' }).catch(error => console.warn('啟動時停止圖層失敗', id, error));
    }
  }
  const governor = new ResourceGovernor(viewer, components?.scene?.tileset || null);
  const disposeI18n = installTraditionalChinese();
  const disposeUi = mountShell({ viewer, governor, dataManager:manager, mapStackController:components?.scene?.mapStackController, stopLegacyWork:async ({reset=false}={}) => {
    await Promise.allSettled([components?.tools?.voiceCommands?.stop?.(),components?.tools?.sceneDirector?.stopScene?.('專案操作，停止原版語音與場景')]);
    if(reset){
      const style=components?.controls?.styleManager;
      style?.shareLinkManager?.claimRestoreLane?.('map');style?.shareLinkManager?.claimRestoreLane?.('visual');
      const actions=[()=>style?.supersedeDeferredNavigation?.(),()=>style?.orbitController?.stop?.(),()=>style?.controlCockpit?.('exit'),()=>style?.setStyle?.('normal',{applyPreset:false,revealParameters:false}),()=>style?.setDetection?.({enabled:false}),()=>style?.setBloom?.({enabled:false}),()=>style?.setSharpen?.({enabled:false}),()=>style?.setCelestialRingEnabled?.(false,{focus:false}),()=>style?.setRecordingMode?.(false),()=>style?.setCleanView?.(false),()=>style?._setModels3dEnabled?.(false),()=>style?.applyVisualState?.({scope:{enabled:false}}),()=>style?.setHudVisible?.('off'),()=>style?.setCyberSonar?.({enabled:false}),()=>style?.clearSearchedLocation?.(),()=>components?.controls?.cockpitCloudEffects?.setEnabled?.(false),()=>window.__gevDrawTool?.setActive?.(false),()=>components?.tools?.annotations?.clear?.(),()=>window.__gevRecentImagery?.tool?.cancel?.()];
      for(const action of actions){try{await action();}catch(error){console.warn('原版功能關閉失敗',error);}}
      viewer.trackedEntity=undefined;viewer.camera.cancelFlight();
    }
  }, styleManager:components?.controls?.styleManager });
  components?.controls?.styleManager?.setHudVisible?.('off');
  const removeMapListener=components?.scene?.mapStackController?.subscribe?.(()=>governor.setTileset(components.scene.mapStackController.getImageryHostTileset()));
  return () => { removeMapListener?.();disposeUi?.(); disposeI18n?.(); if (originalIntent) manager._setEnabledWithIntent = originalIntent; };
}
