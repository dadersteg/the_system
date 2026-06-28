from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto('file:///app/src/WebApp_Dashboard.html')

    # Evaluate script to show the breathe section which contains btn-breathe
    page.evaluate("switchTab('breathe', document.querySelectorAll('.nav-item')[2])")

    btn = page.locator('#breathe-start-btn')
    btn.wait_for()

    page.screenshot(path='screenshot2.png', full_page=True)
    btn.screenshot(path='btn_screenshot2.png')

    # hover screenshot
    btn.hover()
    btn.screenshot(path='btn_hover_screenshot2.png')

    browser.close()
