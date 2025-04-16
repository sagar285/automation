const crypto = require('crypto');
const axios = require('axios');
const { Pool, types } = require('pg'); // Import Pool from pg
const dotenv = require('dotenv');

// --- Database Configuration ---
dotenv.config();
types.setTypeParser(types.builtins.INT8, (val) => val);
types.setTypeParser(types.builtins.NUMERIC, (val) => val);
const pool = new Pool({
    user: process.env.DB_USER || 'instauser',
    host: process.env.DB_HOST || '213.199.51.192',
    database: process.env.DB_NAME || 'instaautomation',
    password: process.env.DB_PASSWORD || 'Postgres@123',
    port: process.env.DB_PORT || 5432,
});
pool.connect() /* ... connection test ... */ ;
// --- End Database Configuration ---


// --- Middleware for Webhook Verification ---
const verifyWebhookSignature = (req, res, next) => {
    // (Implementation remains the same - requires req.rawBody and INSTAGRAM_APP_SECRET)
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) { console.warn('Sig missing'); return res.sendStatus(400); }
    if (!req.rawBody) { console.error('Raw body missing'); return res.sendStatus(500); }
    try {
        const expectedSignature = 'sha256=' + crypto
            .createHmac('sha256', process.env.INSTAGRAM_APP_SECRET)
            .update(req.rawBody, 'utf-8')
            .digest('hex');
        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
            console.warn('Invalid webhook signature.');
            return res.sendStatus(403);
        }
        console.log("Webhook signature verified successfully.");
        next();
    } catch (error) {
        console.error('Error during signature verification:', error);
        res.sendStatus(200); // Acknowledge even on error
    }
};

// --- GET Handler for Subscription ---
const getWebhookController = async (req, res) => {
    // (Implementation remains the same)
    console.log("Received GET /webhook verification request:", req.query);
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN; // Ensure this is set in .env

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("Webhook verification successful!");
        res.status(200).send(challenge);
    } else {
        console.error("Webhook verification failed. Mode or Token mismatch.");
        res.sendStatus(403);
    }
};

