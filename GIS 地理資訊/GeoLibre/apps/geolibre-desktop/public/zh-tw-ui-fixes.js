/*
 * GeoLibre Traditional Chinese UI fixes for third-party map controls.
 *
 * Some upstream MapLibre controls currently hard-code English strings and do
 * not expose a localization API. This small runtime bridge keeps those labels
 * in Traditional Chinese when GeoLibre is running in zh-TW/zh-Hant, including
 * controls that re-render their DOM after filtering or state changes.
 */
(() => {
  const queryLocale = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return (params.get("locale") || params.get("lang") || "").toLowerCase();
    } catch {
      return "";
    }
  })();
  const queryRequestsTraditional =
    queryLocale.startsWith("zh-tw") || queryLocale.startsWith("zh-hant");

  const TEXT = new Map([
    ["Basemaps", "底圖"],
    ["Add basemaps (stack instead of replace)", "疊加底圖（不取代目前底圖）"],
    ["All providers", "所有提供者"],
    ["All categories", "所有類別"],
    ["Applying basemap...", "正在套用底圖…"],
    ["No basemaps match your search.", "找不到符合搜尋條件的底圖。"],
    ["Raster", "柵格"],
    ["Overlay", "疊加"],
    ["Style", "樣式"],
    ["API keys", "API 金鑰"],
    ["Back to basemaps", "返回底圖"],
    ["Add the credentials each provider requires to use its basemaps.", "請輸入各服務提供者使用底圖所需的 API 金鑰。"],
    [", then enter it below and press Enter.", "，接著在下方輸入並按 Enter。"],
    ["Map tools", "地圖工具"],
    ["Search", "搜尋"],
    ["Search places", "搜尋地點"],
    ["Toggle fullscreen", "切換全螢幕"],
    ["Enter fullscreen", "進入全螢幕"],
    ["Exit fullscreen", "離開全螢幕"],
    ["Toggle globe projection", "切換地球投影"],
    ["Spin globe", "旋轉地球"],
    ["Reset bearing to north", "重設方位為正北"],
    ["Reset pitch & bearing", "重設俯仰與方位"],
    ["Toggle terrain", "切換 3D 地形"],
    ["Enable terrain", "啟用 3D 地形"],
    ["Disable terrain", "關閉 3D 地形"],
    ["View map state", "檢視地圖狀態"],
    ["Inspect features", "查詢圖徵"],
    ["Add vector dataset", "新增向量資料集"],
    ["COG Layer", "COG 圖層"],
    ["Toggle minimap", "切換小地圖"],
    ["Measure distances and areas", "測量距離與面積"],
    ["Bookmarks", "書籤"],
    ["Export map", "匯出地圖"],
    ["Zarr Layer", "Zarr 圖層"],
    ["PMTiles Layer", "PMTiles 圖層"],
    ["STAC Layer", "STAC 圖層"],
    ["STAC Search", "STAC 搜尋"],
    ["Add vector layer", "新增向量圖層"],
    ["Geo Editor", "圖徵編輯"],
    ["LiDAR Layer", "LiDAR 圖層"],
    ["Planetary Computer", "Planetary Computer"],
    ["Gaussian Splat", "高斯潑濺"],
    ["Street View", "街景"],
    ["Layer Swipe", "圖層捲簾比較"],
    ["USGS LiDAR", "USGS LiDAR"],
    ["Colorbar", "色帶"],
    ["Legend", "圖例"],
    ["HTML Control", "HTML 控制項"],
    ["Tile Layer", "圖磚圖層"],
    ["Zoom in", "放大"],
    ["Zoom out", "縮小"],
    ["Find my location", "定位我的位置"],
    ["Show my location", "顯示我的位置"],
    ["Close", "關閉"],
    ["Close basemap panel", "關閉底圖面板"],
    ["Add basemaps instead of replacing", "疊加底圖而非取代目前底圖"],
    ["Provider", "提供者"],
    ["Category", "類別"],
    ["API key", "API 金鑰"],
  ]);

  const PLACEHOLDER = new Map([
    ["Search basemaps", "搜尋底圖"],
    ["Search places...", "搜尋地點…"],
    ["before_id: none", "插入於圖層前：無"],
  ]);

  const CATEGORY = new Map([
    ["Street", "街道"],
    ["Regional", "區域"],
    ["Satellite", "衛星影像"],
    ["Imagery", "影像"],
    ["Terrain", "地形"],
    ["Topographic", "地形圖"],
    ["Navigation", "導航"],
    ["Outdoor", "戶外"],
    ["Light", "淺色"],
    ["Dark", "深色"],
    ["Hybrid", "混合"],
    ["Traffic", "交通"],
    ["Ocean", "海洋"],
    ["Labels", "標註"],
  ]);

  function isTraditionalChinese() {
    const lang = (document.documentElement.lang || "").toLowerCase();
    if (lang.startsWith("zh-tw") || lang.startsWith("zh-hant")) return true;
    return lang === "zh" && queryRequestsTraditional;
  }

  function remember(el, key, value) {
    const dataKey = "geolibreZhTwOriginal" + key;
    if (el.dataset[dataKey] === undefined) el.dataset[dataKey] = value;
  }

  function restoreAttr(el, attr, key) {
    const dataKey = "geolibreZhTwOriginal" + key;
    const original = el.dataset[dataKey];
    if (original !== undefined) {
      if (original) el.setAttribute(attr, original);
      else el.removeAttribute(attr);
      delete el.dataset[dataKey];
    }
  }

  function localizeAttr(el, attr, key, table) {
    const raw = el.getAttribute(attr);
    if (raw == null) return;
    if (!isTraditionalChinese()) {
      restoreAttr(el, attr, key);
      return;
    }
    const translated = table.get(raw);
    if (!translated) return;
    remember(el, key, raw);
    el.setAttribute(attr, translated);
  }

  function localizeTextElement(el) {
    if (!(el instanceof HTMLElement)) return;
    const raw = (el.textContent || "").trim();
    if (!raw) return;

    if (!isTraditionalChinese()) {
      const original = el.dataset.geolibreZhTwOriginalText;
      if (original !== undefined) {
        el.textContent = original;
        delete el.dataset.geolibreZhTwOriginalText;
      }
      return;
    }

    let translated = TEXT.get(raw);
    if (!translated) {
      const count = raw.match(/^(\d+)\s+basemaps?$/i);
      if (count) translated = count[1] + " 個底圖";
    }
    if (!translated && CATEGORY.has(raw)) translated = CATEGORY.get(raw);
    if (!translated) return;

    if (el.dataset.geolibreZhTwOriginalText === undefined) {
      el.dataset.geolibreZhTwOriginalText = raw;
    }
    el.textContent = translated;
  }

  function localizeBasemapMeta(el) {
    if (!(el instanceof HTMLElement)) return;
    const raw = (el.textContent || "").trim();
    if (!raw) return;

    if (!isTraditionalChinese()) {
      const original = el.dataset.geolibreZhTwOriginalMeta;
      if (original !== undefined) {
        el.textContent = original;
        delete el.dataset.geolibreZhTwOriginalMeta;
      }
      return;
    }

    const parts = raw.split(" / ");
    if (parts.length < 2) return;
    const last = parts[parts.length - 1];
    const translated = CATEGORY.get(last);
    if (!translated) return;
    if (el.dataset.geolibreZhTwOriginalMeta === undefined) {
      el.dataset.geolibreZhTwOriginalMeta = raw;
    }
    parts[parts.length - 1] = translated;
    el.textContent = parts.join(" / ");
  }

  function localizeSelect(select) {
    if (!(select instanceof HTMLSelectElement)) return;
    localizeAttr(select, "aria-label", "AriaLabel", TEXT);
    for (const option of select.options) localizeTextElement(option);
  }

  function apply(root = document) {
    const scope = root instanceof Element || root instanceof Document ? root : document;
    const elements = scope.querySelectorAll
      ? scope.querySelectorAll(
          [
            ".basemap-control-title",
            ".basemap-control-multiple-toggle-text",
            ".basemap-control-status-message",
            ".basemap-control-empty",
            ".basemap-control-result-type",
            ".basemap-control-settings-heading",
            ".basemap-control-settings-back span",
            ".basemap-control-settings-intro",
            ".basemap-control-status-hint",
            "option",
          ].join(","),
        )
      : [];
    for (const el of elements) localizeTextElement(el);

    const metas = scope.querySelectorAll
      ? scope.querySelectorAll(".basemap-control-result-meta")
      : [];
    for (const el of metas) localizeBasemapMeta(el);

    const inputs = scope.querySelectorAll ? scope.querySelectorAll("input[placeholder]") : [];
    for (const input of inputs) {
      if (!(input instanceof HTMLInputElement)) continue;
      if (!isTraditionalChinese()) {
        const original = input.dataset.geolibreZhTwOriginalPlaceholder;
        if (original !== undefined) {
          input.placeholder = original;
          delete input.dataset.geolibreZhTwOriginalPlaceholder;
        }
      } else {
        const translated = PLACEHOLDER.get(input.placeholder);
        if (translated) {
          if (input.dataset.geolibreZhTwOriginalPlaceholder === undefined) {
            input.dataset.geolibreZhTwOriginalPlaceholder = input.placeholder;
          }
          input.placeholder = translated;
        }
      }
    }

    const selects = scope.querySelectorAll ? scope.querySelectorAll("select") : [];
    for (const select of selects) localizeSelect(select);

    const attrEls = scope.querySelectorAll
      ? scope.querySelectorAll("[title], [aria-label]")
      : [];
    for (const el of attrEls) {
      if (!(el instanceof HTMLElement)) continue;
      localizeAttr(el, "title", "Title", TEXT);
      localizeAttr(el, "aria-label", "AriaLabel", TEXT);
    }
  }

  let scheduled = false;
  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply(document);
    });
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList" || mutation.type === "attributes") {
        scheduleApply();
        break;
      }
    }
  });

  function start() {
    apply(document);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["lang", "title", "aria-label", "placeholder"],
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
