// scripts/create-automation-logs-table.js
const dbManager = require('../dbmanager');
(async function createAutomationLogsTable() {
  try {
    console.log('Creating automation_logs table...');
    
    // Create automation_logs table
    const automationLogsResult = await dbManager.createTableIfNotExists('automation_logs', [
      { name: 'id', type: 'UUID', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'automation_id', type: 'UUID', constraints: 'REFERENCES automations(id) ON DELETE SET NULL' },
      { name: 'account_id', type: 'UUID', constraints: 'NOT NULL REFERENCES accounts(id) ON DELETE CASCADE' },
      { name: 'recipient_ig_id', type: 'TEXT', constraints: 'NOT NULL' },
      { name: 'source_ig_id', type: 'TEXT', constraints: '' },
      { name: 'media_ig_id', type: 'TEXT', constraints: '' },
      { name: 'action_type', type: 'TEXT', constraints: 'NOT NULL' },
      { name: 'content_details', type: 'TEXT', constraints: '' },
      { name: 'created_at', type: 'TIMESTAMP', constraints: 'DEFAULT NOW()' }
    ]);
    
    console.log(automationLogsResult.message);
    
    // Create index on account_id, recipient_ig_id, action_type
    await dbManager.pool.query('CREATE INDEX IF NOT EXISTS idx_automation_logs_account_action ON automation_logs(account_id, recipient_ig_id, action_type);');
    console.log('Created index on automation_logs(account_id, recipient_ig_id, action_type)');
    
    // Create index on source_ig_id
    await dbManager.pool.query('CREATE INDEX IF NOT EXISTS idx_automation_logs_source_id ON automation_logs(source_ig_id);');
    console.log('Created index on automation_logs(source_ig_id)');
    
    console.log('✅ automation_logs table created successfully!');
    
  } catch (error) {
    console.error('❌ Error creating automation_logs table:', error);
  } finally {
    // Close the pool
    await dbManager.pool.end();
    console.log('Database connection pool closed.');
  }
})();