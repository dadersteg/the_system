with open("src/Code_TheClerk_Drive.js", "r") as f:
    content = f.read()
    
# Find the line: const finalName = getLockedName(data, f);
idx = content.find("const finalName = getLockedName(data, f);")
print(content[idx:idx+1500])