// --- POST Handler for Incoming Webhook Events ---
const postwebhookHandler = async (req, res) => {
    // Body should be parsed by express.json() placed AFTER verifyWebhookSignature in router
    console.log("Webhook POST received (Expecting Parsed Body):", JSON.stringify(req.body, null, 2));

    // Basic validation of the incoming request body
    if (typeof req.body !== 'object' || req.body === null || !Array.isArray(req.body.entry)) {
        console.warn("Webhook body missing 'entry' array or not an object. Sending 200 OK.");
        return res.sendStatus(200); // Acknowledge, but invalid format
    }

    // --- Process Each Entry ---
    // We process entries sequentially for simplicity here.
    // High-volume scenarios might benefit from parallel processing or queuing.
    for (const entry of req.body.entry) {
        const recipientIgId = entry.id; // IGSID of *your* page/account that received event

        if (!recipientIgId) {
            console.warn("Webhook entry missing recipient ID (entry.id). Skipping entry.");
            continue; // Skip this entry if ID is missing
        }

        // 1. Find Account Info using user_insta_business_id
        let accountInfo;
        try {
            // Fetch needed account details. Ensure username is fetched for follow button link.
            const accountQuery = `
                SELECT id as account_db_id, access_token
                FROM accounts
                WHERE user_insta_business_id = $1 AND is_active = TRUE
                LIMIT 1`;
            const { rows } = await pool.query(accountQuery, [recipientIgId]);

            if (rows.length === 0) {
                console.log(`No active account found for business ID ${recipientIgId}. Webhook ignored for this entry.`);
                // We still send 200 OK later, just don't process this entry further.
                continue; // Skip to the next entry
            }
            accountInfo = rows[0];

            // Validate essential info
            if (!accountInfo.accessToken) {
                console.error(`CRITICAL: Access token missing for account DB ID ${accountInfo.accountDbId} (IG ID ${recipientIgId}). Skipping processing for this entry.`);
                continue; // Skip to the next entry
            }
            

            console.log(`Found account ${accountInfo.accountDbId} for recipient ${recipientIgId}. Will process events asynchronously.`);

            // --- Send 200 OK Immediately ---
            // Send response now before heavy processing.
            // Note: This means errors during async processing won't affect the response to Instagram.
            if (!res.headersSent) {
                 res.sendStatus(200);
                 console.log("Sent 200 OK response to Instagram.");
            }
            // --- End Immediate Response ---


            // --- Asynchronous Processing ---
            // Use setTimeout to allow the event loop to send the response before processing starts.
            setTimeout(async () => {
                console.log(`Starting async processing for account ${accountInfo.accountDbId}...`);
                try {
                    // Process Comments if 'changes' field exists
                    if (entry.changes && Array.isArray(entry.changes)) {
                        for (const change of entry.changes) {
                            if (change.field === 'comments' && change.value) {
                                // Pass the fetched accountInfo to the processor
                                await processCommentEventAsync(change.value, accountInfo);
                            }
                            // Add handlers for other 'changes' like mentions if needed
                        }
                    }

                    // Process Direct Messages if 'messaging' field exists (Placeholder)
                    if (entry.messaging && Array.isArray(entry.messaging)) {
                        for (const messageEvent of entry.messaging) {
                            if (messageEvent.message && !messageEvent.message.is_echo) {
                                console.log("DM processing not implemented in this version.");
                                // await processDirectMessageEventAsync(messageEvent, accountInfo);
                            } else if (messageEvent.postback) {
                                console.log("Postback processing not implemented in this version.");
                                // await processPostbackEventAsync(messageEvent, accountInfo);
                            }
                        }
                    }
                    console.log(`Finished async processing for account ${accountInfo.accountDbId}.`);
                } catch (asyncError) {
                    // Log errors happening during the async processing
                    console.error(`Error during async processing for account ${accountInfo.accountDbId}:`, asyncError);
                }
            }, 0);
            // --- End Asynchronous Processing ---

        } catch (dbError) {
            console.error(`Database error looking up account for ${recipientIgId}:`, dbError);
            // If DB error occurs before sending 200, send 200 anyway to acknowledge webhook
            if (!res.headersSent) {
                 res.sendStatus(200);
                 console.log("Sent 200 OK response to Instagram after DB error during account lookup.");
            }
        }

    } // End for entry loop

    // Ensure 200 OK is sent if loop finishes without finding/processing entries or sending earlier
    if (!res.headersSent) {
        res.sendStatus(200);
        console.log("Sent final 200 OK response.");
    }
};


// ===========================================
// ASYNCHRONOUS Event Processors
// ===========================================

