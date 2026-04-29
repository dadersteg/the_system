function fixGmailLabels() {
  const user = 'me';
  const out = [];

  // Helper to fetch with retry
  function getLabelsWithRetry() {
    for (let i = 0; i < 3; i++) {
      try {
        return Gmail.Users.Labels.list(user);
      } catch (e) {
        if (i === 2) throw e;
        Utilities.sleep(2000);
      }
    }
  }

  let response;
  try {
    response = getLabelsWithRetry();
  } catch (e) {
    return "Error fetching labels: " + e.message;
  }
  
  const labels = response.labels;
  if (!labels || labels.length === 0) {
    return 'No labels found.';
  }

  // 1. We define the exact mapping of current corrupted/old paths to the perfect visual hierarchy.
  const corrections = {};

  labels.forEach(label => {
    let newName = label.name;

    // 1. Global fix for any lingering '01 Personal' ghost parents
    if (newName.startsWith('01 Personal/')) {
      newName = newName.replace('01 Personal/', '01 Private/');
    }

    // 2. Fix the disjointed "04 Personal finances" paths
    if (newName.includes('01 Private/04 Personal finances')) {
      newName = newName.replace('01 Private/04 Personal finances', '01 Private/04 Finances');
    }
    
    // 3. Fix disjointed "01 Personal information"
    if (newName.includes('01 Private/01 Personal information')) {
      newName = newName.replace('01 Private/01 Personal information', '01 Private/01 Personal Admin');
    }
    
    // 4. Fix disjointed "03 Personal growth"
    if (newName.includes('01 Private/03 Personal growth')) {
      newName = newName.replace('01 Private/03 Personal growth', '01 Private/03 Personal Growth');
    }
    
    // 5. Fix disjointed "02 Work/02 Next/Previous" to "02 Work/02 Career Management"
    if (newName.includes('02 Work/02 Next/Previous')) {
      newName = newName.replace('02 Work/02 Next/Previous', '02 Work/02 Career Management');
    }
    
    // 6. Fix the inconsistency if I previously renamed it to "02 02 00 Career Management"
    if (newName.includes('02 Work/02 02 00 Career Management')) {
      newName = newName.replace('02 Work/02 02 00 Career Management', '02 Work/02 Career Management');
    }
    
    // 7. Fix disjointed "Useful" to "Useful & Helpful"
    if (newName.includes('01 Private/05 Other/03 Collections/Useful') && !newName.includes('Helpful')) {
      newName = newName.replace('01 Private/05 Other/03 Collections/Useful', '01 Private/05 Other/03 Collections/Useful & Helpful');
    }

    // 8. Fix the redundant "01 XX 99 Archive/01 05 99 Archive" logic
    if (newName.includes('01 XX 99 Archive/01 05 99 Archive')) {
      newName = newName.replace('01 XX 99 Archive/01 05 99 Archive', '01 XX 99 Archive/05 Projects');
    }

    // 9. Fix "03 Studier" to "03 Studies"
    if (newName.startsWith('03 Studier')) {
      newName = newName.replace('03 Studier', '03 Studies');
    }
    
    if (newName !== label.name) {
      corrections[label.name] = newName;
    }
  });

  const labelsToRename = [];
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (corrections[label.name]) {
      labelsToRename.push({
        id: label.id,
        oldName: label.name,
        newName: corrections[label.name],
        depth: label.name.split('/').length
      });
    }
  }

  // Sort by depth descending so we rename children before parents to avoid path resolution errors
  labelsToRename.sort((a, b) => b.depth - a.depth);

  for (let i = 0; i < labelsToRename.length; i++) {
    const item = labelsToRename[i];
    out.push("Fixing: '" + item.oldName + "' -> '" + item.newName + "'");
    try {
      Utilities.sleep(1000); // Prevent rate limiting
      const labelDef = Gmail.Users.Labels.get(user, item.id);
      labelDef.name = item.newName;
      Gmail.Users.Labels.update(labelDef, user, item.id);
      out.push("Success: " + item.newName);
    } catch (e) {
      out.push("Error renaming " + item.oldName + ": " + e.message);
    }
  }

  out.push("Gmail Label Cleanup Complete.");
  Logger.log(out.join("\n"));
  return out.join("\n");
}
