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
    const lines = text.split('\n');
    let extractedLines = [];
    let inTargetSection = false;
    const targetHeaders = ["decisions", "next steps", "action items", "actions", "decisions made"];
    const exitHeaders = ["summary", "details", "attendees", "notes", "agenda"];
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        
        let lowerLine = line.toLowerCase().replace(/[^a-z ]/g, "").trim(); 
        
        // Is it a standalone header?
        let isPossibleHeader = line.length > 0 && line.length < 40 && !line.match(/[.!?]$/) && !line.match(/^[-*•]\s/) && !line.match(/^\d+\.\s/) && !line.includes("  ");
        
        if (isPossibleHeader) {
            if (targetHeaders.some(h => lowerLine.includes(h))) {
                inTargetSection = true;
                extractedLines.push("--- " + line.toUpperCase() + " ---");
                continue;
            } else if (exitHeaders.some(h => lowerLine.includes(h))) {
                inTargetSection = false;
                continue;
            } else if (lowerLine.length > 0 && lowerLine !== "content") {
                // Ignore subheaders, keep staying in target section!
                if (inTargetSection) extractedLines.push(line);
                continue;
            }
        }
        
        // Also check if a long paragraph starts with a target header (e.g. "Meeting Wrap-up and Next Steps:")
        if (!inTargetSection) {
            for (let h of targetHeaders) {
                if (lowerLine.startsWith(h + " ") || lowerLine.includes("and " + h)) {
                     inTargetSection = true;
                     extractedLines.push("--- " + h.toUpperCase() + " ---");
                     // We also want to capture this line since the paragraph IS the content!
                     break;
                }
            }
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

