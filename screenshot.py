from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 1800}) # set a taller height to see the whole admin page
        page.goto('file:///app/src/WebApp_Dashboard.html')
        page.evaluate("switchTab('admin', document.querySelectorAll('.nav-item')[6])")
        page.wait_for_timeout(1000)
        page.screenshot(path='screenshot.png', full_page=True)
        browser.close()

if __name__ == '__main__':
    run()
