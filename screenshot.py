import sys
from playwright.sync_api import sync_playwright

def capture_screenshot():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("file:///app/src/WebApp_Dashboard.html")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="screenshot.png", full_page=True)
        browser.close()

if __name__ == "__main__":
    capture_screenshot()
