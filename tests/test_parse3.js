const fs = require('fs');

const text = `Summary
The team reviewed spreadsheet rebuild phases and established standardized trader performance metrics with efficiency benchmarks.  Spreadsheet Rebuild Phases The project integrates 4 distinct trading workflow phases into a unified system. Traders must now provide rationale for all trade decisions to ensure qualitative standards.  Scorecards and Milestones Performance scorecards now combine skills matrices with specific deliverables. Focus for the second half of the year centers on hybrid model development.  KPI Selection Criteria KPIs are being refined to include efficiency metrics. Adding a turnover to profit efficiency ratio helps prevent skewing performance data on single metrics.


Decisions
Needs Further Discussion
Integration of efficiency ratio in KPIs The team requires further evaluation of adding a turnover-to-profit efficiency metric to the trader KPI framework, dependent on reviewing previously shared reference materials.

We've updated the Decisions section using your feedback.
Let us know what you think: Helpful or Not Helpful


Next steps
[Daniel Adersteg] Present Spreadsheet: Present the trading spreadsheet to the traders to demonstrate its usage and gather feedback.
[Daniel Adersteg] Refine Spreadsheet: Refine the trading spreadsheet based on the discussion with the traders.
[Daniel Adersteg] Create Strategy Templates: Develop the trading spreadsheet templates for tennis, NBA, and NFL strategies.
[Mark Kozyritskiy] Share KPI Spreadsheet: Locate and share the previous KPI spreadsheet link with Daniel.
[Daniel Adersteg] Update Scorecard KPIs: Evaluate the inclusion of efficiency metrics in the trader performance scorecard based on the shared spreadsheet.


Details
Meeting Introduction and Overview: Daniel Adersteg opened the meeting by presenting a high-level summary of the rebuilding process for the trading spreadsheets.`;

function extractGeminiNotesTasks(text) {
    let tasks = [];
    const targetHeaders = ["decisions", "next steps", "action items", "actions", "decisions made"];
    const lines = text.split('\n');
    let inTargetSection = false;
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        
        let lowerLine = line.toLowerCase().replace(/[^a-z ]/g, "").trim(); 
        
        let isPossibleHeader = line.length > 0 && line.length < 40 && !line.match(/[.!?]$/) && !line.match(/^[-*•]\s/) && !line.match(/^\d+\.\s/) && !line.includes("  ");
        
        if (isPossibleHeader) {
            if (targetHeaders.some(h => lowerLine.includes(h))) {
                inTargetSection = true;
                continue;
            } else if (lowerLine.length > 0 && lowerLine !== "content") {
                inTargetSection = false;
                continue;
            }
        }
        
        if (inTargetSection) {
            // Strip any bullets, numbers, or brackets
            let title = line.replace(/^[-*•]\s/, "").replace(/^\d+\.\s/, "").replace(/^\[.*?\]\s/, "").trim();
            if (title.length > 3 && !title.includes("Let us know what you think: Helpful or Not Helpful") && !title.includes("We've updated the Decisions section using your feedback")) {
               tasks.push({ title: title, notes: "Deterministically extracted from Gemini Notes" });
            }
        }
    }
    return tasks;
}

console.log(extractGeminiNotesTasks(text));
