// scripts/create-schema.js
const dbManager = require('../dbmanager');

(async function setupSchema() {
  try {
    console.log('Setting up database schema...');
    
    // First, enable UUID extension if not already enabled
    await dbManager.pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    console.log('UUID extension enabled');
    
    // Users Table
    console.log('Creating users table...');
    const usersResult = await dbManager.createTableIfNotExists('users', [
      { name: 'id', type: 'UUID', constraints: 'PRIMARY KEY' },
      { name: 'name', type: 'TEXT' },
      { name: 'email', type: 'TEXT', constraints: 'UNIQUE' },
      { name: 'phone_number', type: 'TEXT' },
      { name: 'profile_picture', type: 'TEXT' },
      { name: 'country', type: 'TEXT' },
      { name: 'is_active', type: 'BOOLEAN', constraints: 'DEFAULT TRUE' },
      { name: 'is_admin', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' },
      { name: 'auth_provider', type: 'TEXT' },
      { name: 'created_at', type: 'TIMESTAMP', constraints: 'DEFAULT NOW()' },
      { name: 'updated_at', type: 'TIMESTAMP', constraints: 'DEFAULT NOW()' }
    ]);
    console.log(usersResult.message);
    
    // Accounts Table
    console.log('Creating accounts table...');
    const accountsResult = await dbManager.createTableIfNotExists('accounts', [
      { name: 'id', type: 'UUID', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'instagram_id', type: 'TEXT', constraints: 'UNIQUE' },
      { name: 'username', type: 'TEXT' },
      { name: 'full_name', type: 'TEXT' },
      { name: 'profile_picture', type: 'TEXT' },
      { name: 'access_token', type: 'TEXT' },
      { name: 'is_active', type: 'BOOLEAN', constraints: 'DEFAULT TRUE' },
      { name: 'created_at', type: 'TIMESTAMP', constraints: 'DEFAULT NOW()' },
      { name: 'connected_at', type: 'TIMESTAMP', constraints: 'DEFAULT NOW()' },
      { name: 'updated_at', type: 'TIMESTAMP', constraints: 'DEFAULT NOW()' },
      { name: 'token_updated_at', type: 'TIMESTAMP' },
      { name: 'token_expires_at', type: 'TIMESTAMP' },
      { name: 'plan_id', type: 'TEXT' },
      { name: 'subscription_expires_at', type: 'TIMESTAMP' }
    ]);
    console.log(accountsResult.message);


    console.log('Creating email_verification table...');
    const emailVerificationResult = await dbManager.createTableIfNotExists('email_verification', [
      { name: 'id', type: 'UUID', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'email', type: 'VARCHAR(255)', constraints: 'NOT NULL' },
      { name: 'verification_code', type: 'VARCHAR(10)', constraints: 'NOT NULL' },
      { name: 'expires_at', type: 'TIMESTAMP', constraints: 'NOT NULL' },
      { name: 'created_at', type: 'TIMESTAMP', constraints: 'DEFAULT CURRENT_TIMESTAMP' }
    ]);
    console.log(emailVerificationResult.message);

    
    // Account Admins Table
    console.log('Creating account_admins table...');
    const accountAdminsResult = await dbManager.createTableIfNotExists('account_admins', [
      { name: 'id', type: 'UUID', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'user_id', type: 'UUID', constraints: 'REFERENCES users(id) ON DELETE CASCADE' },
      { name: 'account_id', type: 'UUID', constraints: 'REFERENCES accounts(id) ON DELETE CASCADE' },
      { name: 'role', type: 'TEXT', constraints: 'DEFAULT \'admin\'' },
      { name: 'added_at', type: 'TIMESTAMP', constraints: 'DEFAULT NOW()' }
    ]);
    console.log(accountAdminsResult.message);
    
    // Add unique constraint to account_admins
    await dbManager.pool.query('ALTER TABLE account_admins ADD CONSTRAINT unique_user_account UNIQUE (user_id, account_id);');
    console.log('Added unique constraint to account_admins');
    
    // Account Automation Defaults Table
    console.log('Creating account_automation_defaults table...');
    const accountAutomationDefaultsResult = await dbManager.createTableIfNotExists('account_automation_defaults', [
      { name: 'account_id', type: 'UUID', constraints: 'PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE' },
      { name: 'keywords', type: 'TEXT[]', constraints: 'DEFAULT ARRAY[\'send\', \'dm me\']' },
      { name: 'trigger_on_sharing', type: 'BOOLEAN', constraints: 'DEFAULT TRUE' },
      { name: 'auto_public_reply', type: 'BOOLEAN', constraints: 'DEFAULT TRUE' },
      { name: 'auto_reply_messages', type: 'TEXT[]', constraints: 'DEFAULT ARRAY[\'Please check your DM or message request\', \'check your DM\']' },
      { name: 'auto_reply_mode', type: 'TEXT', constraints: 'DEFAULT \'MANUAL\'' },
      { name: 'auto_reply_ai_prompt', type: 'TEXT' },
      { name: 'auto_reply_limit', type: 'INTEGER', constraints: 'DEFAULT 100' },
      { name: 'ask_to_follow', type: 'BOOLEAN', constraints: 'DEFAULT TRUE' },
      { name: 'ask_follow_text', type: 'TEXT', constraints: 'DEFAULT \'long text\'' },
      { name: 'ask_follow_button', type: 'TEXT', constraints: 'DEFAULT \'Yes, I follow\'' },
      { name: 'created_at', type: 'TIMESTAMP', constraints: 'DEFAULT NOW()' },
      { name: 'updated_at', type: 'TIMESTAMP', constraints: 'DEFAULT NOW()' }
    ]);
    console.log(accountAutomationDefaultsResult.message);
    
    // Automations Table
    console.log('Creating automations table...');
    const automationsResult = await dbManager.createTableIfNotExists('automations', [
      { name: 'id', type: 'UUID', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'account_id', type: 'UUID', constraints: 'REFERENCES accounts(id) ON DELETE CASCADE' },
      { name: 'name', type: 'TEXT' },
      { name: 'type', type: 'TEXT' },
      { name: 'instagram_user_id', type: 'TEXT' },
      { name: 'media_type', type: 'TEXT' },
      { name: 'media_url', type: 'TEXT' },
      { name: 'media_id', type: 'TEXT' },
      { name: 'is_story', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' },
      { name: 'is_universal', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' },
      { name: 'trigger_type', type: 'TEXT' },
      { name: 'keyword_trigger_type', type: 'TEXT' },
      { name: 'trigger_on_sharing', type: 'BOOLEAN', constraints: 'DEFAULT TRUE' },
      { name: 'keywords', type: 'TEXT[]', constraints: 'DEFAULT \'{}\'::TEXT[]' },
      { name: 'dm_message', type: 'TEXT' },
      { name: 'auto_public_reply', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' },
      { name: 'auto_reply_messages', type: 'TEXT[]', constraints: 'DEFAULT \'{}\'::TEXT[]' },
      { name: 'auto_reply_mode', type: 'TEXT' },
      { name: 'auto_reply_ai_prompt', type: 'TEXT' },
      { name: 'auto_reply_limit', type: 'INTEGER', constraints: 'DEFAULT 0' },
      { name: 'ask_to_follow', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' },
      { name: 'ask_follow_text', type: 'TEXT' },
      { name: 'ask_follow_button', type: 'TEXT' },
      { name: 'generic_template', type: 'JSONB' },
      { name: 'addition_buttons', type: 'JSONB' },
      { name: 'extra_data', type: 'JSONB' },
      { name: 'disable_auto_reply', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' },
      { name: 'disable_url_tracking', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' },
      { name: 'use_next_post', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' },
      { name: 'use_next_story', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' },
      { name: 'use_rewind', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' },
      { name: 'has_any_next_post', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' },
      { name: 'is_active', type: 'BOOLEAN', constraints: 'DEFAULT TRUE' },
      { name: 'created_at', type: 'TIMESTAMP', constraints: 'DEFAULT NOW()' },
      { name: 'updated_at', type: 'TIMESTAMP', constraints: 'DEFAULT NOW()' }
    ]);
    console.log(automationsResult.message);
    
    // Create indexes for better performance
    console.log('Creating indexes...');
    
    // Index on users
    await dbManager.pool.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);');
    
    // Indexes on accounts
    await dbManager.pool.query('CREATE INDEX IF NOT EXISTS idx_accounts_instagram_id ON accounts(instagram_id);');
    await dbManager.pool.query('CREATE INDEX IF NOT EXISTS idx_accounts_username ON accounts(username);');
    
    // Indexes on account_admins
    await dbManager.pool.query('CREATE INDEX IF NOT EXISTS idx_account_admins_user_id ON account_admins(user_id);');
    await dbManager.pool.query('CREATE INDEX IF NOT EXISTS idx_account_admins_account_id ON account_admins(account_id);');
    
    // Indexes on automations
    await dbManager.pool.query('CREATE INDEX IF NOT EXISTS idx_automations_account_id ON automations(account_id);');
    await dbManager.pool.query('CREATE INDEX IF NOT EXISTS idx_automations_media_id ON automations(media_id);');
    
    console.log('✅ Database schema setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error setting up database schema:', error);
  } finally {
    // Close the pool
    await dbManager.pool.end();
    console.log('Database connection pool closed.');
  }
})();