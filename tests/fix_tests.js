const fs = require('fs');
const path = require('path');

const mockTasksDir = path.join(__dirname, 'mock_tasks');
const mockFiles = fs.readdirSync(mockTasksDir).filter(f => f.endsWith('.json'));

for (const file of mockFiles) {
    const filePath = path.join(mockTasksDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (data.expected && data.expected.eisenhower) {
        if (!data.ai_response) {
            let updates = [];
            let processedIds = new Set();
            
            const processGroup = (group, target) => {
                if (group && Array.isArray(group)) {
                    group.forEach(t => {
                        updates.push({
                            taskId: String(t.id),
                            routingTarget: target,
                            estimatedDuration: "15m",
                            alignedGoal: "2026-MOCK-GOAL",
                            category_path: "01 01 Mock > Path",
                            recommendedTitle: t.title || "Mock Title"
                        });
                        processedIds.add(String(t.id));
                    });
                }
            };
            
            processGroup(data.expected.eisenhower.do_first, "SCHEDULE");
            processGroup(data.expected.eisenhower.schedule, "SCHEDULE");
            processGroup(data.expected.eisenhower.delegate, "BACKLOG");
            processGroup(data.expected.eisenhower.eliminate, "DELETE");
            
            // Any task in input not explicitly mentioned should be DELETE
            let allInputTasks = [];
            if (data.importer && Array.isArray(data.importer)) {
                allInputTasks = data.importer;
            } else if (data.input && Array.isArray(data.input.tasks)) {
                allInputTasks = data.input.tasks;
            } else if (Array.isArray(data.input)) {
                allInputTasks = data.input;
            }
            
            allInputTasks.forEach(t => {
                if (!processedIds.has(String(t.id))) {
                    updates.push({
                        taskId: String(t.id),
                        routingTarget: "DELETE",
                        estimatedDuration: "15m",
                        alignedGoal: "2026-MOCK-GOAL",
                        category_path: "01 01 Mock > Path",
                        recommendedTitle: t.title || "Mock Title"
                    });
                    processedIds.add(String(t.id));
                }
            });
            
            data.ai_response = { taskUpdates: updates };
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            console.log(`Updated ${file}`);
        }
    }
}
console.log("Done");
