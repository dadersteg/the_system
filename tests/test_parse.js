const fs = require('fs');

const text = `Attendees
John, Jane

Summary
We talked about X.

Decisions
- Go ahead with project Y
* Delay project Z
We also decided to do W.

Next steps
1. John to email client
2. Jane to update roadmap
- Follow up on Friday

Notes
Here are some other things.
`;

function extractGeminiNotesTasks(text) {
    let tasks = [];
    const targetHeaders = ["decisions", "next steps", "action items", "actions", "decisions made"];
    const lines = text.split('\n');
    let inTargetSection = false;
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        
        let lowerLine = line.toLowerCase().replace(/[^a-z ]/g, "").trim(); // Strip markdown like **
        
        let isHeader = targetHeaders.includes(lowerLine) && line.length < 30;
        
        if (isHeader) {
            inTargetSection = true;
            continue;
        }
        
        // If we hit a short line that is NOT a bullet point, it might be a new header
        let isBullet = line.match(/^[-*•]\s/) || line.match(/^\d+\.\s/);
        
        if (inTargetSection) {
            // Stop if we hit a new header
            if (!isBullet && line.length < 30 && !line.includes(" ")) { // Simple heuristic for new header
               // Not bullet, short line... might be new header. Let's just be lenient, if it's not a bullet, we might still capture it if it's in the section, but maybe we shouldn't.
            }
            
            // The user wants EVERYTHING LISTED there as actions. 
            // So if it's in the section, extract it.
            let title = line.replace(/^[-*•]\s/, "").replace(/^\d+\.\s/, "").trim();
            if (title.length > 5) {
               tasks.push({ title: title, notes: "Deterministically extracted from Gemini Notes" });
            }
        }
    }
    return tasks;
}

console.log(extractGeminiNotesTasks(text));
