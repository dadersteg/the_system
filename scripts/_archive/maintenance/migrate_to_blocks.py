import os
import glob

SYNTHESIS_BASE_DIR = os.path.expanduser("~/Documents/AGY/the_system/docs/second_brain_synthesis")
MONTHLY_DIR = os.path.join(SYNTHESIS_BASE_DIR, "monthly")
YEARLY_DIR = os.path.join(SYNTHESIS_BASE_DIR, "yearly")

def get_5_year_block(year_str):
    year_int = int(year_str)
    start_year = year_int - ((year_int - 1) % 5)
    return f"{start_year}-{start_year+4}"

def migrate_monthly():
    monthly_files = sorted(glob.glob(os.path.join(MONTHLY_DIR, "*_insight.md")))
    if not monthly_files:
        print("No individual monthly files found to migrate.")
        return

    # Filter out any files that are already block files (e.g. 2021-2025_Monthly_Rollups.md)
    old_files = [f for f in monthly_files if "Monthly_Rollups" not in f]
    
    blocks = {}
    for filepath in old_files:
        filename = os.path.basename(filepath)
        month_str = filename.replace("_insight.md", "")
        year_str = month_str.split("-")[0]
        
        block = get_5_year_block(year_str)
        if block not in blocks:
            blocks[block] = []
            
        with open(filepath, 'r') as f:
            content = f.read().strip()
            
        blocks[block].append((month_str, content))
        
    for block, items in blocks.items():
        out_path = os.path.join(MONTHLY_DIR, f"{block}_Monthly_Rollups.md")
        # Ensure we write chronologically
        items.sort(key=lambda x: x[0])
        
        with open(out_path, 'w') as f_out:
            for month_str, content in items:
                f_out.write(f"### Monthly Synthesis: {month_str}\n\n")
                f_out.write(content)
                f_out.write("\n\n---\n\n")
        print(f"Created {out_path} with {len(items)} months.")
        
    # Delete old files
    for filepath in old_files:
        os.remove(filepath)
    print(f"Deleted {len(old_files)} old monthly files.")

def migrate_yearly():
    yearly_files = sorted(glob.glob(os.path.join(YEARLY_DIR, "*_insight.md")))
    if not yearly_files:
        print("No individual yearly files found to migrate.")
        return
        
    old_files = [f for f in yearly_files if "All_Years_Rollup" not in f]
    
    items = []
    for filepath in old_files:
        filename = os.path.basename(filepath)
        year_str = filename.replace("_insight.md", "")
        
        with open(filepath, 'r') as f:
            content = f.read().strip()
            
        items.append((year_str, content))
        
    if not items:
        return
        
    items.sort(key=lambda x: x[0])
    
    out_path = os.path.join(YEARLY_DIR, "All_Years_Rollup.md")
    with open(out_path, 'w') as f_out:
        for year_str, content in items:
            f_out.write(f"### Yearly Synthesis: {year_str}\n\n")
            f_out.write(content)
            f_out.write("\n\n---\n\n")
            
    print(f"Created {out_path} with {len(items)} years.")
    
    for filepath in old_files:
        os.remove(filepath)
    print(f"Deleted {len(old_files)} old yearly files.")

if __name__ == "__main__":
    print("Migrating Monthly files...")
    migrate_monthly()
    print("\nMigrating Yearly files...")
    migrate_yearly()
    print("\nMigration Complete!")
