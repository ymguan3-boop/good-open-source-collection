import * as Cesium from 'cesium';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const clean = value => (value === undefined || value === null || value === '' || value === 'NA') ? null : value;
const month = value => /^\d{6}$/.test(String(value || '')) ? `${String(value).slice(0, 4)}/${String(value).slice(4)}` : (clean(value) ?? '未提供');
const row = (label, value) => `<tr><th>${esc(label)}</th><td>${value === null || value === undefined || value === '' ? '未提供' : esc(value)}</td></tr>`;

/** Reads NLSC building attributes straight from the clicked 3D Tiles feature. */
export function featureAttributes(feature) {
  const read = name => { try { return feature.getProperty(name); } catch { return undefined; } };
  const id = clean(read('BUILD_ID'));
  if (!id) return null;
  return { buildId: String(id), heightM: Number(read('BUILD_H')) || null, buildNo: clean(read('BUILD_NO')), name: clean(read('BUILDNAME')), type: clean(read('BUILDTYPE')),
    modelDate: clean(read('MDATE')), updatedDate: clean(read('M_MDATE')), sourceDescription: clean(read('SOURCE_DES')), lod: clean(read('MODEL_LOD')), mapFrame: clean(read('C_FRAMEID')) };
}

export function buildingInfoHtml(tile, info) {
  const b = { ...tile, ...(info?.found ? info.building : {}) };
  const admin = info?.admin;
  const stored = info?.found
    ? `<p class="tw-note">本機建物主檔：${esc(info.source?.name || 'NLSC 建物屬性')}；建檔 ${esc(info.source?.updatedAt ? new Date(info.source.updatedAt).toLocaleString('zh-TW') : '時間未記錄')}。${info.source?.pendingTiles ? `建檔尚有 ${esc(info.source.pendingTiles)} 個圖磚未完成，範圍可能不完整。` : ''}</p>`
    : `<p class="tw-note">此建物尚未收錄於本機建物主檔（${esc(info?.reason || info?.error || '無法連線本機服務')}）；以下僅為點擊圖磚上的官方屬性。</p>`;
  return `<section class="tw-card tw-building-card">
    <h3>建物 ${esc(b.buildId)}</h3>
    ${admin ? `<p>${esc(admin.county)} ${esc(admin.town)} ${esc(admin.village)}</p>` : ''}
    <h4 class="tw-info-title">NLSC 官方三維建物屬性</h4>
    <table class="tw-table tw-bordered">
      ${row('建物高度（公尺）', b.heightM)}
      ${row('層數欄位 BUILD_NO（與高度大致吻合，疑為樓層數）', clean(b.buildNo))}
      ${row('名稱', clean(b.name))}${row('類型', clean(b.type))}
      ${row('模型資料日期', month(b.modelDate))}${row('模型更新日期', month(b.updatedDate))}
      ${row('模型來源', clean(b.sourceDescription))}${row('模型精細度 LOD', clean(b.lod))}
      ${b.lon ? row('中心座標（WGS84）', `${Number(b.lon).toFixed(6)}, ${Number(b.lat).toFixed(6)}`) : ''}
      ${b.e97 ? row('中心座標（TWD97 TM2）', `${Number(b.e97).toFixed(3)}, ${Number(b.n97).toFixed(3)}`) : ''}
    </table>
    ${stored}
    <h4 class="tw-info-title">地籍</h4><p class="tw-note">尚未建立。需取得地籍圖向量（地政單位）才能判定建物所在地號；NLSC 地籍 WFS 需申請，不混用。</p>
    <h4 class="tw-info-title">建管資料</h4><p class="tw-note">尚未建立。</p>
    <h4 class="tw-info-title">實價登錄（同路名候選）</h4>${lvrHtml(info?.lvr)}
    <p class="tw-note">來源：內政部國土測繪中心三維建物模型。中心點座標非建物足跡；只代表該模型版本，非建物清冊或現況。</p>
  </section>`;
}

