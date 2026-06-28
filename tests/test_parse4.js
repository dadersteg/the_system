const fs = require('fs');

const text = `Claude Workflow Efficiency and Unstructured Data: A participant provided feedback that the current Claude-based "bet selection" skill felt slower than using Excel because it required structured input like fixture names and dates (00:50:02). Daniel Adersteg clarified that the tool is intended to process unstructured data, such as voice notes or "train of thought" text, and promised to update the instructions to ensure it does not require step-by-step structured prompts. Daniel Adersteg also proposed creating similar skills for generating structured match reports from free-text notes to help traders maintain a historical log and share insights more easily (00:51:29) (00:53:51).
Meeting Wrap-up and Next Steps: Daniel Adersteg will continue porting existing data into the new spreadsheets and plans to transition the MLB Telegram group to a channel to facilitate full automation (00:30:54). Finn Brasher noted they are on annual leave tomorrow, so Daniel Adersteg rescheduled their one-on-one meeting to Monday to discuss individual goals and seniority-based scorecard adjustments (00:47:19). Daniel Adersteg aims to finalize the scorecards by the end of next week before the July period begins (00:48:26).


You should review Gemini's notes to make sure they're accurate. Get tips and learn how Gemini takes notes
How is the quality of these specific notes? Take a short survey to let us know your feedback, including how helpful the notes were for your needs.`;

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
            let title = line.replace(/^[-*•]\s/, "").replace(/^\d+\.\s/, "").replace(/^\[.*?\]\s/, "").trim();
            if (title.length > 3 && !title.includes("Let us know what you think: Helpful or Not Helpful") && !title.includes("We've updated the Decisions section using your feedback")) {
               tasks.push({ title: title, notes: "Deterministically extracted from Gemini Notes" });
            }
        }
    }
    return tasks;
}

console.log(extractGeminiNotesTasks(text));
