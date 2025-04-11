// scripts/create-instagram-accounts-table.js
const dbManager = require('../dbmanager');

async function createInstagramAccountsTable() {
  try {
    console.log('Creating Instagram accounts table...');

    // Create the table
    const result = await dbManager.createTableIfNotExists('instagram_accounts', [
      { name: 'id', type: 'SERIAL', constraints: 'PRIMARY KEY' },
      { name: 'user_id', type: 'INTEGER', constraints: 'REFERENCES users(id) ON DELETE CASCADE' },
      { name: 'account_id', type: 'VARCHAR(255)', constraints: 'NOT NULL' },
      { name: 'username', type: 'VARCHAR(255)' },
      { name: 'profile_picture', type: 'VARCHAR(255)' },
      { name: 'access_token', type: 'TEXT', constraints: 'NOT NULL' },
      { name: 'token_expires_at', type: 'TIMESTAMP', constraints: 'NOT NULL' },
      { name: 'instagram_admins', type: 'INTEGER[]', constraints: "DEFAULT '{}'::INTEGER[]" },
      { name: 'created_at', type: 'TIMESTAMP', constraints: 'DEFAULT CURRENT_TIMESTAMP' },
      { name: 'updated_at', type: 'TIMESTAMP', constraints: 'DEFAULT CURRENT_TIMESTAMP' },
      { name: 'is_active', type: 'BOOLEAN', constraints: 'DEFAULT TRUE' }
    ]);
    
    console.log(result.message);

    // Create indexes
    await dbManager.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_instagram_accounts_user_id ON instagram_accounts(user_id);
    `);
    console.log('Created index on instagram_accounts(user_id)');

    await dbManager.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_instagram_accounts_account_id ON instagram_accounts(account_id);
    `);
    console.log('Created index on instagram_accounts(account_id)');

    console.log('Instagram accounts table created successfully!');
  } catch (error) {
    console.error('Error creating Instagram accounts table:', error);
  }
}

// Run the function
createInstagramAccountsTable().then(() => {
  console.log('Script completed');
  process.exit(0);
}).catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});