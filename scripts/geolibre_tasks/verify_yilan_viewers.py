"""在自架與官方 GeoLibre 入口執行桌面及 Android viewport QA。"""

from __future__ import annotations

import json
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from PIL import Image
from playwright.sync_api import sync_playwright


def verify_view(out: Path, browser, viewer: str, key: str, mode: str, mobile: bool) -> dict:
    width, height = (412, 915) if mobile else (1440, 960)
    context_args = {
        "viewport": {"width": width, "height": height},
        "screen": {"width": width, "height": height},
        "locale": "zh-TW",
        "is_mobile": mobile,
        "has_touch": mobile,
        "device_scale_factor": 1 if not mobile else 2,
    }
    if mobile:
        context_args["user_agent"] = (
            "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36"
        )
    context = browser.new_context(**context_args)
    page = context.new_page()
    page_errors: list[str] = []
    page.on("pageerror", lambda error: page_errors.append(str(error)[:500]))
    result = {
        "entry": key,
        "viewport": mode,
        "width": width,
        "height": height,
        "android_emulation": mobile,
        "url": viewer,
        "load_state": "not-started",
        "load_errors": "",
        "canvas_visible": False,
        "layer_listed": False,
        "colored_pixel_ratio": 0.0,
        "page_errors": page_errors,
        "passed": False,
    }
    shot_rel = Path("viewer-qa") / f"{key}-{mode}.png"
    shot_path = out / shot_rel
    shot_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        page.goto(viewer, wait_until="domcontentloaded", timeout=90000)
        try:
            page.wait_for_function(
                "document.documentElement.dataset.geolibreLoadState === 'ready' || "
                "document.documentElement.getAttribute('data-geolibre-load-state') === 'ready'",
                timeout=120000,
            )
        except Exception:
            pass
        page.wait_for_timeout(4500)
        result["title"] = page.title()
        result["load_state"] = page.evaluate(
            "document.documentElement.dataset.geolibreLoadState || "
            "document.documentElement.getAttribute('data-geolibre-load-state') || 'missing'"
        )
        result["load_errors"] = page.evaluate(
            "document.documentElement.getAttribute('data-geolibre-load-errors') || "
            "document.documentElement.dataset.geolibreLoadErrors || ''"
        )
        result["canvas_visible"] = page.locator("canvas").evaluate_all(
            "els => els.some(el => { const r=el.getBoundingClientRect(); "
            "return r.width>100 && r.height>100 && getComputedStyle(el).visibility!=='hidden'; })"
        )
        result["layer_listed"] = "公共設施複合災害暴露查核結果" in page.locator("body").inner_text(timeout=20000)
        page.screenshot(path=str(shot_path), full_page=True, animations="disabled")
        image = Image.open(shot_path).convert("RGB")
        pixels = image.resize((min(360, image.width), min(360, image.height)))
        samples = list(pixels.getdata())
        colorful = sum(1 for r, g, b in samples if max(r, g, b) - min(r, g, b) > 18 and max(r, g, b) > 65)
        result["colored_pixel_ratio"] = round(colorful / max(1, len(samples)), 4)
        errors = result["load_errors"]
        result["screenshot"] = shot_rel.as_posix()
        result["passed"] = bool(
            result["load_state"] == "ready"
            and not errors.strip()
            and result["canvas_visible"]
            and result["layer_listed"]
            and result["colored_pixel_ratio"] >= 0.02
            and shot_path.stat().st_size > 20000
        )
    except Exception as exc:
        result["failure"] = f"{type(exc).__name__}: {str(exc)[:1000]}"
        if page_errors:
            result["page_errors"] = page_errors
        try:
            page.screenshot(path=str(shot_path), full_page=True, animations="disabled")
            result["screenshot"] = shot_rel.as_posix()
        except Exception:
            pass
    finally:
        context.close()
    return result


def main() -> int:
    out = Path(sys.argv[1]).resolve()
    project = json.loads((out / "map.geolibre.json").read_text(encoding="utf-8"))
    project_url = project["metadata"]["projectUrl"]
    pages_root = project_url.split("/analysis/", 1)[0] + "/"
    viewers = {
        "self_hosted": f"{pages_root}?locale=zh-TW&url={quote(project_url, safe='')}&loading=true",
        "official": f"https://web.geolibre.app/?url={quote(project_url, safe='')}&layout=viewer&locale=zh-TW&loading=true",
    }
    checks: dict[str, dict[str, dict]] = {key: {} for key in viewers}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for key, url in viewers.items():
            checks[key]["desktop"] = verify_view(out, browser, url, key, "desktop", False)
            checks[key]["android"] = verify_view(out, browser, url, key, "android", True)
        browser.close()
    overall = any(all(checks[key][mode]["passed"] for mode in ("desktop", "android")) for key in viewers)
    payload = {
        "tested_at": datetime.now(timezone.utc).isoformat(),
        "browser": "Playwright Chromium",
        "mobile_definition": "Android 14 Pixel 7 user-agent emulation; 412x915 CSS viewport; touch enabled",
        "project_url": project_url,
        "expected_layer": "公共設施複合災害暴露查核結果",
        "overall_pass": overall,
        "checks": checks,
    }
    qa_dir = out / "viewer-qa"
    qa_dir.mkdir(parents=True, exist_ok=True)
    (qa_dir / "viewer-qa.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    desktop = checks["self_hosted"]["desktop"].get("screenshot")
    if desktop and (out / desktop).exists():
        shutil.copyfile(out / desktop, out / "map-overview.png")
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

