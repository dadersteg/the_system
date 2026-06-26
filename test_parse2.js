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
    const targetHeaders = ["decisions", "next steps", "action items", "actions"];
    const lines = text.split('\n');
    let inTargetSection = false;
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        
        let lowerLine = line.toLowerCase().replace(/[^a-z ]/g, "").trim(); 
        
        // Is it a header? A header is usually a short line without punctuation at the end.
        let isPossibleHeader = line.length < 40 && !line.match(/[.!?]$/) && !line.match(/^[-*•]\s/) && !line.match(/^\d+\.\s/) && !line.includes("  ");
        
        if (isPossibleHeader) {
            if (targetHeaders.some(h => lowerLine.includes(h))) {
                inTargetSection = true;
                continue;
            } else if (lowerLine.length > 0) {
                // If it's another header, we exit the target section
                inTargetSection = false;
                continue;
            }
        }
        
        if (inTargetSection) {
            let title = line.replace(/^[-*•]\s/, "").replace(/^\d+\.\s/, "").replace(/^\[.*?\]\s/, "").trim();
            if (title.length > 3) {
               tasks.push({ title: title, notes: "Extracted from Gemini Notes" });
            }
        }
    }
    return tasks;
}

console.log(extractGeminiNotesTasks(text));