const FLOOR_LABEL = { match: '層數相符', differ: '層數不符', unknown: '層數未知' };
function lvrHtml(lvr) {
  if (!lvr) return '<p class="tw-note">尚未建立。</p>';
  if (!lvr.available || !lvr.candidates?.length) return `<p class="tw-note">${esc(lvr.message || '沒有同路名的實價登錄交易。')}</p>`;
  const rows = lvr.candidates.map(c => `<tr><td>${esc(c.tradeDate)}</td><td>${esc(c.address)}</td><td>${esc(c.totalFloors || '')}／${esc(c.buildingType || '')}</td><td>${esc(c.completed || '')}</td><td>${c.areaPing ?? ''}</td><td>${c.totalPriceWan ?? ''}</td><td>${c.unitPriceWanPing ?? ''}</td><td>${esc(FLOOR_LABEL[c.floorsMatch])}</td></tr>`).join('');
  const roads = lvr.roads.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.meters)} 公尺</td></tr>`).join('');
  return `<p class="tw-note"><strong>候選，非確認。</strong>實價登錄只有門牌、沒有座標，無法確定是這一棟。以下是此建物面對的道路上的 114 年買賣交易，共 ${lvr.total} 筆（層數相符 ${lvr.matchCount} 筆），列出前 ${lvr.candidates.length} 筆。層數比對是 BUILD_NO 與交易的總樓層數，僅供參考。</p>
    <table class="tw-table tw-bordered tw-roads"><thead><tr><th>面對的道路</th><th>距建物中心</th></tr></thead><tbody>${roads}</tbody></table>
    <div class="tw-table-scroll"><table class="tw-table tw-bordered"><thead><tr><th>交易日</th><th>門牌</th><th>總樓層／型態</th><th>建築完成</th><th>坪數</th><th>總價(萬)</th><th>單價(萬/坪)</th><th>比對</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="tw-note">來源：${esc(lvr.source || '內政部實價登錄')}；道路：${esc(lvr.roadSource || 'OSM')}。</p>`;
}

const MARKER_LENGTH_M = 16, MARKER_RADIUS_M = 8, MARKER_CLEARANCE_M = 3;

/** A red, solid, inverted cone (tip down) hovering above the chosen building. */
function createMarker(viewer) {
  let source = null, entity = null;
  const ensure = () => {
    if (source && viewer.dataSources.contains(source)) return;
    source = new Cesium.CustomDataSource('gev-building-marker');
    viewer.dataSources.add(source);
    entity = null;
  };
  const position = (lon, lat, tipHeight) => Cesium.Cartesian3.fromDegrees(lon, lat, tipHeight + MARKER_LENGTH_M / 2);
  return {
    show(lon, lat, tipHeight) {
      ensure();
      const where = position(lon, lat, tipHeight);
      if (entity) { entity.position = where; }
      else entity = source.entities.add({
        position: where,
        cylinder: { length: MARKER_LENGTH_M, topRadius: MARKER_RADIUS_M, bottomRadius: 0, slices: 32,
          material: Cesium.Color.fromCssColorString('#ef2b2b').withAlpha(0.96), outline: true, outlineColor: Cesium.Color.fromCssColorString('#7f1010'), outlineWidth: 1 },
      });
      viewer.scene.requestRender();
    },
    move(lon, lat, tipHeight) { if (entity) { entity.position = position(lon, lat, tipHeight); viewer.scene.requestRender(); } },
    clear() { if (source && entity) { source.entities.remove(entity); entity = null; viewer.scene.requestRender(); } },
    destroy() { this.clear(); if (source && viewer.dataSources.contains(source)) viewer.dataSources.remove(source, true); source = null; },
  };
}

/** Height of the roof tip position: terrain under the building plus the model height, never below the clicked point. */
function roofTipHeight(viewer, lon, lat, heightM, clickedHeight) {
  let ground;
  try { ground = viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(lon, lat)); } catch { ground = undefined; }
  const roof = Number.isFinite(ground) && Number.isFinite(heightM) ? ground + heightM : null;
  return Math.max(Number.isFinite(clickedHeight) ? clickedHeight : -Infinity, roof ?? -Infinity, 0) + MARKER_CLEARANCE_M;
}

/** Click a building of an NLSC tileset to open its information card. */
export function attachBuildingInfoPicker({ viewer, onInfo }) {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  const marker = createMarker(viewer);
  let highlighted = null, previousColor = null, sequence = 0;
  const restore = () => { if (highlighted) { try { highlighted.color = previousColor; } catch { /* tile unloaded */ } } highlighted = null; marker.clear(); };
  handler.setInputAction(async click => {
    // Other tools own the click while they draw, measure or pick.
    if (['crosshair', 'grabbing'].includes(viewer.canvas.style.cursor)) return;
    let picked;
    try {
      picked = viewer.scene.pick(click.position);
      // The red marker hovers above the building; look through it to the building behind.
      if (picked?.id instanceof Cesium.Entity) picked = viewer.scene.drillPick(click.position, 6).find(item => item instanceof Cesium.Cesium3DTileFeature);
    } catch { return; }
    // Only the 宜蘭縣OSM+實價登錄 3D建物 layer opens the card; the plain NLSC 3D 建物 layer is untouched.
    if (!(picked instanceof Cesium.Cesium3DTileFeature) || !picked.tileset?.__gevInfoLayer) return;
    const tile = featureAttributes(picked);
    if (!tile) return;
    restore();
    try { highlighted = picked; previousColor = picked.color?.clone?.() ?? Cesium.Color.WHITE.clone(); picked.color = Cesium.Color.YELLOW.withAlpha(0.95); } catch { highlighted = null; }
    const current = ++sequence;
    // Immediate marker at the clicked spot; it moves to the building centre when the local record arrives.
    let clickedLon = null, clickedLat = null, clickedHeight = null;
    try {
      const where = viewer.scene.pickPositionSupported ? viewer.scene.pickPosition(click.position) : null;
      if (where) { const c = Cesium.Cartographic.fromCartesian(where); clickedLon = Cesium.Math.toDegrees(c.longitude); clickedLat = Cesium.Math.toDegrees(c.latitude); clickedHeight = c.height; }
    } catch { /* depth not available */ }
    if (clickedLon !== null) marker.show(clickedLon, clickedLat, roofTipHeight(viewer, clickedLon, clickedLat, tile.heightM, clickedHeight));
    onInfo(buildingInfoHtml(tile, null).replace('<h4 class="tw-info-title">NLSC', '<p class="tw-note">正在查詢本機建物主檔…</p><h4 class="tw-info-title">NLSC'));
    let info;
    try {
      const response = await fetch(`/api/taiwan/nlsc-buildings/info?id=${encodeURIComponent(tile.buildId)}`, { cache: 'no-store', credentials: 'same-origin' });
      info = await response.json();
    } catch (error) { info = { found: false, reason: error.message }; }
    if (current === sequence) {
      onInfo(buildingInfoHtml(tile, info));
      const b = info?.found ? info.building : null;
      if (b && Number.isFinite(b.lon) && Number.isFinite(b.lat)) marker.move(b.lon, b.lat, roofTipHeight(viewer, b.lon, b.lat, tile.heightM, clickedHeight));
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  return () => { restore(); marker.destroy(); if (!handler.isDestroyed()) handler.destroy(); };
}
