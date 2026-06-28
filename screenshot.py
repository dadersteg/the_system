from playwright.sync_api import sync_playwright
import os

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto(f"file://{os.path.abspath('src/WebApp_Dashboard.html')}")
    page.wait_for_selector('.nav-item')
    page.evaluate("switchTab('messages', document.querySelectorAll('.nav-item')[5])")
    page.wait_for_selector('#sec-messages.active')
    # Let animation settle
    page.wait_for_timeout(500)
    page.locator('#sec-messages').screenshot(path="screenshot.png")
    browser.close()
