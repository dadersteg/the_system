import json
import os
import time

def generate_empty_bookmarks():
    with open('docs/LOS_Taxonomy.json', 'r', encoding='utf-8') as f:
        taxonomy = json.load(f)

    # Windows epoch microseconds (Chrome format)
    timestamp = str(int((time.time() + 11644473600) * 1000000))

    l1_nodes = {}
    
    for row in taxonomy:
        l1_code = row.get("L1 Code")
        if not l1_code or l1_code.startswith("00") or l1_code.startswith("99"):
            continue
            
        l1_name = row.get("L1 Name", "")
        if "Unknown" in l1_name or "Unknown" in l1_code:
            continue
            
        l1_key = f"{l1_code} {l1_name}".strip()
        
        if l1_key not in l1_nodes:
            l1_nodes[l1_key] = {
                "date_added": timestamp,
                "date_last_used": "0",
                "date_modified": timestamp,
                "id": str(hash(l1_key) % 100000 + 1000),
                "name": l1_key,
                "type": "folder",
                "children": [],
                "_l2_nodes": {}
            }
            
        l2_code = row.get("L2 Code")
        l2_name = row.get("L2 Name", "")
        if l2_code and l2_name:
            l2_key = f"{l2_code} {l2_name}".strip()
            if l2_key not in l1_nodes[l1_key]["_l2_nodes"]:
                l2_node = {
                    "date_added": timestamp,
                    "date_last_used": "0",
                    "date_modified": timestamp,
                    "id": str(hash(l1_key + l2_key) % 100000 + 2000),
                    "name": l2_key,
                    "type": "folder",
                    "children": [],
                    "_l3_nodes": set()
                }
                l1_nodes[l1_key]["_l2_nodes"][l2_key] = l2_node
                l1_nodes[l1_key]["children"].append(l2_node)
                
            l3_code = row.get("L3 Code")
            l3_name = row.get("L3 Name", "")
            if l3_code and l3_name:
                l3_key = f"{l3_code} {l3_name}".strip()
                if l3_key not in l1_nodes[l1_key]["_l2_nodes"][l2_key]["_l3_nodes"]:
                    l1_nodes[l1_key]["_l2_nodes"][l2_key]["_l3_nodes"].add(l3_key)
                    l3_node = {
                        "date_added": timestamp,
                        "date_last_used": "0",
                        "date_modified": timestamp,
                        "id": str(hash(l1_key + l2_key + l3_key) % 100000 + 3000),
                        "name": l3_key,
                        "type": "folder",
                        "children": []
                    }
                    l1_nodes[l1_key]["_l2_nodes"][l2_key]["children"].append(l3_node)

    bookmark_bar_children = []
    for l1 in l1_nodes.values():
        for l2 in l1["_l2_nodes"].values():
            del l2["_l3_nodes"]
            l2["children"].sort(key=lambda x: x["name"])
        del l1["_l2_nodes"]
        l1["children"].sort(key=lambda x: x["name"])
        bookmark_bar_children.append(l1)
        
    bookmark_bar_children.sort(key=lambda x: x["name"])
    
    # Add a real dummy bookmark to ensure Chrome parses it as non-empty
    dummy_bookmark = {
        "date_added": timestamp,
        "date_last_used": "0",
        "id": "99999",
        "name": "LOS Master System",
        "type": "url",
        "url": "https://www.google.com"
    }
    bookmark_bar_children.insert(0, dummy_bookmark)

    bookmarks_data = {
        "checksum": "",
        "roots": {
            "bookmark_bar": {
                "children": bookmark_bar_children,
                "date_added": timestamp,
                "date_last_used": "0",
                "date_modified": timestamp,
                "id": "1",
                "name": "Bookmarks bar",
                "type": "folder"
            },
            "other": {
                "children": [],
                "date_added": timestamp,
                "date_last_used": "0",
                "date_modified": timestamp,
                "id": "2",
                "name": "Other bookmarks",
                "type": "folder"
            },
            "synced": {
                "children": [],
                "date_added": timestamp,
                "date_last_used": "0",
                "date_modified": timestamp,
                "id": "3",
                "name": "Mobile bookmarks",
                "type": "folder"
            }
        },
        "version": 1
    }
    
    os.makedirs('docs/Bookmarks', exist_ok=True)
    with open('docs/Bookmarks/Empty_LOS_Bookmarks_V6.json', 'w', encoding='utf-8') as f:
        json.dump(bookmarks_data, f, indent=4, ensure_ascii=False)
        
    chrome_path = os.path.expanduser('~/Library/Application Support/Google/Chrome/Profile 1/Bookmarks')
    if os.path.exists(chrome_path):
        with open(chrome_path, 'w', encoding='utf-8') as f:
            json.dump(bookmarks_data, f, indent=4, ensure_ascii=False)

if __name__ == '__main__':
    generate_empty_bookmarks()
