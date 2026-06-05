stripped = "| title | | coo title | coo notes | strat | status | date |"
cells = [c.strip() for c in stripped.split('|')[1:-1]]
print("cells:", cells)
print("not cells[0]:", not cells[0])
print("not cells[1]:", not cells[1])
