from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 375, "height": 812})  # Mobile viewport
        page.goto("file:///app/src/WebApp_Dashboard.html")

        # Wait for the section to be visible and scroll it into view
        locator = page.locator("#sec-messages")

        # In this dashboard, sections are hidden until their tab is clicked
        # We need to run the javascript function to switch tab
        page.evaluate("switchTab('messages', document.querySelectorAll('.nav-item')[5])")

        # Wait a moment for animation
        page.wait_for_timeout(500)

        # Capture the wifie-message-box area
        box = page.locator("#wifie-message-box")
        box.hover()
        page.wait_for_timeout(200) # Wait for hover effect
        box.screenshot(path="wifie-message-box-hover.png")

        box.focus()
        page.wait_for_timeout(200) # Wait for focus effect
        locator.screenshot(path="wifie-messages-section.png")

        browser.close()

run()
