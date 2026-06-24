with open("src/Code_TaskEngine.js", "r") as f:
    content = f.read()

target1 = 'const normFinalTitle = (t.title || "").replace(/\\s+/g, " ").trim();'
new1 = 'const normFinalTitle = (t.title || "").replace(/(?:\\[(?:DEADLINE|DURATION|GOAL):[^\\]]*\\]\\s*\\|?\\s*)+/g, "").replace(/\\s+/g, " ").trim();'

target2 = 'const normFinalTitle = finalTitle.replace(/\\s+/g, " ").trim();'
new2 = 'const normFinalTitle = finalTitle.replace(/(?:\\[(?:DEADLINE|DURATION|GOAL):[^\\]]*\\]\\s*\\|?\\s*)+/g, "").replace(/\\s+/g, " ").trim();'

content = content.replace(target1, new1)
content = content.replace(target2, new2)

with open("src/Code_TaskEngine.js", "w") as f:
    f.write(content)

print("Patched.")
