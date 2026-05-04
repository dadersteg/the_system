function testReadTask() {
  const lists = Tasks.Tasklists.list().items;
  for (const list of lists) {
    const tasks = Tasks.Tasks.list(list.id, {maxResults: 5}).items || [];
    for (const task of tasks) {
      if (task.notes && task.notes.includes("DEADLINE")) {
        console.log("Found task: " + task.title);
        console.log("=== RAW NOTES ===");
        console.log(JSON.stringify(task.notes));
        return;
      }
    }
  }
}
