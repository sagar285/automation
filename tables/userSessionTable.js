// scripts/create-user-sessions-table.js
const dbManager = require('../dbmanager');

(async function createUserSessionsTable() {
  try {
    console.log('Creating user_sessions table...');
    
    // Create user_sessions table
    const userSessionsResult = await dbManager.createTableIfNotExists('user_sessions', [
      { name: 'id', type: 'UUID', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'user_id', type: 'UUID', constraints: 'REFERENCES users(id) ON DELETE CASCADE' },
      { name: 'token', type: 'TEXT', constraints: 'NOT NULL UNIQUE' },
      { name: 'expires_at', type: 'TIMESTAMP', constraints: 'NOT NULL' },
      { name: 'created_at', type: 'TIMESTAMP', constraints: 'DEFAULT NOW()' }
    ]);
    
    console.log(userSessionsResult.message);
    
    // Create index on user_id for faster queries
    await dbManager.pool.query('CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);');
    console.log('Created index on user_sessions(user_id)');
    
    // Create index on token for faster token lookups
    await dbManager.pool.query('CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);');
    console.log('Created index on user_sessions(token)');
    
    console.log('✅ user_sessions table created successfully!');
    
  } catch (error) {
    console.error('❌ Error creating user_sessions table:', error);
  } finally {
    // Close the pool
    await dbManager.pool.end();
    console.log('Database connection pool closed.');
  }
})();