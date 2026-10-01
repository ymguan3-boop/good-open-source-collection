import { MAP_STACKS } from './catalog.js';
import { photorealUnavailableReason } from './availability.js';
import { keySetupRequirement } from '../keySetupCore.mjs';
import {
  createOsmImagery,
  createEsriImagery,
  createIonImagery,
  ESRI_ATTRIBUTION_HTML,
} from './imagery.js';
import { createWorldTerrain, createKeylessTerrain } from './terrain.js';
import * as Cesium from 'cesium';
import { loadPhotorealisticTileset } from './google3d.js';

/** Select sources and setup guidance without putting provider branches in the controller. */
export function createDefaultMapSources({
  googleTileset = null,
  cesiumToken = '',
  googleApiKey = '',
} = {}) {
  const ionToken = String(cesiumToken || '').trim();
  const hasIon = Boolean(ionToken);
  const hasGoogle = Boolean(String(googleApiKey || '').trim());
  const terrain = {
    id: hasIon ? 'world' : 'keyless',
    create: hasIon
      ? (request) => createWorldTerrain(ionToken, request)
      : createKeylessTerrain,
  };
  return {
    defaultId: googleTileset ? 'photoreal' : 'esri-imagery',
    unknownId: 'photoreal',
    recoveryId: googleTileset ? 'photoreal' : null,
    state: { hasCesiumIonToken: hasIon },
    sources: MAP_STACKS.map((descriptor) => {
      const common = {
        descriptor,
        available: !descriptor.requiresIon || hasIon,
        unavailableReason: descriptor.requiresIon
          ? keySetupRequirement('cesium-ion')
          : null,
      };
      if (descriptor.kind === 'photoreal')
        return {
          ...common,
          // Retry a failed startup request on explicit user load/reset.
          available: Boolean(googleTileset) || hasIon || hasGoogle,
          unavailableReason: photorealUnavailableReason(hasIon || hasGoogle),
          tileset: googleTileset,
          createTileset:async()=>{const result=await loadPhotorealisticTileset(Cesium,{googleApiKey,cesiumToken});if(!result.tileset)throw new Error('Google 擬真 3D 無法連線；請檢查金鑰權限、額度與網路後重試');return result.tileset;},
        };
      const imagery =
        descriptor.kind === 'ion'
          ? () => createIonImagery(descriptor.style, ionToken)
          : descriptor.id === 'osm'
            ? createOsmImagery
            : createEsriImagery;
      return {
        ...common,
        imagery,
        terrain,
        ...(descriptor.id === 'esri-imagery'
          ? {
              credit: ESRI_ATTRIBUTION_HTML,
              constructionFallback: {
                id: 'osm',
                message: 'Esri Satellite is unavailable; using OSM',
              },
              tileFailureFallback: {
                id: 'osm',
                threshold: 2,
                message: 'Esri Satellite tile requests failed; using OSM',
              },
            }
          : {}),
      };
    }),
  };
}
