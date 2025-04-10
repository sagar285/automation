// scripts/create-auth-tables.js
const dbManager = require('../dbmanager');

async function createAuthTables() {
  try {
    console.log('Creating authentication tables...');

    // 1. Users Table (Combined)
    const usersResult = await dbManager.createTableIfNotExists('users', [
      { name: 'id', type: 'SERIAL', constraints: 'PRIMARY KEY' },
      { name: 'email', type: 'VARCHAR(255)', constraints: 'UNIQUE NOT NULL' },
      { name: 'full_name', type: 'VARCHAR(255)' },
      { name: 'profile_picture', type: 'VARCHAR(255)' },
      { name: 'provider', type: 'VARCHAR(50)', constraints: "DEFAULT 'email'" },
      { name: 'provider_user_id', type: 'VARCHAR(255)' },
      { name: 'provider_data', type: 'JSONB' },
      { name: 'is_verified', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' },
      { name: 'created_at', type: 'TIMESTAMP', constraints: 'DEFAULT CURRENT_TIMESTAMP' },
      { name: 'last_login', type: 'TIMESTAMP' }
    ]);
    
    console.log(usersResult.message);

    // 2. Email Verification Table
    const verificationResult = await dbManager.createTableIfNotExists('email_verification', [
      { name: 'id', type: 'SERIAL', constraints: 'PRIMARY KEY' },
      { name: 'email', type: 'VARCHAR(255)', constraints: 'NOT NULL' },
      { name: 'verification_code', type: 'VARCHAR(10)', constraints: 'NOT NULL' },
      { name: 'expires_at', type: 'TIMESTAMP', constraints: 'NOT NULL' },
      { name: 'created_at', type: 'TIMESTAMP', constraints: 'DEFAULT CURRENT_TIMESTAMP' }
    ]);
    
    console.log(verificationResult.message);

    // 3. User Sessions Table
    const sessionsResult = await dbManager.createTableIfNotExists('user_sessions', [
      { name: 'id', type: 'SERIAL', constraints: 'PRIMARY KEY' },
      { name: 'user_id', type: 'INTEGER', constraints: 'REFERENCES users(id) ON DELETE CASCADE' },
      { name: 'token', type: 'VARCHAR(255)', constraints: 'UNIQUE NOT NULL' },
      { name: 'expires_at', type: 'TIMESTAMP', constraints: 'NOT NULL' },
      { name: 'created_at', type: 'TIMESTAMP', constraints: 'DEFAULT CURRENT_TIMESTAMP' }
    ]);
    
    console.log(sessionsResult.message);

    // Create index on email for faster lookups
    await dbManager.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_verification_email ON email_verification(email);
    `);
    console.log('Created index on email_verification(email)');

    // Create index on sessions user_id
    await dbManager.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
    `);
    console.log('Created index on user_sessions(user_id)');

    console.log('Authentication tables created successfully!');
  } catch (error) {
    console.error('Error creating authentication tables:', error);
  }
}

// Run the function
createAuthTables().then(() => {
  console.log('Script completed');
  process.exit(0);
}).catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});