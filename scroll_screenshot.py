from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1200, "height": 800})
    page.goto("file:///app/src/WebApp_Dashboard.html")
    # Switch to the Admin tab
    page.evaluate("switchTab('admin', document.querySelectorAll('.nav-item')[5])")
    page.wait_for_timeout(500)

    # Scroll to the bottom to see legacy cards
    page.evaluate("document.querySelector('.main-content').scrollTop = document.querySelector('.main-content').scrollHeight")
    page.wait_for_timeout(500)

    # Hover over the last legacy-card
    card = page.locator(".legacy-card").last
    card.hover()
    page.wait_for_timeout(500)

    page.screenshot(path="admin_screenshot.png")
    browser.close()