// Renamed to indicate it runs async after the response
async function processCommentEventAsync(commentData, accountInfo) {
    const { accountDbId, accessToken, recipientIgId } = accountInfo;
   
    console.log(`ASYNC: Processing comment event for account DB ID: ${accountDbId}`);
    const mediaId = commentData.media?.id;
    const commentId = commentData.id;
    const commentText = commentData.text?.toLowerCase() || '';
    const commenterIgId = commentData.from?.id;

    if (!mediaId || !commentId || !commentText || !commenterIgId) {
        console.log("ASYNC: Incomplete comment data, skipping.");
        return;
    }

    // 1. Find Automation using ORIGINAL schema structure
    // Query filters by the specific account ID and media/universal status
    const query = `
        SELECT * -- Select all fields from original schema
        FROM automations
        WHERE account_id = $1 -- Filter by the specific account's DB ID
          AND (media_id = $2 OR is_universal = TRUE) -- Use media_id column
        ORDER BY
            CASE WHEN media_id = $2 THEN 1 ELSE 2 END, -- Prioritize specific media match
            created_at DESC
        LIMIT 1;
    `;
    let automation;
    try {
        const { rows } = await pool.query(query, [accountDbId, mediaId]);
        if (rows.length === 0) {
            console.log(`ASYNC: No active automation found for account ${accountDbId} matching media ${mediaId} or universal.`);
            return;
        }
        automation = rows[0];
        // Use original field name: auto_public_reply
        console.log(`ASYNC: Using automation ${automation.id} (Media Specific: ${automation.media_id === mediaId}, Public Reply Enabled: ${automation.auto_public_reply}) for comment ${commentId}`);

    } catch (dbError) {
        console.error(`ASYNC: Database error finding automation for comment:`, dbError);
        return;
    }

    // 2. Check Keywords
    const keywordMatch = checkKeywords(commentText, automation.keywords, automation.keyword_trigger_type);

    // 3. Handle Public Auto-Reply (if enabled in original schema)
    // Use original field name 'auto_public_reply'
    if (automation.auto_public_reply) {
        await handlePublicReply(automation, accountInfo, commentId, commenterIgId);
    } else {
         console.log(`ASYNC: Public reply disabled (auto_public_reply=false) for automation ${automation.id}.`);
    }

    // 4. Proceed with DM/Follow Check ONLY if keywords match
    if (!keywordMatch) {
         console.log(`ASYNC: Comment text "${commentText}" does not match keywords for automation ${automation.id}. No DM action.`);
         return;
    }
    console.log("ASYNC: Keyword match successful or not required. Proceeding with potential DM.");

    // 5. Check Follower Status (if required)
    let proceedWithDm = true;
    if (automation.ask_to_follow) { // Use original schema field
        console.log(`ASYNC: Checking follower status for automation ${automation.id}...`);
        const isFollowing = await checkFollowerStatus(commenterIgId, recipientIgId, accessToken);
        if (!isFollowing) {
            proceedWithDm = false;
            console.log(`ASYNC: User ${commenterIgId} is not following ${recipientIgId}. Sending follow prompt.`);
            // Use original schema fields for text/button label
            const followPromptMessage = constructFollowPrompt(automation, commenterIgId, commentId, recipientIgUsername);
            if (!(await hasSentLog(accountDbId, commenterIgId, commentId, 'follow_check_dm'))) {
                const sent = await sendDirectMessage(commentId, followPromptMessage, accessToken);
                if (sent) {
                    await logAction(automation.id, accountDbId, commenterIgId, commentId, mediaId, 'follow_check_dm');
                }
            } else {
                 console.log(`ASYNC: Follow prompt already sent log found for comment ${commentId} to user ${commenterIgId}.`);
            }
        } else {
             console.log(`ASYNC: User ${commenterIgId} is already following ${recipientIgId}. OK to send main DM.`);
        }
    } else {
         console.log(`ASYNC: Ask to follow disabled for automation ${automation.id}.`);
    }

    // 6. Send the Main DM (Private Reply) if checks passed
    if (proceedWithDm) {
        console.log(`ASYNC: Proceeding to send main DM for comment ${commentId}.`);
        // Use original schema fields for content
        const dmContent = constructDmContent(automation);
        if (!(await hasSentLog(accountDbId, commenterIgId, commentId, 'dm_sent'))) {
            const sent = await sendDirectMessage(commentId, dmContent, accessToken);
             if (sent) {
                await logAction(automation.id, accountDbId, commenterIgId, commentId, mediaId, 'dm_sent');
             }
        } else {
             console.log(`ASYNC: Main DM already sent log found for comment ${commentId} to user ${commenterIgId}.`);
        }
    }
}

// ===========================================
// Utility Functions (Adapted for ORIGINAL Schema where needed)
// ===========================================

// Keyword check remains the same conceptually
function checkKeywords(text, keywords, triggerType = 'contains_any') {
    if (!keywords || keywords.length === 0) return true;
    const lowerText = text?.toLowerCase() || '';
    for (const keyword of keywords) {
        if (!keyword) continue;
        const lowerKeyword = keyword.toLowerCase();
        if (lowerText.includes(lowerKeyword)) return true;
    }
    return false;
}

