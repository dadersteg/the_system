#!/usr/bin/env python3
import os
import sqlite3
import base64
import shutil
import datetime

db_path = "/Users/daniel/Library/Application Support/Antigravity/User/globalStorage/state.vscdb"
convos_dir = "/Users/daniel/.gemini/antigravity/conversations"

def read_varint(data, pos):
    result = 0
    shift = 0
    while True:
        byte = data[pos]
        pos += 1
        result |= (byte & 0x7f) << shift
        if not (byte & 0x80):
            break
        shift += 7
    return result, pos

def write_varint(val):
    result = bytearray()
    while True:
        towrite = val & 0x7f
        val >>= 7
        if val:
            result.append(towrite | 0x80)
        else:
            result.append(towrite)
            break
    return bytes(result)

def main():
    print("=== Antigravity Sidebar Zombie Convo Pruner ===")
    
    # 1. Check if database exists
    if not os.path.exists(db_path):
        print(f"Error: Database not found at {db_path}")
        return
        
    # 2. Check if locked (VS Code / Antigravity is running)
    # We try to open a connection and get a lock. If it fails, the app is open.
    try:
        conn = sqlite3.connect(db_path, timeout=1.0)
        c = conn.cursor()
        c.execute("BEGIN IMMEDIATE;")
        conn.rollback()
        conn.close()
    except sqlite3.OperationalError as e:
        print("\n[!] ERROR: The Antigravity application appears to be running.")
        print("    You MUST close Antigravity completely before running this script.")
        print("    Please exit the app and run this script again.")
        return
        
    # 3. Create a safety backup
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{db_path}.backup_{timestamp}"
    print(f"Creating database safety backup at:\n  {backup_path}")
    shutil.copy2(db_path, backup_path)
    
    # 4. Connect and fetch trajectorySummaries
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("SELECT value FROM ItemTable WHERE key='antigravityUnifiedStateSync.trajectorySummaries';")
    row = c.fetchone()
    
    if not row:
        print("Error: 'antigravityUnifiedStateSync.trajectorySummaries' key not found in database.")
        conn.close()
        return
        
    raw_val = base64.b64decode(row[0])
    total_len = len(raw_val)
    pos = 0
    
    kept_submessages = []
    dropped_count = 0
    total_count = 0
    
    # Parse repeated fields of the root message
    while pos < total_len:
        tag, pos = read_varint(raw_val, pos)
        field_num = tag >> 3
        wire_type = tag & 0x07
        
        if wire_type == 2:
            length, pos = read_varint(raw_val, pos)
            sub_msg = raw_val[pos:pos+length]
            pos += length
            
            if field_num == 1:
                total_count += 1
                # Parse sub_msg to extract the UUID (field 1 of sub_msg)
                sub_pos = 0
                sub_len = len(sub_msg)
                convo_id = None
                
                while sub_pos < sub_len:
                    sub_tag, sub_pos = read_varint(sub_msg, sub_pos)
                    sub_fn = sub_tag >> 3
                    sub_wt = sub_tag & 0x07
                    if sub_wt == 2:
                        sub_length, sub_pos = read_varint(sub_msg, sub_pos)
                        val = sub_msg[sub_pos:sub_pos+sub_length]
                        sub_pos += sub_length
                        if sub_fn == 1:
                            convo_id = val.decode('utf-8')
                            break
                    else:
                        if sub_wt == 0:
                            _, sub_pos = read_varint(sub_msg, sub_pos)
                        elif sub_wt == 1:
                            sub_pos += 8
                        elif sub_wt == 5:
                            sub_pos += 4
                
                if convo_id:
                    # Check if convo db file exists on disk
                    db_file = os.path.join(convos_dir, f"{convo_id}.db")
                    if os.path.exists(db_file):
                        # Keep it
                        kept_submessages.append(sub_msg)
                    else:
                        print(f"Pruning Zombie: {convo_id}")
                        dropped_count += 1
                else:
                    # Fallback keep if we cannot parse UUID
                    kept_submessages.append(sub_msg)
            else:
                # Keep other root fields if any (unlikely in this model)
                pass
        else:
            # Skip non-wire type 2 root fields
            if wire_type == 0:
                _, pos = read_varint(raw_val, pos)
            elif wire_type == 1:
                pos += 8
            elif wire_type == 5:
                pos += 4
                
    if dropped_count == 0:
        print("\nNo zombie conversations found. Your sidebar cache is clean.")
        conn.close()
        return
        
    # 5. Serialize the kept entries back to a protobuf message
    new_data = bytearray()
    for sub in kept_submessages:
        # Tag for field 1 wire type 2 is 0x0a
        new_data.append(0x0a)
        new_data.extend(write_varint(len(sub)))
        new_data.extend(sub)
        
    # 6. Encode in base64 and write back
    new_base64 = base64.b64encode(new_data).decode('utf-8')
    c.execute(
        "UPDATE ItemTable SET value=? WHERE key='antigravityUnifiedStateSync.trajectorySummaries';",
        (new_base64,)
    )
    conn.commit()
    conn.close()
    
    print(f"\nSUCCESS: Cache pruned! Removed {dropped_count} zombie entries. Retained {len(kept_submessages)} active conversations.")
    print("Please reopen the Antigravity application now.")

if __name__ == "__main__":
    main()
