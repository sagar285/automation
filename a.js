// scripts/create-schema.js
const dbManager = require('../dbmanager'); // Adjust path if needed

(async function setupSchema() {
    // Ensure the pool is available for direct queries if needed
    const pool = dbManager.pool;

    try {
        console.log('Setting up database schema...');

        // Enable UUID extension if not already enabled
        await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
        console.log('UUID extension enabled');

        // --- Users Table ---
        console.log('Creating users table...');
        const usersResult = await dbManager.createTableIfNotExists('users', [
            { name: 'id', type: 'UUID', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()' }, // Changed default for consistency
            { name: 'name', type: 'TEXT' },
            { name: 'email', type: 'TEXT', constraints: 'UNIQUE NOT NULL' }, // Added NOT NULL
            { name: 'phone_number', type: 'TEXT' },
            { name: 'profile_picture', type: 'TEXT' },
            { name: 'country', type: 'TEXT' },
            { name: 'is_active', type: 'BOOLEAN', constraints: 'DEFAULT TRUE' },
            { name: 'is_admin', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' },
            { name: 'auth_provider', type: 'TEXT' }, // e.g., 'google', 'instagram'
            { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', constraints: 'DEFAULT NOW()' }, // Use TIMESTAMPTZ
            { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE', constraints: 'DEFAULT NOW()' }  // Use TIMESTAMPTZ
        ]);
        if (!usersResult.success && !usersResult.message.includes('already exists')) throw new Error(usersResult.message);
        console.log(usersResult.message);

        // --- Accounts Table ---
        console.log('Creating accounts table...');
        const accountsResult = await dbManager.createTableIfNotExists('accounts', [
            { name: 'id', type: 'UUID', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'instagram_id', type: 'TEXT', constraints: 'UNIQUE' }, // Original IGSID from Auth
            { name: 'user_insta_business_id', type: 'TEXT', constraints: 'UNIQUE' }, // Added based on previous request, ensure it's populated
            { name: 'username', type: 'TEXT' },
            { name: 'full_name', type: 'TEXT' },
            { name: 'profile_picture', type: 'TEXT' },
            { name: 'access_token', type: 'TEXT' }, // Store securely! Consider encryption
            { name: 'is_active', type: 'BOOLEAN', constraints: 'DEFAULT TRUE' },
            { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', constraints: 'DEFAULT NOW()' }, // Use TIMESTAMPTZ
            { name: 'connected_at', type: 'TIMESTAMP WITH TIME ZONE', constraints: 'DEFAULT NOW()' },// Use TIMESTAMPTZ
            { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE', constraints: 'DEFAULT NOW()' }, // Use TIMESTAMPTZ
            { name: 'token_updated_at', type: 'TIMESTAMP WITH TIME ZONE' }, // Use TIMESTAMPTZ
            { name: 'token_expires_at', type: 'TIMESTAMP WITH TIME ZONE' }, // Use TIMESTAMPTZ
            { name: 'plan_id', type: 'TEXT' }, // Could reference a 'plans' table later
            { name: 'subscription_expires_at', type: 'TIMESTAMP WITH TIME ZONE' } // Use TIMESTAMPTZ
        ]);
         if (!accountsResult.success && !accountsResult.message.includes('already exists')) throw new Error(accountsResult.message);
        console.log(accountsResult.message);

        // --- Email Verification Table ---
        console.log('Creating email_verification table...');
        const emailVerificationResult = await dbManager.createTableIfNotExists('email_verification', [
             { name: 'id', type: 'UUID', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()' },
             { name: 'email', type: 'VARCHAR(255)', constraints: 'NOT NULL' },
             { name: 'verification_code', type: 'VARCHAR(10)', constraints: 'NOT NULL' },
             { name: 'expires_at', type: 'TIMESTAMP WITH TIME ZONE', constraints: 'NOT NULL' }, // Use TIMESTAMPTZ
             { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', constraints: 'DEFAULT NOW()' } // Use TIMESTAMPTZ
        ]);
         if (!emailVerificationResult.success && !emailVerificationResult.message.includes('already exists')) throw new Error(emailVerificationResult.message);
        console.log(emailVerificationResult.message);

        // --- Account Admins Table ---
        console.log('Creating account_admins table...');
        const accountAdminsResult = await dbManager.createTableIfNotExists('account_admins', [
            { name: 'id', type: 'UUID', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'user_id', type: 'UUID', constraints: 'NOT NULL REFERENCES users(id) ON DELETE CASCADE' }, // Added NOT NULL
            { name: 'account_id', type: 'UUID', constraints: 'NOT NULL REFERENCES accounts(id) ON DELETE CASCADE' }, // Added NOT NULL
            { name: 'role', type: 'TEXT', constraints: 'DEFAULT \'admin\'' }, // e.g., 'admin', 'editor'
            { name: 'added_at', type: 'TIMESTAMP WITH TIME ZONE', constraints: 'DEFAULT NOW()' } // Use TIMESTAMPTZ
        ]);
         if (!accountAdminsResult.success && !accountAdminsResult.message.includes('already exists')) throw new Error(accountAdminsResult.message);
        console.log(accountAdminsResult.message);

        // Add unique constraint separately to avoid issues with IF NOT EXISTS potentially skipping it
        try {
            await pool.query('ALTER TABLE account_admins ADD CONSTRAINT unique_user_account UNIQUE (user_id, account_id);');
            console.log('Added unique constraint to account_admins');
        } catch (constraintError) {
            if (constraintError.message.includes('already exists')) {
                console.log('Unique constraint unique_user_account already exists on account_admins.');
            } else {
                throw constraintError; // Re-throw other errors
            }
        }

        // --- Account Automation Defaults Table ---
        console.log('Creating account_automation_defaults table...');
        const accountAutomationDefaultsResult = await dbManager.createTableIfNotExists('account_automation_defaults', [
            { name: 'account_id', type: 'UUID', constraints: 'PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE' },
            { name: 'keywords', type: 'TEXT[]', constraints: 'DEFAULT ARRAY[\'send\', \'link\']::TEXT[]' }, // Adjusted default
            { name: 'trigger_on_sharing', type: 'BOOLEAN', constraints: 'DEFAULT TRUE' },
            { name: 'is_auto_reply_enabled', type: 'BOOLEAN', constraints: 'DEFAULT TRUE' }, // Renamed from auto_public_reply
            { name: 'auto_reply_messages', type: 'TEXT[]', constraints: 'DEFAULT ARRAY[\'Please check your DM or message request\', \'check your DM\']::TEXT[]' },
            { name: 'auto_reply_mode', type: 'TEXT', constraints: 'DEFAULT \'MANUAL\'' },
            { name: 'auto_reply_ai_prompt', type: 'TEXT' },
            { name: 'auto_reply_limit', type: 'INTEGER', constraints: 'DEFAULT 1' }, // Changed default limit
            { name: 'ask_to_follow', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' }, // Changed default
            { name: 'ask_follow_text', type: 'TEXT', constraints: 'DEFAULT \'Please follow us to get the message!\'' }, // Changed default
            { name: 'ask_follow_button', type: 'TEXT', constraints: 'DEFAULT \'Followed\'' }, // Changed default
            { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', constraints: 'DEFAULT NOW()' }, // Use TIMESTAMPTZ
            { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE', constraints: 'DEFAULT NOW()' } // Use TIMESTAMPTZ
        ]);
         if (!accountAutomationDefaultsResult.success && !accountAutomationDefaultsResult.message.includes('already exists')) throw new Error(accountAutomationDefaultsResult.message);
        console.log(accountAutomationDefaultsResult.message);

        // --- REVISED Automations Table ---
        console.log('Creating REVISED automations table...');
        const automationsResult = await dbManager.createTableIfNotExists('automations', [
            { name: 'id', type: 'UUID', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'account_id', type: 'UUID', constraints: 'NOT NULL REFERENCES accounts(id) ON DELETE CASCADE' },
            { name: 'name', type: 'TEXT', constraints: 'NOT NULL' }, // Automation title from user
            { name: 'type', type: 'TEXT', constraints: 'NOT NULL' }, // 'COMMENT', 'DM', 'MENTION', 'STORY_REPLY', etc.
            { name: 'is_universal', type: 'BOOLEAN', constraints: 'NOT NULL DEFAULT FALSE' },
            { name: 'use_next_post', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' },
            { name: 'use_next_story', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' },
            { name: 'trigger_type', type: 'TEXT' }, // 'CONTAINS_ANY', 'EXACT_MATCH', 'CONTAINS_ALL'
            { name: 'keywords', type: 'TEXT[]', constraints: 'DEFAULT \'{}\'::TEXT[]' },
            { name: 'trigger_on_sharing', type: 'BOOLEAN', constraints: 'DEFAULT TRUE' },
            { name: 'dm_message', type: 'TEXT' }, // Primary text for DMs
            { name: 'generic_template', type: 'JSONB' }, // Payload for Button/Generic Templates
            { name: 'addition_buttons', type: 'JSONB' }, // Payload for Quick Replies
            { name: 'is_auto_reply_enabled', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' }, // Renamed
            { name: 'auto_reply_messages', type: 'TEXT[]', constraints: 'DEFAULT \'{}\'::TEXT[]' },
            { name: 'auto_reply_mode', type: 'TEXT', constraints: 'DEFAULT \'MANUAL\'' }, // 'MANUAL', 'AI'
            { name: 'auto_reply_ai_prompt', type: 'TEXT' },
            { name: 'auto_reply_limit', type: 'INTEGER', constraints: 'DEFAULT 1' }, // Default limit 1
            { name: 'ask_to_follow', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' },
            { name: 'ask_follow_text', type: 'TEXT' },
            { name: 'ask_follow_button', type: 'TEXT' }, // Label for the "I Follow" button
            { name: 'remove_branding', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' }, // New field
            { name: 'disable_url_tracking', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' },
            { name: 'use_rewind', type: 'BOOLEAN', constraints: 'DEFAULT FALSE' }, // Backtrack
            { name: 'is_active', type: 'BOOLEAN', constraints: 'DEFAULT TRUE' },
            { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', constraints: 'DEFAULT NOW()' },
            { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE', constraints: 'DEFAULT NOW()' }
        ]);
         if (!automationsResult.success && !automationsResult.message.includes('already exists')) throw new Error(automationsResult.message);
        console.log(automationsResult.message);

        // --- NEW Automation Media Linking Table ---
        console.log('Creating automation_media table...');
        const automationMediaResult = await dbManager.createTableIfNotExists('automation_media', [
            { name: 'automation_id', type: 'UUID', constraints: 'NOT NULL REFERENCES automations(id) ON DELETE CASCADE' },
            { name: 'media_id', type: 'TEXT', constraints: 'NOT NULL' }, // Specific IG media ID
            { name: 'PRIMARY KEY', type: '(automation_id, media_id)' } // Composite primary key definition
        ]);
         if (!automationMediaResult.success && !automationMediaResult.message.includes('already exists')) throw new Error(automationMediaResult.message);
        console.log(automationMediaResult.message);

        // --- NEW Automation Logs Table ---
        console.log('Creating automation_logs table...');
        const automationLogsResult = await dbManager.createTableIfNotExists('automation_logs', [
             { name: 'id', type: 'UUID', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()' },
             { name: 'automation_id', type: 'UUID', constraints: 'REFERENCES automations(id) ON DELETE SET NULL' }, // Allow NULL if automation deleted
             { name: 'account_id', type: 'UUID', constraints: 'NOT NULL REFERENCES accounts(id) ON DELETE CASCADE' },
             { name: 'recipient_ig_id', type: 'TEXT', constraints: 'NOT NULL' }, // User who commented/messaged
             { name: 'source_ig_id', type: 'TEXT' }, // Comment/Message ID being replied to
             { name: 'media_ig_id', type: 'TEXT' },  // Media ID involved (if applicable)
             { name: 'action_type', type: 'TEXT', constraints: 'NOT NULL' }, // 'public_reply', 'dm_sent', 'follow_check_dm'
             { name: 'content_details', type: 'TEXT' }, // Optional: Store message sent
             { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', constraints: 'DEFAULT NOW()' }
        ]);
        if (!automationLogsResult.success && !automationLogsResult.message.includes('already exists')) throw new Error(automationLogsResult.message);
        console.log(automationLogsResult.message);


        // --- Create Indexes ---
        console.log('Creating indexes...');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_accounts_instagram_id ON accounts(instagram_id);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_accounts_user_insta_business_id ON accounts(user_insta_business_id);'); // Index new column
        await pool.query('CREATE INDEX IF NOT EXISTS idx_accounts_username ON accounts(username);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_account_admins_user_id ON account_admins(user_id);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_account_admins_account_id ON account_admins(account_id);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_automations_account_id ON automations(account_id);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_automations_type ON automations(type);'); // Index on new type field
        await pool.query('CREATE INDEX IF NOT EXISTS idx_automation_media_media_id ON automation_media(media_id);'); // Index on new linking table
        await pool.query('CREATE INDEX IF NOT EXISTS idx_automation_logs_account_action ON automation_logs(account_id, recipient_ig_id, action_type);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_automation_logs_source_id ON automation_logs(source_ig_id);');
        console.log('Indexes created or already exist.');

        // --- Create Trigger Function for updated_at ---
        console.log('Creating or replacing trigger function trigger_set_timestamp...');
        await pool.query(`
            CREATE OR REPLACE FUNCTION trigger_set_timestamp()
            RETURNS TRIGGER AS $$
            BEGIN
              NEW.updated_at = NOW();
              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        console.log('Trigger function created or replaced.');

        // --- Apply Trigger to Tables ---
        const tablesToTrigger = ['users', 'accounts', 'account_automation_defaults', 'automations'];
        for (const tableName of tablesToTrigger) {
            console.log(`Applying timestamp trigger to ${tableName}...`);
            await pool.query(`
                DO $$
                BEGIN
                  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp' AND tgrelid = '${tableName}'::regclass) THEN
                    CREATE TRIGGER set_timestamp
                    BEFORE UPDATE ON ${tableName}
                    FOR EACH ROW
                    EXECUTE FUNCTION trigger_set_timestamp();
                    RAISE NOTICE 'Trigger set_timestamp created on ${tableName}.';
                  ELSE
                    RAISE NOTICE 'Trigger set_timestamp already exists on ${tableName}.';
                  END IF;
                END $$;
            `);
        }
        console.log('Timestamp triggers applied.');

        console.log('✅ Database schema setup completed successfully!');

    } catch (error) {
        console.error('❌ Error setting up database schema:', error);
        // Optionally re-throw or handle specific errors
    } finally {
        // Close the pool if this script is meant to run standalone
        // await pool.end();
        // console.log('Database connection pool closed.');
        // If part of app startup, don't close the pool here.
    }
})();