// Follower check remains the same API call
async function checkFollowerStatus(userIdToCheck, businessAccountIgId, accessToken) {
    const apiVersion = process.env.IG_API_VERSION || "v22.0";
    const url = `https://graph.facebook.com/${apiVersion}/${userIdToCheck}`; // Instagram Graph API endpoint
    console.log(`Checking follower status via API: Does ${userIdToCheck} follow ${businessAccountIgId}?`);
    try {
        const response = await axios.get(url, { params: { fields: 'friendship_status', access_token: accessToken } });
        if (response.data?.friendship_status && typeof response.data.friendship_status.followed_by === 'boolean') {
            const isFollowing = response.data.friendship_status.followed_by;
            console.log(`API check result: User ${userIdToCheck} followed_by status: ${isFollowing}`);
            return isFollowing;
        }
        console.warn(`Could not determine follower status from API response for user ${userIdToCheck}.`);
        return false;
    } catch (error) {
        console.error(`Error checking follower status for user ${userIdToCheck}:`, error.response?.data ? JSON.stringify(error.response.data) : error.message);
        return false; // Assume not following on error
    }
}

// Public Reply uses ORIGINAL schema fields
async function handlePublicReply(automation, accountInfo, commentId, commenterIgId) {
     // Use original field name 'auto_public_reply'
     if (!automation.auto_public_reply) {
         // console.log("Public reply disabled (auto_public_reply=false)."); // Already logged in caller
         return;
     }

    const { accountDbId, accessToken } = accountInfo;

    // Check limit using logs
    const replyCount = await countRecentLogs(accountDbId, commenterIgId, commentId, 'public_reply');
    // Use original field name 'auto_reply_limit', default to 1
    const limit = automation.auto_reply_limit > 0 ? automation.auto_reply_limit : 1;

    if (replyCount >= limit) {
        console.log(`Public reply limit (${limit}) reached for user ${commenterIgId} on comment ${commentId}. No reply sent.`);
        return;
    }

    // Select Reply Message using original field 'auto_reply_messages'
    let replyText = "Thanks!"; // Default fallback
    if (automation.auto_reply_messages && automation.auto_reply_messages.length > 0) {
        // Use original field 'auto_reply_mode' if implementing AI/Sequential later
        const randomIndex = Math.floor(Math.random() * automation.auto_reply_messages.length);
        replyText = automation.auto_reply_messages[randomIndex];
    } else {
         console.log("No auto-reply messages configured, using default.");
    }

    // Send Reply via API
    const apiVersion = process.env.IG_API_VERSION || "v22.0";
    const url = `https://graph.facebook.com/${apiVersion}/${commentId}/replies`; // Instagram Graph API endpoint
    console.log(`Attempting to send public reply to comment ${commentId}: "${replyText}"`);
    try {
        const response = await axios.post(url, { message: replyText }, { headers: { Authorization: `Bearer ${accessToken}` } });
        console.log("Public reply sent successfully. Response ID:", response.data?.id);
        await logAction(automation.id, accountDbId, commenterIgId, commentId, automation.media_id, 'public_reply'); // Use original media_id field
    } catch (error) {
        console.error("Error sending public reply:", error.response?.data ? JSON.stringify(error.response.data) : error.message);
    }
}

// Send DM remains the same API call
async function sendDirectMessage(recipientContext, messagePayload, accessToken, isUserId = false) {
    const postData = { recipient: {}, message: messagePayload.message };
    if (isUserId) { postData.recipient = { id: recipientContext }; }
    else { postData.recipient = { comment_id: recipientContext }; }

    const apiVersion = process.env.IG_API_VERSION || "v22.0";
    const url = `https://graph.facebook.com/${apiVersion}/me/messages`; // Instagram Graph API endpoint
    console.log(`Attempting send DM (isUserId: ${isUserId}):`, JSON.stringify(postData));
    try {
        const response = await axios.post(url, postData, { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } });
        console.log("DM sent successfully:", response.data);
        return true;
    } catch (error) {
        console.error("Error sending DM:", error.response?.data ? JSON.stringify(error.response.data) : error.message);
        return false;
    }
}

