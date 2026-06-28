from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("file:///app/src/WebApp_Dashboard.html")

    # Switch to the Admin tab
    page.evaluate("switchTab('admin', document.querySelectorAll('.nav-item')[5])")
    page.wait_for_timeout(500)

    # Get computed styles of the first legacy card
    styles = page.evaluate('''() => {
        const el = document.querySelector('.legacy-card');
        const style = window.getComputedStyle(el);
        const title = el.querySelector('.legacy-card-title');
        const titleStyle = window.getComputedStyle(title);

        return {
            backgroundColor: style.backgroundColor,
            minHeight: style.minHeight,
            transition: style.transition,
            titleFontFamily: titleStyle.fontFamily,
            titleColor: titleStyle.color,
            titleLetterSpacing: titleStyle.letterSpacing
        };
    }''')

    print(json.dumps(styles, indent=2))
    browser.close()
