import asyncio
import base64
import json
import logging
import os
import html
import datetime
import httpx
import websockets
import subprocess
import re
from io import BytesIO
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes, CallbackQueryHandler

# Setup logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Configuration
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "YOUR_BOT_TOKEN")
ALLOWED_USER_ID_STR = os.getenv("TELEGRAM_USER_ID", "0")
ALLOWED_USER_ID = int(ALLOWED_USER_ID_STR) if ALLOWED_USER_ID_STR.isdigit() else 0
def get_active_cdp_ports() -> list[int]:
    ports = []
    # 1. Check standard DevToolsActivePort files first
    paths = [
        os.path.expanduser("~/Library/Application Support/Antigravity/DevToolsActivePort"),
        os.path.expanduser("~/Library/Application Support/Antigravity IDE/DevToolsActivePort")
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                with open(p, "r") as f:
                    lines = f.readlines()
                    if lines:
                        port = int(lines[0].strip())
                        if port not in ports:
                            ports.append(port)
            except Exception:
                pass
    
    # 2. Fallback: Check active processes via lsof
    try:
        out = subprocess.check_output("lsof -iTCP -sTCP:LISTEN -n -P | grep -iE 'electron|antigrav'", shell=True, text=True)
        for line in out.splitlines():
            match = re.search(r'TCP (?:127\.0\.0\.1|localhost|\*|\[::1\]):(\d+) \(LISTEN\)', line)
            if match:
                port = int(match.group(1))
                if port not in ports:
                    ports.append(port)
    except Exception:
        pass
        
    return ports

TARGET_CONVO = None

def is_authorized(update: Update) -> bool:
    if ALLOWED_USER_ID == 0:
        return False
    return update.effective_user.id == ALLOWED_USER_ID

async def get_ws_url_for_target():
    ports = get_active_cdp_ports()
    if not ports:
        ports = [9333] # Fallback port
        
    for port in ports:
        cdp_url = f"http://localhost:{port}/json"
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get(cdp_url)
                if resp.status_code != 200:
                    continue
                pages = resp.json()
                if not isinstance(pages, list):
                    continue
                
                ws_urls = [(p.get("webSocketDebuggerUrl"), p.get("title", "")) for p in pages if (p.get("url", "").split("?")[0].endswith("workbench.html") or p.get("type") == "page") and "webSocketDebuggerUrl" in p]
                if not ws_urls:
                    continue
                
                if TARGET_CONVO:
                    target_lower = TARGET_CONVO.lower()
                    for url, title in ws_urls:
                        if target_lower in title.lower():
                            return url
                            
                for url, title in ws_urls:
                    try:
                        async with websockets.connect(url, open_timeout=1) as ws:
                            await ws.send(json.dumps({
                                "id": 1,
                                "method": "Runtime.evaluate",
                                "params": {"expression": "document.hasFocus()", "returnByValue": True}
                            }))
                            res = json.loads(await asyncio.wait_for(ws.recv(), timeout=1.0))
                            if res.get("result", {}).get("result", {}).get("value") == True:
                                return url
                    except Exception:
                        continue
                        
                # If no tab is focused, just return the first valid websocket URL from this port
                if ws_urls:
                    return ws_urls[0][0]
        except Exception:
            continue
            
    logger.error("Failed to find any valid CDP WebSocket URL.")
    return None

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_authorized(update): return
    await update.message.reply_text(
        "🚀 Antigravity Live Bridge Connected.\n\n"
        "Available commands:\n"
        "/overview - Show current active workspace & status\n"
        "/status - Show current active workspace & status\n"
        "/prompt <task> - Inject task directly into Antigravity\n"
        "/screenshot - Request live visual update\n"
        "/target <workspace> - Lock bot to a specific workspace"
    )

async def set_target(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_authorized(update): return
    global TARGET_CONVO
    name = " ".join(context.args)
    if not name:
        await update.message.reply_text("Usage: /target <Exact Conversation Title>")
        return
    TARGET_CONVO = name
    await update.message.reply_text(f"🎯 Target: '{TARGET_CONVO}'")

async def send_control_panel(update: Update, text: str, photo_bytes: bytes = None):
    keyboard = [
        [
            InlineKeyboardButton("✅ Approve", callback_data='approve'),
            InlineKeyboardButton("❌ Reject", callback_data='reject'),
        ],
        [
            InlineKeyboardButton("👍 Proceed", callback_data='proceed'),
            InlineKeyboardButton("📸 Screenshot", callback_data='screenshot')
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    msg = update.callback_query.message if update.callback_query else update.message
    
    if photo_bytes:
        await msg.reply_photo(photo=BytesIO(photo_bytes), caption=text, reply_markup=reply_markup)
    else:
        await msg.reply_text(text, reply_markup=reply_markup)

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    if not is_authorized(update): return
    await query.answer()
    
    if query.data == 'approve':
        await approve(update, context)
    elif query.data == 'reject':
        await reject(update, context)
    elif query.data == 'screenshot':
        await screenshot(update, context)
    elif query.data == 'proceed':
        await proceed(update, context)
    elif query.data == 'overview_refresh':
        await overview_refresh(update, context)

async def inject_text_and_enter(text: str) -> str:
    ws_url = await get_ws_url_for_target()
    if not ws_url:
        return "Bridge offline"

    try:
        async with websockets.connect(ws_url) as ws:
            safe_text = json.dumps(text)
            
            script = f"""
            (function() {{
                const text = {safe_text};
                
                // 1. Try to handle ask_question modal
                const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Submit');
                if (submitBtn) {{
                    const skipBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Skip');
                    if (text.trim().toLowerCase() === 'skip' && skipBtn) {{
                        skipBtn.click();
                        return "Submitted";
                    }}
                    
                    const num = parseInt(text.trim());
                    const options = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
                    
                    if (!isNaN(num) && num > 0 && num <= options.length) {{
                        options[num - 1].click();
                        submitBtn.click();
                        return "Submitted";
                    }}
                    
                    const textInputs = Array.from(document.querySelectorAll('textarea, input[type="text"]'));
                    const visibleInput = textInputs.find(i => i.offsetParent !== null && !i.disabled);
                    if (visibleInput) {{
                        visibleInput.focus();
                        document.execCommand('insertText', false, text);
                        submitBtn.click();
                        return "Submitted";
                    }}
                }}

                // 2. Fallback to normal chat input
                const inputs = Array.from(document.querySelectorAll('[aria-label="Message input"]'));
                const input = inputs[0]; 
                if (!input) return "Missing chat input";
                input.focus();
                document.execCommand('insertText', false, text);
                return "Ready";
            }})();
            """
            await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": script, "returnByValue": True}}))
            res = json.loads(await ws.recv())
            res_val = res.get("result", {}).get("result", {}).get("value")
            
            if res_val == "Submitted":
                return "Success"
            elif res_val != "Ready":
                return "Missing chat input. Please ensure a chat tab is active."
                
            await asyncio.sleep(0.2)
            
            await ws.send(json.dumps({
                "id": 2, "method": "Input.dispatchKeyEvent",
                "params": {"type": "keyDown", "windowsVirtualKeyCode": 13, "key": "Enter", "text": "\r"}
            }))
            await ws.recv()
            await ws.send(json.dumps({
                "id": 3, "method": "Input.dispatchKeyEvent",
                "params": {"type": "keyUp", "windowsVirtualKeyCode": 13, "key": "Enter"}
            }))
            await ws.recv()
            
            return "Success"
            
    except Exception as e:
        logger.error(f"Injection error: {e}")
        return f"Error: {e}"

async def get_chat_length(ws_url: str) -> int:
    try:
        async with websockets.connect(ws_url) as ws:
            script = """
            (function() {
                const inputs = Array.from(document.querySelectorAll('[aria-label="Message input"]'));
                if (inputs.length === 0) return 0;
                const container = inputs[0].closest('.antigravity-agent-side-panel') || document.body;
                return container.innerText.length;
            })();
            """
            await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": script, "returnByValue": True}}))
            res = json.loads(await ws.recv())
            val = res.get("result", {}).get("result", {}).get("value")
            return int(val) if isinstance(val, (int, float)) else 0
    except Exception:
        return 0

async def monitor_response(update: Update, ws_url: str):
    await asyncio.sleep(1) # Wait for prompt to register in UI
    initial_len = await get_chat_length(ws_url)
    
    started = False
    current_len = initial_len
    # Wait up to 60 seconds for generation to start (length changes)
    for _ in range(20):
        await asyncio.sleep(3)
        current_len = await get_chat_length(ws_url)
        if current_len != initial_len:
            started = True
            break
            
    if not started: return
    
    # Wait for generation to finish (stable for 9 seconds)
    stable_count = 0
    while stable_count < 3:
        await asyncio.sleep(3)
        new_len = await get_chat_length(ws_url)
        if new_len == current_len:
            stable_count += 1
        else:
            stable_count = 0
            current_len = new_len
            
    # Notify user
    data = await capture_screenshot()
    await send_control_panel(update, "🔔 Update", photo_bytes=data)

async def prompt(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_authorized(update): return
    text = " ".join(context.args)
    if not text:
        await update.message.reply_text("Usage: /prompt <task>")
        return
        
    result = await inject_text_and_enter(text)
    if result == "Success":
        msg = f"✅ Message delivered!"
        if TARGET_CONVO:
            msg += f"\n📍 Routed to workspace: `{TARGET_CONVO}`"
        await send_control_panel(update, msg)
        
        ws_url = await get_ws_url_for_target()
        if ws_url:
            asyncio.create_task(monitor_response(update, ws_url))
    else:
        await update.message.reply_text(f"⚠️ {result}")

async def proceed(update: Update, context: ContextTypes.DEFAULT_TYPE):
    result = await inject_text_and_enter("Ok, proceed.")
    msg = update.callback_query.message if update.callback_query else update.message
    if result == "Success":
        await send_control_panel(update, "✅ Sent 'Ok, proceed.'")
        
        ws_url = await get_ws_url_for_target()
        if ws_url:
            asyncio.create_task(monitor_response(update, ws_url))
    else:
        await msg.reply_text(f"⚠️ {result}")

async def approve(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ws_url = await get_ws_url_for_target()
    if not ws_url: return
    try:
        async with websockets.connect(ws_url) as ws:
            script = """
            (function() {
                const btn = Array.from(document.querySelectorAll('button')).find(b => 
                    b.innerText.includes('Accept Changes') || b.innerText.includes('Accept All') || b.innerText.includes('Accept')
                );
                if (btn) { btn.click(); return "Success"; }
                return "No 'Accept' button found";
            })();
            """
            await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": script, "returnByValue": True}}))
            res = json.loads(await ws.recv())
            val = res.get("result", {}).get("result", {}).get("value")
            msg = update.callback_query.message if update.callback_query else update.message
            await msg.reply_text(f"✅ Changes Accepted" if val == "Success" else f"⚠️ {val}")
    except Exception as e:
        logger.error(f"Approve error: {e}")

async def reject(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ws_url = await get_ws_url_for_target()
    if not ws_url: return
    try:
        async with websockets.connect(ws_url) as ws:
            script = """
            (function() {
                const btn = Array.from(document.querySelectorAll('button')).find(b => 
                    b.innerText.trim() === 'Reject' || b.innerText.includes('Discard')
                );
                if (btn) { btn.click(); return "Success"; }
                return "No 'Reject' button found";
            })();
            """
            await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": script, "returnByValue": True}}))
            res = json.loads(await ws.recv())
            val = res.get("result", {}).get("result", {}).get("value")
            msg = update.callback_query.message if update.callback_query else update.message
            await msg.reply_text(f"❌ Changes Rejected" if val == "Success" else f"⚠️ {val}")
    except Exception as e:
        logger.error(f"Reject error: {e}")

async def get_overview_data():
    try:
        cdp_url = get_cdp_url()
        async with httpx.AsyncClient() as client:
            resp = await client.get(cdp_url)
            pages = resp.json()
    except Exception as e:
        return f"⚠️ Failed to connect to CDP: {e}", None

    ws_urls = [(p["webSocketDebuggerUrl"], p.get("title", ""), p.get("url", "")) 
               for p in pages 
               if p.get("url", "").split("?")[0].endswith("workbench.html") or p.get("type") == "page"]
               
    if not ws_urls:
        return "📭 No active Antigravity workspaces found.", None
        
    active_url = None
    active_title = ""
    active_page_url = ""
    
    global TARGET_CONVO
    if TARGET_CONVO:
        target_lower = TARGET_CONVO.lower()
        for url, title, purl in ws_urls:
            if target_lower in title.lower():
                active_url = url
                active_title = title
                active_page_url = purl
                break
                
    if not active_url:
        for url, title, purl in ws_urls:
            try:
                async with websockets.connect(url) as ws:
                    await ws.send(json.dumps({
                        "id": 1,
                        "method": "Runtime.evaluate",
                        "params": {"expression": "document.hasFocus()", "returnByValue": True}
                    }))
                    res = json.loads(await ws.recv())
                    if res.get("result", {}).get("result", {}).get("value") == True:
                        active_url = url
                        active_title = title
                        active_page_url = purl
                        break
            except Exception:
                continue
                
    if not active_url:
        active_url, active_title, active_page_url = ws_urls[0]
        
    is_working = False
    chat_tail = ""
    
    try:
        async with websockets.connect(active_url) as ws:
            script = """
            (function() {
                const input = document.querySelector('[aria-label="Message input"]');
                if (!input) return { error: "No input found" };
                
                const divs = Array.from(document.querySelectorAll('div'));
                const scrollPanels = divs.filter(d => 
                    d.className && 
                    d.className.includes('overflow-y-auto') && 
                    d.contains(input) && 
                    !d.className.includes('cursor-text') &&
                    d.id !== "antigravity.agentSidePanelInputBox"
                );
                
                let fullText = "";
                if (scrollPanels.length > 0) {
                    fullText = scrollPanels[0].innerText || "";
                } else {
                    fullText = document.body.innerText || "";
                }
                
                const isWorking = document.body.innerText.includes("Working...") || 
                                  document.body.innerText.includes("Working.") ||
                                  !!document.querySelector('.animate-dot-bounce');
                
                return {
                    isWorking: isWorking,
                    fullText: fullText
                };
            })();
            """
            await ws.send(json.dumps({
                "id": 1,
                "method": "Runtime.evaluate",
                "params": {"expression": script, "returnByValue": True}
            }))
            res = json.loads(await ws.recv())
            res_val = res.get("result", {}).get("result", {}).get("value")
            
            if res_val and "error" not in res_val:
                is_working = res_val.get("isWorking", False)
                full_text = res_val.get("fullText", "")
                parts = full_text.split("Ask anything, @ to mention, / for actions")
                chat_part = parts[0].strip()
                chat_tail = chat_part[-800:] if len(chat_part) > 800 else chat_part
            else:
                chat_tail = "Could not extract chat history."
    except Exception as e:
        chat_tail = f"Error communicating with target: {e}"
        
    status_emoji = "⏳ Working" if is_working else "💤 Idle"
    msg = f"🎯 <b>Active Workspace:</b> {html.escape(active_title)}\n"
    msg += f"ℹ️ <b>Status:</b> {status_emoji}\n\n"
    
    if chat_tail:
        msg += f"📝 <b>Latest Activity:</b>\n<pre>{html.escape(chat_tail)}</pre>\n"
        
    other_ws = [t for u, t, p in ws_urls if u != active_url]
    if other_ws:
        msg += f"\n📂 <b>Other Open Workspaces:</b>\n"
        for title in other_ws:
            msg += f"- {html.escape(title)}\n"
            
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    msg += f"\n🕒 <b>Updated:</b> {now_str}"
            
    keyboard = [
        [
            InlineKeyboardButton("📸 Screenshot", callback_data='screenshot'),
            InlineKeyboardButton("🔄 Refresh", callback_data='overview_refresh')
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    return msg, reply_markup

async def overview(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_authorized(update): return
    msg, reply_markup = await get_overview_data()
    await update.message.reply_text(msg, parse_mode='HTML', reply_markup=reply_markup)

async def overview_refresh(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    if not is_authorized(update): return
    msg, reply_markup = await get_overview_data()
    try:
        await query.edit_message_text(msg, parse_mode='HTML', reply_markup=reply_markup)
    except Exception as e:
        if "Message is not modified" in str(e):
            pass
        else:
            logger.error(f"Failed to edit message: {e}")

async def capture_screenshot() -> bytes:
    ws_url = await get_ws_url_for_target()
    if not ws_url: return None
    try:
        async with websockets.connect(ws_url, max_size=10**8) as ws:
            await ws.send(json.dumps({"id": 2, "method": "Page.captureScreenshot"}))
            res = json.loads(await ws.recv())
            data = res.get("result", {}).get("data")
            if data:
                return base64.b64decode(data)
    except Exception as e:
        logger.error(f"Screenshot error: {e}")
    return None

async def screenshot(update: Update, context: ContextTypes.DEFAULT_TYPE):
    data = await capture_screenshot()
    if data:
        msg = update.callback_query.message if update.callback_query else update.message
        await msg.reply_photo(photo=BytesIO(data), caption="📸 Live State")

async def main():
    if BOT_TOKEN == "YOUR_BOT_TOKEN": return
    application = ApplicationBuilder().token(BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("prompt", prompt))
    application.add_handler(CommandHandler("target", set_target))
    application.add_handler(CommandHandler("screenshot", screenshot))
    application.add_handler(CommandHandler("overview", overview))
    application.add_handler(CommandHandler("status", overview))
    application.add_handler(CallbackQueryHandler(button_handler))
    
    await application.initialize()
    await application.start()
    await application.updater.start_polling()
    try:
        while True: await asyncio.sleep(3600)
    except asyncio.CancelledError: pass
    finally:
        await application.updater.stop()
        await application.stop()
        await application.shutdown()

if __name__ == '__main__':
    asyncio.run(main())
