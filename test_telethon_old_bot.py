import asyncio
from telethon import TelegramClient

API_ID = '33050684'
API_HASH = '1393356aa89a0b7c94ed849293b50944'
SESSION_NAME = '/Users/daniel/Developer/the_system/TS_telethon_session'

async def main():
    client = TelegramClient(SESSION_NAME, API_ID, API_HASH)
    await client.connect()
    
    chat = await client.get_entity(8624910336)
    messages = await client.get_messages(chat, limit=10)
    print("Messages from old bot (8624910336):")
    for m in messages:
        print(f"[{m.date}] {m.raw_text[:50] if m.raw_text else '<media>'}")

    await client.disconnect()

if __name__ == '__main__':
    asyncio.run(main())
