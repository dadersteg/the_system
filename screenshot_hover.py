import sys
from playwright.sync_api import sync_playwright

def capture_screenshot():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("file:///app/src/WebApp_Dashboard.html")
        page.wait_for_load_state("networkidle")

        # Hover over the first quick link chip
        try:
            # We don't have real data populated so we will just create a quick link element for testing hover
            page.evaluate("""
                const container = document.getElementById('quick-links-container');
                const chip = document.createElement('a');
                chip.className = 'quick-link-chip';
                chip.innerText = 'Test Chip';
                chip.href = '#';
                container.appendChild(chip);
            """)
            page.hover('.quick-link-chip')
        except Exception as e:
            print("Error hovering:", e)

        page.screenshot(path="screenshot_hover.png")
        browser.close()

if __name__ == "__main__":
    capture_screenshot()
