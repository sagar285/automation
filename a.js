// Inside your router.get("/auth/instagram/callback", async (req, res) => { ... });

// ... (after getting longLivedToken, expiresIn, instagramId)

const expirationDate = new Date();
expirationDate.setSeconds(expirationDate.getSeconds() + expiresIn);
const tokenUpdatedAt = new Date();

// --- Fetch Username and Profile Picture (Recommended) ---
let username = null;
let profilePicture = null;
try {
    const userInfoResponse = await axios.get(
        `https://graph.instagram.com/v22.0/${instagramId}`, // Use correct API version
        {
            params: {
                fields: 'id,username,profile_picture_url', // Add other fields if needed
                access_token: longLivedToken
            }
        }
    );
    username = userInfoResponse.data.username;
    profilePicture = userInfoResponse.data.profile_picture_url; // May not always be available depending on permissions/account type
    console.log(`Fetched user info: Username=${username}`);
} catch (userInfoError) {
     console.error("Error fetching user info (username/profile pic):", userInfoError.response?.data || userInfoError.message);
     // Proceed without username/profile pic if fetching fails
}
// --- End Fetch User Info ---


// First, check if account already exists using the IGSID
const accountResult = await pool.query(
    // Check against the column you primarily use for existence check (e.g., instagram_id)
    "SELECT id FROM accounts WHERE instagram_id = $1",
    [instagramId]
);

let accountId;

if (accountResult.rows.length > 0) {
    // Account exists, update it
    accountId = accountResult.rows[0].id;
    console.log(`Account exists (ID: ${accountId}). Updating token, username, and user_insta_business_id.`);

    await pool.query(
        `UPDATE accounts
           SET access_token = $1,
               token_expires_at = $2,
               token_updated_at = $3,
               user_insta_business_id = $4, -- <<< UPDATE the new column
               username = $5,               -- <<< UPDATE username
               profile_picture = $6,        -- <<< UPDATE profile picture
               updated_at = NOW(),
               is_active = TRUE             -- Ensure account is marked active
         WHERE id = $7`, // Update based on internal DB ID
        [longLivedToken, expirationDate, tokenUpdatedAt, instagramId, username, profilePicture, accountId]
    );

} else {
    // Account doesn't exist, insert it
    console.log(`Account does not exist for IGSID ${instagramId}. Inserting new record.`);
    const insertResult = await pool.query(
        `INSERT INTO accounts
           (instagram_id, user_insta_business_id, access_token, token_expires_at, token_updated_at, username, profile_picture, is_active)
         VALUES ($1, $1, $2, $3, $4, $5, $6, TRUE) -- <<< Use $1 (instagramId) for BOTH ID columns
         RETURNING id`,
        [instagramId, longLivedToken, expirationDate, tokenUpdatedAt, username, profilePicture]
    );
    accountId = insertResult.rows[0].id;
    console.log(`New account inserted with ID: ${accountId}`);
}

// ... (rest of your callback logic: linking to user via account_admins, redirecting)

