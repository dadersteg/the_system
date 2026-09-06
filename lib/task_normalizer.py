"""
Task Normalizer Module
Standardizes milestone container titles, extracts semantic milestone keys,
and prevents duplicate creation across Google Tasks lists and Google Sheets.
"""

import re
import unicodedata

# Map of common known milestone alias keywords to canonical names
KNOWN_MILESTONE_CANONICAL_NAMES = {
    "passport": "Acquire New Passports",
    "passports": "Acquire New Passports",
    "wedding": "2027 Wedding",
    "cellsior": "Cellsior Registry & Spreadsheet Templates",
    "flat maintenance": "General Flat Maintenance",
    "general flat": "General Flat Maintenance",
    "carina": "Complete Admin Tasks for Carina",
    "operational hygiene": "General Admin & Operational Hygiene",
    "personal ai": "Evaluate Personal AI Automations",
}

EXPLICIT_MILESTONE_CONTAINER_ALIASES = [
    "acquire new passports container",
    "acquire new passports milestone container",
    "manage passport acquisition container",
    "manage passport acquisition milestone container",
    "manage 2027 wedding milestone container",
    "manage 2027 wedding epic container",
    "manage cellsior registry and spreadsheet templates",
    "manage cellsior registry and spreadsheet templates epic container",
    "manage cellsior registry and spreadsheet templates container",
    "manage general flat maintenance container",
    "general flat maintenance container",
    "manage evaluate personal ai automations container",
    "evaluate personal ai automations container",
    "evaluate personal ai workflow automation container",
]


def clean_text(text: str) -> str:
    """Normalize text encoding and clean excess whitespace."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", str(text))
    return " ".join(text.strip().split())


def extract_milestone_name_from_notes(notes: str) -> str:
    """
    Extracts milestone name from notes metadata lines like:
    Milestone: [Milestone] 2027 Wedding
    or
    "milestone": "[Milestone] Acquire New Passports"
    """
    if not notes:
        return ""
    
    # 1. Plain text tag: Milestone: [Milestone] ... or Milestone: ...
    m = re.search(r"Milestone:\s*(?:\[Milestone\]\s*)?([^\n\r]+)", notes, re.IGNORECASE)
    if m:
        val = clean_text(m.group(1))
        if val and val.lower() not in ["none", "n/a", "null", ""]:
            return val

    # 2. JSON metadata field: "milestone": "..."
    m_json = re.search(r'["\']milestone["\']\s*:\s*["\']([^"\']+)["\']', notes, re.IGNORECASE)
    if m_json:
        val = clean_text(m_json.group(1))
        val = re.sub(r"^\[Milestone\]\s*", "", val, flags=re.IGNORECASE).strip()
        if val and val.lower() not in ["none", "n/a", "null", ""]:
            return val

    return ""


def is_milestone_container(title: str, notes: str = "") -> bool:
    """
    Determines if a task represents an Epic Milestone container.
    """
    t = clean_text(title)
    if re.match(r"^\[Milestone\]", t, re.IGNORECASE):
        return True
    if " > [Milestone]" in t:
        return True
    if re.search(r"\b(?:milestone\s+container|epic\s+container)\b", t, re.IGNORECASE):
        return True
    if t.lower() in EXPLICIT_MILESTONE_CONTAINER_ALIASES:
        return True
    if re.search(r"^Manage\s+.+\b(?:milestone|epic)\s+container\b", t, re.IGNORECASE):
        return True
    return False


def normalize_milestone_title(raw_title: str) -> str:
    """
    Converts alias variations into canonical '[Milestone] <Name>'.
    Leaves non-milestone tasks completely untouched (e.g. 'Buy food storage container').
    """
    title = clean_text(raw_title)
    if not title:
        return ""

    # Strip existing compound category prefixes (e.g. '01 05 01 Projects > ')
    if " > " in title:
        parts = title.split(" > ")
        title = parts[-1].strip()

    # Strip redundant '[Milestone] N/A > ' prefixes
    title = re.sub(r"^\[Milestone\]\s*N/A\s*>\s*", "", title, flags=re.IGNORECASE).strip()

    # If already formatted as '[Milestone] ...', clean inner name
    m_bracket = re.match(r"^\[Milestone\]\s*(.+)$", title, re.IGNORECASE)
    if m_bracket:
        inner = clean_text(m_bracket.group(1))
        inner = re.sub(r"\s+(?:milestone\s+)?(?:epic\s+)?container$", "", inner, flags=re.IGNORECASE).strip()
        inner_key = extract_milestone_key(inner)
        for key_pattern, canonical in KNOWN_MILESTONE_CANONICAL_NAMES.items():
            if key_pattern in inner_key:
                return f"[Milestone] {canonical}"
        return f"[Milestone] {inner}"

    # Only normalize if this task is genuinely an explicit milestone container
    if not is_milestone_container(title):
        return title

    # Strip leading 'Manage '
    core = re.sub(r"^Manage\s+", "", title, flags=re.IGNORECASE).strip()
    # Strip trailing container suffixes
    core = re.sub(r"\s+(?:milestone\s+)?(?:epic\s+)?container$", "", core, flags=re.IGNORECASE).strip()
    
    # Check against known canonical mappings
    core_key = extract_milestone_key(core)
    for key_pattern, canonical in KNOWN_MILESTONE_CANONICAL_NAMES.items():
        if key_pattern in core_key:
            return f"[Milestone] {canonical}"

    return f"[Milestone] {core}"


def extract_milestone_key(text: str) -> str:
    """
    Extracts a standardized semantic key for collision detection.
    e.g. '[Milestone] Acquire New Passports' -> 'acquire_new_passports'
         'Manage 2027 Wedding milestone container' -> '2027_wedding'
    """
    if not text:
        return ""
    t = clean_text(text).lower()
    t = re.sub(r"^\[milestone\]\s*", "", t)
    t = re.sub(r"^manage\s+", "", t)
    t = re.sub(r"\s+(?:milestone\s+)?(?:epic\s+)?container$", "", t)
    t = re.sub(r"[^a-z0-9]+", "_", t).strip("_")

    # Group synonym keys
    if "passport" in t:
        return "acquire_new_passports"
    if "wedding" in t:
        return "2027_wedding"
    if "cellsior" in t:
        return "cellsior_registry_and_spreadsheet_templates"
    if "flat_maintenance" in t or "flat_maint" in t:
        return "general_flat_maintenance"
    if "carina" in t:
        return "complete_admin_tasks_for_carina"
    if "operational_hygiene" in t:
        return "general_admin_and_operational_hygiene"
    if "personal_ai" in t:
        return "evaluate_personal_ai_automations"

    return t
