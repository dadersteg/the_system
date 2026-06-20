from playwright.sync_api import sync_playwright
import os

def capture_screenshot():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        file_path = f"file://{os.path.abspath('src/WebApp_Dashboard.html')}"

        page.goto(file_path)

        # Click on the Reflection tab to make it visible
        page.click("text=Reflection")

        # Wait a bit for the animation to finish
        page.wait_for_timeout(1000)

        # Take a screenshot
        page.screenshot(path="dashboard_reflection_screenshot.png")

        browser.close()

if __name__ == "__main__":
    capture_screenshot()
