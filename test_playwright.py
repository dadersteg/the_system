from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto('file:///app/src/WebApp_Dashboard.html')
    page.screenshot(path='screenshot.png')
    browser.close()
