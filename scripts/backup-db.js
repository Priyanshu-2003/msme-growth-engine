// scripts/backup-db.js - Safe Database Backup Script
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/msme.sqlite');
const BACKUP_DIR = path.join(__dirname, '../data/backups');

function backupDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ Source database file not found at: ${DB_PATH}`);
    process.exit(1);
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `msme_backup_${timestamp}.sqlite`;
  const backupPath = path.join(BACKUP_DIR, backupFileName);

  // Copy database file
  fs.copyFileSync(DB_PATH, backupPath);

  // Verify backup integrity
  try {
    const backupDb = new DatabaseSync(backupPath);
    const leadsCount = backupDb.prepare('SELECT COUNT(*) as c FROM leads').get().c;
    const realLeadsCount = backupDb.prepare('SELECT COUNT(*) as c FROM leads WHERE COALESCE(is_demo, 0) = 0').get().c;
    const demoLeadsCount = backupDb.prepare('SELECT COUNT(*) as c FROM leads WHERE is_demo = 1').get().c;
    const activityCount = backupDb.prepare('SELECT COUNT(*) as c FROM activity_logs').get().c;
    const followUpCount = backupDb.prepare('SELECT COUNT(*) as c FROM follow_ups').get().c;
    const scriptsCount = backupDb.prepare('SELECT COUNT(*) as c FROM scripts').get().c;

    const stats = {
      backupFile: backupFileName,
      backupPath,
      sizeBytes: fs.statSync(backupPath).size,
      timestamp: new Date().toISOString(),
      counts: {
        totalLeads: leadsCount,
        realLeads: realLeadsCount,
        demoLeads: demoLeadsCount,
        activityLogs: activityCount,
        followUps: followUpCount,
        scripts: scriptsCount
      }
    };

    console.log('✅ Database backup completed successfully!');
    console.log(`📁 File: ${backupPath}`);
    console.log(`📊 Backup Counts:`);
    console.log(`   • Total Leads: ${leadsCount} (Real: ${realLeadsCount}, Demo: ${demoLeadsCount})`);
    console.log(`   • Activity Logs: ${activityCount}`);
    console.log(`   • Follow-Ups: ${followUpCount}`);
    console.log(`   • Scripts: ${scriptsCount}`);

    return stats;
  } catch (err) {
    console.error(`❌ Failed to verify database backup: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  backupDatabase();
}

module.exports = { backupDatabase };
