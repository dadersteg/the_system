import json
import os

def generate_extension_data():
    with open('docs/LOS_Taxonomy.json', 'r', encoding='utf-8') as f:
        taxonomy = json.load(f)

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
                "name": l1_key,
                "children": [],
                "_l2_nodes": {}
            }
            
        l2_code = row.get("L2 Code")
        l2_name = row.get("L2 Name", "")
        if l2_code and l2_name:
            l2_key = f"{l2_code} {l2_name}".strip()
            if l2_key not in l1_nodes[l1_key]["_l2_nodes"]:
                l2_node = {
                    "name": l2_key,
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
                        "name": l3_key,
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

    with open('scratch/bookmark_ext/extension_data.json', 'w', encoding='utf-8') as f:
        json.dump(bookmark_bar_children, f, indent=4, ensure_ascii=False)

if __name__ == '__main__':
    generate_extension_data()
