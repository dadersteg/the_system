import json
import os
import time

def generate_empty_html_bookmarks():
    with open('docs/LOS_Taxonomy.json', 'r', encoding='utf-8') as f:
        taxonomy = json.load(f)

    timestamp = str(int(time.time()))

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

    os.makedirs('docs/Bookmarks', exist_ok=True)
    with open('docs/Bookmarks/V6_Empty_LOS_Bookmarks.html', 'w', encoding='utf-8') as f:
        f.write('<!DOCTYPE NETSCAPE-Bookmark-file-1>\\n')
        f.write('<!-- This is an automatically generated file.\\n')
        f.write('     It will be read and overwritten.\\n')
        f.write('     DO NOT EDIT! -->\\n')
        f.write('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\\n')
        f.write('<TITLE>Bookmarks</TITLE>\\n')
        f.write('<H1>Bookmarks</H1>\\n')
        f.write('<DL><p>\\n')
        f.write(f'    <DT><H3 ADD_DATE="{timestamp}" LAST_MODIFIED="{timestamp}" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>\\n')
        f.write('    <DL><p>\\n')

        # Dummy bookmark to force Chrome to import the file using a standard https URL
        f.write(f'        <DT><A HREF="https://www.google.com" ADD_DATE="{timestamp}">LOS System Initialization</A>\\n')

        def write_node(node, indent_level):
            indent = "    " * indent_level
            f.write(f'{indent}<DT><H3 ADD_DATE="{timestamp}" LAST_MODIFIED="{timestamp}">{node["name"]}</H3>\\n')
            f.write(f'{indent}<DL><p>\\n')
            for child in node.get("children", []):
                write_node(child, indent_level + 1)
            f.write(f'{indent}</DL><p>\\n')

        for l1 in bookmark_bar_children:
            write_node(l1, 2)
            
        f.write('    </DL><p>\\n')
        f.write('</DL><p>\\n')

if __name__ == '__main__':
    generate_empty_html_bookmarks()
