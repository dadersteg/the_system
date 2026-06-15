module.exports = {
  apps: [
    // ==========================================
    // 🐍 Python Services & Scheduled Tasks
    // ==========================================
    {
      name: "antigravity-bridge",
      script: "src/telegram_antigravity_bridge.py",
      interpreter: "/Users/daniel/Developer/AGY_caches/the_system/my_venv/bin/python3",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      env_file: ".env",
      autorestart: true,
      restart_delay: 5000
    },
    {
      name: "telegram-bridge",
      script: "src/ingestion/telegram_bridge.py",
      interpreter: "/Users/daniel/Developer/AGY_caches/the_system/my_venv/bin/python3",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      autorestart: true,
      restart_delay: 5000
    },
    {
      name: "task-sync",
      script: "scripts/utils/sync_tasks_combined.py",
      interpreter: "/Users/daniel/Developer/AGY_caches/the_system/my_venv/bin/python3",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      cron_restart: "*/2 * * * *", // Runs every 2 minutes
      autorestart: false,
      out_file: "logs/task_sync_out.log",
      error_file: "logs/task_sync_err.log"
    },
    {
      name: "sheet-sync-maintenance",
      script: "scripts/utils/sheet_sync_and_maintenance.py",
      interpreter: "/Users/daniel/Developer/AGY_caches/the_system/my_venv/bin/python3",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      cron_restart: "*/15 * * * *", // Runs every 15 minutes
      autorestart: false,
      out_file: "logs/sheet_sync_maintenance_out.log",
      error_file: "logs/sheet_sync_maintenance_err.log"
    },


    // ==========================================
    // 🟢 Node.js Services & Scheduled Tasks
    // ==========================================
    {
      name: "beeper-bridge",
      script: "src/ingestion/beeper_bridge.js",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      env: {
        NODE_PATH: "/Users/daniel/Developer/AGY_caches/the_system/node_modules"
      },
      autorestart: true,
      restart_delay: 5000
    },
    {
      name: "system-monitor",
      script: "src/ingestion/monitor.js",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      env: {
        NODE_PATH: "/Users/daniel/Developer/AGY_caches/the_system/node_modules"
      },
      autorestart: true,
      restart_delay: 5000
    },
    {
      name: "check-bridges-daily",
      script: "src/ingestion/check_bridges_daily.js",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      env: {
        NODE_PATH: "/Users/daniel/Developer/AGY_caches/the_system/node_modules"
      },
      cron_restart: "0 9 * * *", // Runs daily at 9:00 AM
      autorestart: false,
      out_file: "logs/check_bridges_daily_out.log",
      error_file: "logs/check_bridges_daily_err.log"
    },
    {
      name: "github-sync",
      script: "scripts/utils/github_sync.sh",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      cron_restart: "0 * * * *", // Runs every hour
      autorestart: false,
      out_file: "logs/github_sync_out.log",
      error_file: "logs/github_sync_err.log"
    }
  ]
};
