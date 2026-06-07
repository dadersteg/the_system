import re

def update_config():
    with open('src/Code_Config.js', 'r') as f:
        content = f.read()

    # Remove getEnvProp from ROOTS
    content = re.sub(r'MASTER_SHEET_ID: getEnvProp\("MASTER_SHEET_ID"\) \|\| \(IS_WORK_ENV \? "([^"]+)" : "([^"]+)"\)',
                     r'MASTER_SHEET_ID: IS_WORK_ENV ? "\1" : "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY"', content)
                     
    content = re.sub(r'DRIVE_RULES_SHEET_ID: getEnvProp\("DRIVE_RULES_SHEET_ID"\) \|\| getEnvProp\("MASTER_SHEET_ID"\) \|\| \(IS_WORK_ENV \? "([^"]+)" : "([^"]+)"\)',
                     r'DRIVE_RULES_SHEET_ID: IS_WORK_ENV ? "\1" : "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY"', content)

    content = re.sub(r'HABITS_SHEET_ID: getEnvProp\("HABITS_SHEET_ID"\) \|\| \(IS_WORK_ENV \? "([^"]+)" : "([^"]+)"\)',
                     r'HABITS_SHEET_ID: IS_WORK_ENV ? "\1" : "1avNkROuThqd4wgzFjPKinxR9y7RYJmPCR-HASbfWUUo"', content)

    content = re.sub(r'DRIVE_RETRO_ROOT_ID: getEnvProp\("DRIVE_RETRO_ROOT_ID"\)',
                     r'DRIVE_RETRO_ROOT_ID: IS_WORK_ENV ? "" : ""', content)

    # Prompts
    content = re.sub(r'TASK_MASTER_PROMPT_ID: "([^"]+)"', r'TASK_MASTER_PROMPT_ID: "11Q8GQQ33KroFw8SNTQ6ioyDvnNq4j6ar"', content)
    content = re.sub(r'TASK_MASTER_DAILY_PROMPT_ID: "([^"]+)"', r'TASK_MASTER_DAILY_PROMPT_ID: "12V15LmkDX0EPGNZJUxRIr5TAleiI_ZgW"', content)
    content = re.sub(r'TASK_MASTER_WEEKLY_PROMPT_ID: "([^"]+)"', r'TASK_MASTER_WEEKLY_PROMPT_ID: "1Yo9jah9LnYeseeP_GOdWuMsW389h6KJb"', content)
    content = re.sub(r'TASK_MASTER_MONTHLY_PROMPT_ID: "([^"]+)"', r'TASK_MASTER_MONTHLY_PROMPT_ID: "1Ilvx-d1NCcuGQIvNLqPBziauoT8JDzGf"', content)
    content = re.sub(r'TASK_MASTER_QUARTERLY_PROMPT_ID: "([^"]+)"', r'TASK_MASTER_QUARTERLY_PROMPT_ID: "1L_uudJb_pNXWvZCBy2njXfuNpo3fbaF2"', content)
    
    content = re.sub(r'VANTAGE_LOG_ID: getEnvProp\("VANTAGE_LOG_ID"\) \|\| "([^"]+)"', r'VANTAGE_LOG_ID: "\1"', content)
    
    content = re.sub(r'RECENT_REFLECTIONS_ID: getEnvProp\("RECENT_REFLECTIONS_ID"\) \|\| \(IS_WORK_ENV \? "([^"]+)" : "([^"]+)"\)',
                     r'RECENT_REFLECTIONS_ID: IS_WORK_ENV ? "\1" : "\2"', content)
                     
    content = re.sub(r'TAXONOMY_DOC_ID: IS_WORK_ENV \? "([^"]+)" : "([^"]+)"',
                     r'TAXONOMY_DOC_ID: IS_WORK_ENV ? "\1" : "142r2YeV5v209crHS5J5HvWr1s4TOnexp"', content)
                     
    content = re.sub(r'PERSONAL_GOALS_FILE_ID: "([^"]+)"', r'PERSONAL_GOALS_FILE_ID: "1nFJpikIiZX9ykJy0aePAQyx0mFO0DswD"', content)
    content = re.sub(r'WORK_GOALS_FILE_ID: "([^"]+)"', r'WORK_GOALS_FILE_ID: "1lZgLespm8bUNS6Vt2sP1Pe0MqrSxV04N"', content)
    
    content = re.sub(r'CLERK_EMAIL_PROMPT_ID: getEnvProp\("CLERK_EMAIL_PROMPT_ID"\) \|\| "([^"]+)"', r'CLERK_EMAIL_PROMPT_ID: "19a2eEMdxmwhNbLXAYdgyJhWDYg-4abkJ"', content)
    
    # Tasks Config
    content = re.sub(r'TASK_MASTER_INDEX: getEnvProp\("TASK_MASTER_INDEX"\) \|\| "0"', r'TASK_MASTER_INDEX: "0"', content)
    
    # Sheet GIDs
    content = re.sub(r'HABITS_LOG: getEnvProp\("HABITS_GID"\) \|\| "([^"]+)"', r'HABITS_LOG: "\1"', content)
    content = re.sub(r'NOTES_LOG: getEnvProp\("NOTES_LOG_GID"\) \|\| "([^"]+)"', r'NOTES_LOG: "\1"', content)

    with open('src/Code_Config.js', 'w') as f:
        f.write(content)
        
    print("Code_Config.js rewritten successfully.")

if __name__ == '__main__':
    update_config()
