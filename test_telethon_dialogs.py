import asyncio
from telethon import TelegramClient

API_ID = '33050684'
API_HASH = '1393356aa89a0b7c94ed849293b50944'
SESSION_NAME = '/Users/daniel/Developer/the_system/TS_telethon_session'

async def main():
    client = TelegramClient(SESSION_NAME, API_ID, API_HASH)
    await client.connect()
    
    dialogs = await client.get_dialogs(limit=20)
    for d in dialogs:
        try:
            print(f"[{d.entity.id}] {getattr(d.entity, 'username', 'No-username')} - {d.title}")
            if d.entity.id == 8971429996:
                print("FOUND THE BOT!")
                messages = await client.get_messages(d.entity, limit=5)
                for m in messages:
                    print(f"  -> [{m.date}] {m.raw_text}")
        except Exception as e:
            pass

    await client.disconnect()

if __name__ == '__main__':
    asyncio.run(main())
