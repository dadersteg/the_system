from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1200, "height": 800})
    page.goto("file:///app/src/WebApp_Dashboard.html")
    # Switch to the tasks tab or scroll to where legacy-cards are visible
    page.evaluate("switchTab('tasks', document.querySelectorAll('.nav-item')[1])")
    page.wait_for_timeout(500)
    # Scroll down slightly to make sure the cards are visible
    page.evaluate("window.scrollBy(0, 500)")
    page.wait_for_timeout(500)
    page.screenshot(path="screenshot.png")
    browser.close()
