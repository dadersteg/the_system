with open("src/Code_TheClerk_Drive.js", "r") as f:
    content = f.read()

target = "const urls = sheet.getRange(2, 1, lastRow - 1, 1).getValues();"
replacement = "const urls = sheet.getRange(2, 2, lastRow - 1, 1).getValues(); // Fix: URL is column 2 (B), not 1 (A)"

if target in content:
    content = content.replace(target, replacement)
    with open("src/Code_TheClerk_Drive.js", "w") as f:
        f.write(content)
    print("Patch applied successfully.")
else:
    print("Target string not found in Code_TheClerk_Drive.js")