// Logging functions remain the same conceptually
async function logAction(automationId, accountDbId, recipientIgId, sourceIgId, mediaIgId, actionType) {
     if (!automationId || !accountDbId || !recipientIgId || !actionType) return;
     console.log(`Logging: ${actionType}, AutoID:${automationId}, AccID:${accountDbId}, User:${recipientIgId}, Src:${sourceIgId}`);
     try {
        const query = `INSERT INTO automation_logs (automation_id, account_id, recipient_ig_id, source_ig_id, media_ig_id, action_type) VALUES ($1, $2, $3, $4, $5, $6)`;
        await pool.query(query, [automationId, accountDbId, recipientIgId, sourceIgId || null, mediaIgId || null, actionType]);
     } catch (error) { console.error("Error logging action:", error); }
}
async function countRecentLogs(accountDbId, recipientIgId, sourceIgId, actionType) {
     if (!accountDbId || !recipientIgId || !sourceIgId || !actionType) return 999;
     try {
        const query = `SELECT COUNT(*) FROM automation_logs WHERE account_id = $1 AND recipient_ig_id = $2 AND source_ig_id = $3 AND action_type = $4`;
        const { rows } = await pool.query(query, [accountDbId, recipientIgId, sourceIgId, actionType]);
        return parseInt(rows[0].count, 10);
    } catch (error) { console.error("Error counting logs:", error); return 999; }
}
async function hasSentLog(accountDbId, recipientIgId, sourceIgId, actionType) {
     if (!accountDbId || !recipientIgId || !sourceIgId || !actionType) return true; // Assume sent if data missing
     try {
        const query = `SELECT 1 FROM automation_logs WHERE account_id = $1 AND recipient_ig_id = $2 AND source_ig_id = $3 AND action_type = $4 LIMIT 1`;
        const { rows } = await pool.query(query, [accountDbId, recipientIgId, sourceIgId, actionType]);
        return rows.length > 0;
    } catch (error) { console.error("Error checking logs:", error); return false; } // Assume not sent on error
}

// Message construction uses ORIGINAL schema fields
function constructFollowPrompt(automation, userIgId, sourceId, yourIgUsername) {
    // Use original schema fields 'ask_follow_text', 'ask_follow_button'
    const text = automation.ask_follow_text || "Please follow us to continue!";
    const followButtonText = automation.ask_follow_button || "I've Followed";
    const profileUrl = yourIgUsername ? `https://instagram.com/${yourIgUsername}` : 'https://instagram.com';
    const postbackPayload = `ACTION=RECHECK_FOLLOW&USER=${userIgId}&SOURCE=${sourceId}`;

    // Using Button Template structure (verify exact format with docs)
    return {
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: text,
                    buttons: [
                        { type: "web_url", url: profileUrl, title: "Follow Our Profile" },
                        { type: "postback", title: followButtonText, payload: postbackPayload }
                    ]
                }
            }
        }
    };
}

// Message construction uses ORIGINAL schema fields
function constructDmContent(automation) {
    // Use original schema fields 'generic_template', 'addition_buttons', 'dm_message'
    try {
        if (automation.generic_template) {
            const payload = typeof automation.generic_template === 'string' ? JSON.parse(automation.generic_template) : automation.generic_template;
            return { message: { attachment: { type: "template", payload: payload } } };
        } else if (automation.addition_buttons && automation.dm_message) {
            const quickReplies = typeof automation.addition_buttons === 'string' ? JSON.parse(automation.addition_buttons) : automation.addition_buttons;
            if (!Array.isArray(quickReplies)) throw new Error("addition_buttons not an array");
            const validQuickReplies = quickReplies.filter(qr => qr.content_type === 'text' && qr.title);
            if (validQuickReplies.length === 0) throw new Error("No valid quick replies");
            return { message: { text: automation.dm_message, quick_replies: validQuickReplies } };
        } else {
            return { message: { text: automation.dm_message || "Thanks!" } };
        }
    } catch (e) {
        console.error("Error constructing DM content:", e, "Falling back to default text.");
        return { message: { text: automation.dm_message || "Thanks!" } }; // Fallback on error
    }
}

// --- Export Handlers ---
module.exports = {
    getWebhookController,
    postwebhookHandler,
    verifyWebhookSignature
};
