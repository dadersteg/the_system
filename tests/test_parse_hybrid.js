const doc1 = `Claude Workflow Efficiency and Unstructured Data: A participant provided feedback that the current Claude-based "bet selection" skill felt slower than using Excel because it required structured input like fixture names and dates (00:50:02). Daniel Adersteg clarified that the tool is intended to process unstructured data, such as voice notes or "train of thought" text, and promised to update the instructions to ensure it does not require step-by-step structured prompts. Daniel Adersteg also proposed creating similar skills for generating structured match reports from free-text notes to help traders maintain a historical log and share insights more easily (00:51:29) (00:53:51).
Meeting Wrap-up and Next Steps: Daniel Adersteg will continue porting existing data into the new spreadsheets and plans to transition the MLB Telegram group to a channel to facilitate full automation (00:30:54). Finn Brasher noted they are on annual leave tomorrow, so Daniel Adersteg rescheduled their one-on-one meeting to Monday to discuss individual goals and seniority-based scorecard adjustments (00:47:19). Daniel Adersteg aims to finalize the scorecards by the end of next week before the July period begins (00:48:26).

You should review Gemini's notes to make sure they're accurate.`;

const doc2 = `Summary
The team reviewed spreadsheet rebuild phases.

Decisions
Needs Further Discussion
Integration of efficiency ratio in KPIs The team requires further evaluation of adding a turnover-to-profit efficiency metric to the trader KPI framework, dependent on reviewing previously shared reference materials.

We've updated the Decisions section using your feedback.

Next steps
[Daniel Adersteg] Present Spreadsheet: Present the trading spreadsheet to the traders to demonstrate its usage and gather feedback.
[Daniel Adersteg] Refine Spreadsheet: Refine the trading spreadsheet based on the discussion with the traders.

Details
Meeting Introduction and Overview: Daniel Adersteg opened the meeting by presenting a high-level summary.`;

function extractActionZones(text) {
    // Defensive type checking
    if (typeof text !== 'string') {
        return "None";
    }
    
    const lines = text.split('\n');
    let extractedLines = [];
    let inTargetSection = false;
    const targetHeaders = ["decisions", "next steps", "action items", "actions", "decisions made"];
    const exitHeaders = ["summary", "details", "attendees", "notes", "agenda"];
    
    // Helper to normalize a line for header checking
    function normalizeHeader(str) {
        return str.toLowerCase()
                  .replace(/[^a-z ]/g, " ") // replace non-letters with spaces
                  .replace(/\s+/g, " ")      // condense spaces
                  .trim();
    }
    
    // Helper to check if the line starts with list/bullet/checkbox formatting
    function isListLine(str) {
        let trimmed = str.trim();
        return /^[-\*•✓●★☐☑☒□]/.test(trimmed) || /^\[[ xX]?\]/.test(trimmed) || /^\d+\.\s/.test(trimmed);
    }
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        
        let clean = normalizeHeader(line);
        
        // Check if the line is a header by length and keyword match
        let isTargetHeader = false;
        let isExitHeader = false;
        
        // A header is expected to be relatively short (e.g. less than 35 characters clean, and max 4 words)
        if (clean.length > 0 && clean.length < 35 && clean.split(" ").length <= 4) {
            
            // If the line starts with a list bullet/checkbox, it can only be a header if it is formatted as one.
            let isList = isListLine(line);
            let hasHeaderFormatting = !isList || line.endsWith(":") || line.includes("**") || targetHeaders.includes(clean) || exitHeaders.includes(clean);
            
            if (hasHeaderFormatting) {
                isTargetHeader = targetHeaders.some(h => {
                    return clean === h || clean === h + "s" || clean === "key " + h || clean === "key " + h + "s" ||
                           clean === "immediate " + h || clean === "immediate " + h + "s" ||
                           clean === "agreed " + h || clean === "agreed " + h + "s" ||
                           clean === "team " + h || clean === "team " + h + "s" ||
                           clean === "our " + h || clean === "our " + h + "s";
                });
                
                isExitHeader = exitHeaders.some(h => {
                    return clean === h || clean === h + "s" || clean === "meeting " + h || clean === "meeting " + h + "s" ||
                           clean === "discussion " + h || clean === "discussion " + h + "s" ||
                           clean === "executive " + h || clean === "executive " + h + "s" ||
                           clean === "general " + h || clean === "general " + h + "s" ||
                           clean === "additional " + h || clean === "additional " + h + "s";
                });
            }
        }
        
        // Fallback for target headers if the line is not matched by length (e.g. "and Decisions Made")
        if (!isTargetHeader && !inTargetSection) {
            isTargetHeader = targetHeaders.some(h => {
                if (clean === h) return true;
                if (clean.startsWith(h + " ")) return true;
                // If it is an inline/fallback match like "and next steps", it must be part of a header/hybrid line (which has a colon)
                if (clean.includes("and " + h) && line.includes(":")) return true;
                return false;
            });
        }
        
        if (isTargetHeader) {
            inTargetSection = true;
            // For standalone headers (short), use the original line text.
            // For long paragraphs with inline headers, use the matched header keyword.
            if (line.length < 50) {
                extractedLines.push("--- " + line.toUpperCase() + " ---");
                continue;
            } else {
                let matchedH = targetHeaders.find(h => clean.startsWith(h + " ") || clean.includes("and " + h) || clean === h);
                extractedLines.push("--- " + (matchedH || "next steps").toUpperCase() + " ---");
                
                // If it's a long hybrid line (header and content together), it typically has a colon followed by content.
                // Otherwise, it's just a long heading, so we should skip double-pushing.
                if (!line.includes(": ")) {
                    continue;
                }
            }
        }
        
        if (isExitHeader) {
            inTargetSection = false;
            continue;
        }
        
        if (inTargetSection) {
            extractedLines.push(line);
        }
    }
    
    return extractedLines.length > 0 ? extractedLines.join("\n") : "None";
}

console.log("--- DOC 1 ---");
console.log(extractActionZones(doc1));
console.log("\n--- DOC 2 ---");
console.log(extractActionZones(doc2));

