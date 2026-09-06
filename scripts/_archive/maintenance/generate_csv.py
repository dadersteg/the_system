import csv
import os

def create_csv():
    # IDs mapped directly from Code_Config.js
    pmt_ids = {
        "MASTER_SHEET": "1FO-iNKasPpen9MpG2Urt7IFFgw4psrm6sArxjuAWDxY",
        "WORKSPACE_FOLDER": "1bX5HtL1Yrtwt1xwEiB-H6qes4hetRaiw",
        "HABITS_SHEET": "1V-w6QtL9e16nnWdi5m58U0iPxfuIVfmyMrHrfZk9iI8",
        "RECENT_REFLECTIONS": "1okMRrvTSoHg6Hudi0tHniP5Vjnt_PFTE",
        "TAXONOMY_DOC": "1gFvlLGijJ2Z1wbK8L32SFakH66yGXVUo",
        "TAXONOMY_JSON": "1txdOFb0fWHc5CrfTkyaG9L_9ucRa7wZ3",
        "MASTER_NAMING": "18vdXyMd4AK5FAqS9fPRDIA1nOIjN12vN",
        "DAY_1_EXEC": "1zCKlhaTchntW-2Lk1_el7ShnOzZSqmO7",
        "DAY_7_ROADMAP": "18rIhK5SX4gS9rNQNvYkXkMFCCVqKcLO_YNJFqqcqEnA",
        "DAY_28_STRATEGIC": "1TcHyODoMm5zziuu6COD86qQroOFyMz05KtddAEsb0bY",
        "DAY_84_STRATEGIC": "1P0LgSK70Ztn772hrHtTOK7s8IM55llxnaVk_AeZuthA",
        "TASKS_EXPORT": "1OaW3uaTB7edPYQFXNFzMpvxqlUvCRMG2",
    }
    
    priv_ids = {
        "MASTER_SHEET": "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY",
        "WORKSPACE_FOLDER": "13Nvsav_Gt1zTXjPH0crBMdERN9HkN2pc",
        "HABITS_SHEET": "1avNkROuThqd4wgzFjPKinxR9y7RYJmPCR-HASbfWUUo",
        "RECENT_REFLECTIONS": "1Ot9fJ5P-Z_O6BOIlWZ2L_oyCIw6Ixeet",
        "TAXONOMY_DOC": "142r2YeV5v209crHS5J5HvWr1s4TOnexp",
        "TAXONOMY_JSON": "199ChTlYe3xKsybllcJ3BXYUIEs8cxvWq",
        "MASTER_NAMING": "16FxwxxtRWpL3ppe_aD2e7KEBAqFx6rbn",
        "DAY_1_EXEC": "1_TMGaK2U00kMeagblJjrcD6MJFcY18Kq",
        "DAY_7_ROADMAP": "1V_iybOjHzp4S9UdTHKWj4QlK-wDUsAU3",
        "DAY_28_STRATEGIC": "1B2jahfmNQt8iwPWHCXnFYwDirJWkyt3u",
        "DAY_84_STRATEGIC": "1arJFUz4LPw4SaEfN6aY-0dYUS5ifKD7R",
        "TASKS_EXPORT": "1FaFZPlbF7vCFRJqF0dS7lA4Zx6_lcgty",
    }
    
    shared_ids = {
        "PROMPT_DAILY": "12V15LmkDX0EPGNZJUxRIr5TAleiI_ZgW",
        "PROMPT_WEEKLY": "1Yo9jah9LnYeseeP_GOdWuMsW389h6KJb",
        "PROMPT_MONTHLY": "1Ilvx-d1NCcuGQIvNLqPBziauoT8JDzGf",
        "PROMPT_QUARTERLY": "1L_uudJb_pNXWvZCBy2njXfuNpo3fbaF2",
        "PROMPT_VANTAGE": "1Cw4KXmJ7cN114YFub9voVhlzEL_EEF1D",
        "VANTAGE_INSTRUCTIONS": "10YHaBQqy1gfJ3YSaGC9RoFh4xCa106YC",
        "PERSONAL_GOALS": "1nFJpikIiZX9ykJy0aePAQyx0mFO0DswD",
        "WORK_GOALS": "1lZgLespm8bUNS6Vt2sP1Pe0MqrSxV04N",
        "CLERK_INSTRUCTIONS": "1HyHXMW_PC6Viq1j-w3BoQZREYJdMMe1U",
        "CLERK_PROTOCOL": "1dWxccg1FyGmdK2fayx5K8S05NW8VBpVk",
        "CLERK_EMAIL_PROMPT": "19a2eEMdxmwhNbLXAYdgyJhWDYg-4abkJ",
        "AGENT_PROTOCOL": "1711JUUEypB0zlZgpTxY24sN8v0F2PSbm",
        "TASKS_COMBINED_EXPORT": "1fs00OCWVi0kGY404b0Ew_alfd3B4c4Wi"
    }

    def s_link(id): return f"https://docs.google.com/spreadsheets/d/{id}/edit"
    def d_link(id): return f"https://docs.google.com/document/d/{id}/edit"
    def f_link(id): return f"https://drive.google.com/file/d/{id}/view"
    def fol_link(id): return f"https://drive.google.com/drive/folders/{id}"

    os.makedirs('docs/links', exist_ok=True)
    
    with open('docs/links/System_Architecture_Overview.csv', 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(["Category", "Resource Name", "Private Profile Link", "PMT Work Profile Link", "Link Format Fix"])
        
        # Core Roots
        writer.writerow(["Core Roots", "Master Settings Sheet", s_link(priv_ids["MASTER_SHEET"]), s_link(pmt_ids["MASTER_SHEET"]), "Spreadsheet URL"])
        writer.writerow(["Core Roots", "Workspace Root Folder", fol_link(priv_ids["WORKSPACE_FOLDER"]), fol_link(pmt_ids["WORKSPACE_FOLDER"]), "Folder URL"])
        writer.writerow(["Core Roots", "Habits Logging Sheet", s_link(priv_ids["HABITS_SHEET"]), s_link(pmt_ids["HABITS_SHEET"]), "Spreadsheet URL"])
        
        # Prompts & Config
        writer.writerow(["Prompts & Config", "Daily Prompt", f_link(shared_ids["PROMPT_DAILY"]), f_link(shared_ids["PROMPT_DAILY"]), ".md File URL (Fixed)"])
        writer.writerow(["Prompts & Config", "Weekly Prompt", f_link(shared_ids["PROMPT_WEEKLY"]), f_link(shared_ids["PROMPT_WEEKLY"]), ".md File URL (Fixed)"])
        writer.writerow(["Prompts & Config", "Monthly Prompt", f_link(shared_ids["PROMPT_MONTHLY"]), f_link(shared_ids["PROMPT_MONTHLY"]), ".md File URL (Fixed)"])
        writer.writerow(["Prompts & Config", "Quarterly Prompt", f_link(shared_ids["PROMPT_QUARTERLY"]), f_link(shared_ids["PROMPT_QUARTERLY"]), ".md File URL (Fixed)"])
        
        writer.writerow(["Prompts & Config", "Taxonomy Config", f_link(priv_ids["TAXONOMY_DOC"]), f_link(pmt_ids["TAXONOMY_DOC"]), ".md File URL (Fixed)"])
        writer.writerow(["Prompts & Config", "Taxonomy JSON (Backend)", f_link(priv_ids["TAXONOMY_JSON"]), f_link(pmt_ids["TAXONOMY_JSON"]), ".json File URL"])
        writer.writerow(["Prompts & Config", "Master Naming Protocol", f_link(priv_ids["MASTER_NAMING"]), f_link(pmt_ids["MASTER_NAMING"]), ".md File URL (Fixed)"])
        
        writer.writerow(["Prompts & Config", "Personal Goals", f_link(shared_ids["PERSONAL_GOALS"]), f_link(shared_ids["PERSONAL_GOALS"]), ".md File URL (Fixed)"])
        writer.writerow(["Prompts & Config", "Work Goals", f_link(shared_ids["WORK_GOALS"]), f_link(shared_ids["WORK_GOALS"]), ".md File URL (Fixed)"])
        
        writer.writerow(["Prompts & Config", "Vantage Prompt", f_link(shared_ids["PROMPT_VANTAGE"]), f_link(shared_ids["PROMPT_VANTAGE"]), ".md File URL (Fixed)"])
        writer.writerow(["Prompts & Config", "Vantage Custom Instr", f_link(shared_ids["VANTAGE_INSTRUCTIONS"]), f_link(shared_ids["VANTAGE_INSTRUCTIONS"]), ".md File URL (Fixed)"])
        
        writer.writerow(["Prompts & Config", "Clerk Drive Protocol", f_link(shared_ids["CLERK_PROTOCOL"]), f_link(shared_ids["CLERK_PROTOCOL"]), ".md File URL (Fixed)"])
        writer.writerow(["Prompts & Config", "Clerk Drive Instr", f_link(shared_ids["CLERK_INSTRUCTIONS"]), f_link(shared_ids["CLERK_INSTRUCTIONS"]), ".md File URL (Fixed)"])
        writer.writerow(["Prompts & Config", "Clerk Email Prompt", f_link(shared_ids["CLERK_EMAIL_PROMPT"]), f_link(shared_ids["CLERK_EMAIL_PROMPT"]), ".md File URL (Fixed)"])
        writer.writerow(["Prompts & Config", "Agent Time Frameworks", f_link(shared_ids["AGENT_PROTOCOL"]), f_link(shared_ids["AGENT_PROTOCOL"]), ".md File URL (Fixed)"])

        # Outputs
        writer.writerow(["Generated Outputs", "Day 1 Execution Plan", f_link(priv_ids["DAY_1_EXEC"]), f_link(pmt_ids["DAY_1_EXEC"]), ".md File URL (Fixed)"])
        writer.writerow(["Generated Outputs", "Day 7 Roadmap", f_link(priv_ids["DAY_7_ROADMAP"]), f_link(pmt_ids["DAY_7_ROADMAP"]), ".md File URL (Fixed)"])
        writer.writerow(["Generated Outputs", "Day 28 Strategic", f_link(priv_ids["DAY_28_STRATEGIC"]), f_link(pmt_ids["DAY_28_STRATEGIC"]), ".md File URL (Fixed)"])
        writer.writerow(["Generated Outputs", "Day 84 Strategic", f_link(priv_ids["DAY_84_STRATEGIC"]), f_link(pmt_ids["DAY_84_STRATEGIC"]), ".md File URL (Fixed)"])
        writer.writerow(["Generated Outputs", "Tasks Export", f_link(priv_ids["TASKS_EXPORT"]), f_link(pmt_ids["TASKS_EXPORT"]), ".json File URL"])
        writer.writerow(["Generated Outputs", "Combined Tasks Export", f_link(shared_ids["TASKS_COMBINED_EXPORT"]), f_link(shared_ids["TASKS_COMBINED_EXPORT"]), ".json File URL"])
        writer.writerow(["Generated Outputs", "Recent Reflections", fol_link(priv_ids["RECENT_REFLECTIONS"]), fol_link(pmt_ids["RECENT_REFLECTIONS"]), "Folder URL"])

if __name__ == '__main__':
    create_csv()
