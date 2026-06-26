with open("src/Code_TheClerk_Drive.js", "r") as f:
    lines = f.readlines()
    start = -1
    end = -1
    for i, line in enumerate(lines):
        if "file.setName(finalName);" in line:
            start = i - 15
        if "if (tasksCreated > 0) {" in line:
            end = i + 10
            break
    if start != -1 and end != -1:
        print("".join(lines[start:end]))
