import asyncio
from telethon import TelegramClient

API_ID = '33050684'
API_HASH = '1393356aa89a0b7c94ed849293b50944'
SESSION_NAME = '/Users/daniel/Developer/the_system/TS_telethon_session'

async def main():
    client = TelegramClient(SESSION_NAME, API_ID, API_HASH)
    await client.connect()
    if not await client.is_user_authorized():
        print("User is not authorized!")
        return

    # Check the chat with the SMS relay bot (8971429996)
    try:
        chat = await client.get_entity(8971429996)
        print("Found chat:", chat.title if hasattr(chat, 'title') else chat.username)
        messages = await client.get_messages(chat, limit=5)
        for m in messages:
            print(f"[{m.date}] {m.raw_text}")
    except Exception as e:
        print("Error getting messages:", e)
        
    await client.disconnect()

if __name__ == '__main__':
    asyncio.run(main())
