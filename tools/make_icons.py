"""Render icon.svg to icons/icon-192.png and icons/icon-512.png with Playwright.

Run: ~/projects/ai-tool-venv/bin/python3 tools/make_icons.py
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
svg = (ROOT / "icon.svg").read_text()

with sync_playwright() as p:
    browser = p.chromium.launch()
    for size in (192, 512):
        page = browser.new_page(viewport={"width": size, "height": size})
        page.set_content(f"<style>body{{margin:0}}svg{{width:{size}px;height:{size}px;display:block}}</style>{svg}")
        page.screenshot(path=str(ROOT / "icons" / f"icon-{size}.png"))
        page.close()
        print(f"icon-{size}.png")
    browser.close()
