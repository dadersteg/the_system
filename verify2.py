from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # using a wider desktop viewport to not clip the textarea in case mobile wraps
        page = browser.new_page(viewport={"width": 1024, "height": 768})
        page.goto("file:///app/src/WebApp_Dashboard.html")

        # In this dashboard, sections are hidden until their tab is clicked
        page.evaluate("switchTab('messages', document.querySelectorAll('.nav-item')[5])")
        page.wait_for_timeout(500)

        locator = page.locator("#sec-messages")

        box = page.locator("#wifie-message-box")

        box.hover()
        page.wait_for_timeout(200) # Wait for hover effect
        locator.screenshot(path="wifie-messages-desktop.png")

        box.focus()
        page.wait_for_timeout(200) # Wait for focus effect
        locator.screenshot(path="wifie-messages-focus.png")

        browser.close()

run()
