from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 1024})
    page.goto('file:///app/src/WebApp_Dashboard.html')

    # We will click the 'Daily Tasks' link in the sidebar to see the first legacy card
    page.locator('.nav-item').nth(1).click()
    page.wait_for_timeout(1000)

    page.screenshot(path='screenshot_full.png')

    # Hover over the first legacy card and take another screenshot
    card = page.locator('.legacy-card').first
    if card.is_visible():
        card.hover()
        page.wait_for_timeout(500)
        page.screenshot(path='screenshot_hover.png')
        print("Hovered and screenshot taken!")
    else:
        print("Legacy card not visible!")

    browser.close()
