from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1200, "height": 800})
    page.goto("file:///app/src/WebApp_Dashboard.html")
    # Switch to the tasks tab
    page.evaluate("switchTab('tasks', document.querySelectorAll('.nav-item')[1])")
    page.wait_for_timeout(500)

    # Hover over the first legacy-card
    card = page.locator(".legacy-card").first
    card.hover()
    page.wait_for_timeout(500) # wait for animation

    page.screenshot(path="hover_screenshot.png")
    browser.close()
