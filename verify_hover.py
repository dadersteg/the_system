from playwright.sync_api import sync_playwright
import os

def capture_hover():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        file_path = f"file://{os.path.abspath('src/WebApp_Dashboard.html')}"

        page.goto(file_path)
        page.click("text=Reflection")
        page.wait_for_timeout(1000)

        # Hover over the first link
        page.hover(".reflection-link-card")
        page.wait_for_timeout(500)

        page.screenshot(path="dashboard_reflection_hover.png")
        browser.close()

if __name__ == "__main__":
    capture_hover()
