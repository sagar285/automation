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
pool.connect().then(() => console.log('DB Connected')).catch(e => console.error("DB Connect Error:", e));
// --- End Database Configuration ---

// Assume verifyWebhookSignature and getWebhookController are defined elsewhere and exported correctly
// const { verifyWebhookSignature, getWebhookController } = require('./webhookController'); // Example import

const API_VERSION = process.env.IG_API_VERSION || "v22.0"; // Use environment variable

// --- POST Handler ---
const postwebhookHandler = async (req, res) => {
    console.log("Webhook POST received:", JSON.stringify(req.body, null, 2));

    // Basic validation
    if (typeof req.body !== 'object' || req.body === null || !Array.isArray(req.body.entry)) {
        console.warn("Webhook body missing 'entry' array or not an object.");
        return res.sendStatus(200); // Acknowledge, but invalid format
    }

    // Process entries one by one
    for (const entry of req.body.entry) {
        const recipientIgId = entry.id; // Your Account's IGSID
        if (!recipientIgId) {
            console.warn("Webhook entry missing recipient ID (entry.id). Skipping.");
            continue;
        }

        // 1. Find Account Info using user_insta_business_id
        let accountInfo;
        try {
            const accountQuery = `
                SELECT id as account_db_id, access_token
                FROM accounts
                WHERE user_insta_business_id = $1 AND is_active = TRUE LIMIT 1`;
            const { rows } = await pool.query(accountQuery, [recipientIgId]);

            if (rows.length === 0) {
                console.log(`No active account found for business ID ${recipientIgId}.`);
                continue; // Skip this entry
            }
            accountInfo = rows[0];

            if (!accountInfo.accessToken) {
                console.error(`CRITICAL: Access token missing for account ${accountInfo.accountDbId}.`);
                continue; // Skip this entry
            }

            // --- Send 200 OK Immediately ---
            if (!res.headersSent) {
                res.sendStatus(200);
                console.log(`Sent 200 OK for recipient ${recipientIgId}. Processing async...`);
            }
            // --- End Immediate Response ---

            // --- Asynchronous Processing ---
            setTimeout(async () => {
                try {
                    console.log(`ASYNC: Starting processing for account ${accountInfo.accountDbId}`);
                    // Process Comments
                    if (entry.changes && Array.isArray(entry.changes)) {
                        for (const change of entry.changes) {
                            if (change.field === 'comments' && change.value) {
                                await processCommentEventAsync(change.value, accountInfo);
                            }
                        }
                    }
                    // Process DMs
                    if (entry.messaging && Array.isArray(entry.messaging)) {
                        for (const messageEvent of entry.messaging) {
                            if (messageEvent.message && !messageEvent.message.is_echo) {
                                await processDirectMessageEventAsync(messageEvent, accountInfo);
                            }
                            else if (messageEvent.postback) {
                                await processPostbackEventAsync(messageEvent, accountInfo);
                            }
                        }
                    }
                    console.log(`ASYNC: Finished processing for account ${accountInfo.accountDbId}`);
                } catch (asyncError) {
                    console.error(`ASYNC Error for account ${accountInfo.accountDbId}:`, asyncError);
                }
            }, 0);
            // --- End Asynchronous Processing ---

        } catch (dbError) {
            console.error(`Database error looking up account for ${recipientIgId}:`, dbError);
            if (!res.headersSent) {
                res.sendStatus(200);
            }
        }
    } // End for entry loop

    if (!res.headersSent) {
        res.sendStatus(200);
    }
};

// ===========================================
// ASYNCHRONOUS Event Processors
// ===========================================

async function processCommentEventAsync(commentData, accountInfo) {
    const { accountDbId, accessToken, recipientIgId, recipientIgUsername } = accountInfo;
    const mediaId = commentData.media?.id;
    const commentId = commentData.id;
    const commentText = commentData.text?.toLowerCase() || '';
    const commenterIgId = commentData.from?.id;

    if (!mediaId || !commentId || !commentText || !commenterIgId) return;

    console.log(`ASYNC: Processing comment ${commentId} on media ${mediaId}`);

    // 1. Find Automation (Original Schema)
    const query = `
        SELECT * FROM automations
        WHERE account_id = $1 AND (media_id = $2 OR is_universal = TRUE) AND is_active = TRUE
        ORDER BY CASE WHEN media_id = $2 THEN 1 ELSE 2 END, created_at DESC LIMIT 1;`;
    let automation;
    try {
        const { rows } = await pool.query(query, [accountDbId, mediaId]);
        if (rows.length === 0) return;
        automation = rows[0];
        console.log(`ASYNC: Using automation ${automation.id} for comment ${commentId}.`);
    } catch (dbError) { console.error(`ASYNC: DB error finding automation for comment ${commentId}:`, dbError); return; }

    // 2. Check Keywords
    const keywordMatch = checkKeywords(commentText, automation.keywords);

    // 3. Handle Public Auto-Reply (if enabled)
    if (automation.auto_public_reply) {
        await handlePublicReply(automation, accountInfo, commentId, commenterIgId);
    }

    // 4. Proceed with DM ONLY if keywords matched
    if (!keywordMatch) return;
    console.log(`ASYNC: Keywords matched for comment ${commentId}. Proceeding.`);

    // 5. Check Follower Status (if required)
    let proceedWithDm = true;
    if (automation.ask_to_follow) {
        const isFollowing = await checkFollowerStatus(commenterIgId, recipientIgId, accessToken);
        if (!isFollowing) {
            proceedWithDm = false;
            const followPromptMessage = constructFollowPrompt(automation, commenterIgId, commentId, recipientIgUsername);
            if (!(await hasSentLog(accountDbId, commenterIgId, commentId, 'follow_check_dm'))) {
                const sent = await sendDirectMessage(commentId, followPromptMessage, accessToken);
                if (sent) await logAction(automation.id, accountDbId, commenterIgId, commentId, mediaId, 'follow_check_dm');
            }
        }
    }

    // 6. Send Main DM
    if (proceedWithDm) {
        const dmContent = constructDmContent(automation);
        if (!(await hasSentLog(accountDbId, commenterIgId, commentId, 'dm_sent'))) {
            const sent = await sendDirectMessage(commentId, dmContent, accessToken);
            if (sent) await logAction(automation.id, accountDbId, commenterIgId, commentId, mediaId, 'dm_sent');
        }
    }
}

async function processDirectMessageEventAsync(messageEvent, accountInfo) {
    const { accountDbId, accessToken, recipientIgId, recipientIgUsername } = accountInfo;
    const senderIgId = messageEvent.sender?.id;
    const messageText = messageEvent.message?.text?.toLowerCase() || '';
    const messageId = messageEvent.message?.mid;

    if (!senderIgId || !messageId || !messageText || senderIgId === recipientIgId) return;

    console.log(`ASYNC: Processing DM ${messageId} from ${senderIgId}`);

    // 1. Find Universal Automation (Original Schema)
    const query = `
        SELECT * FROM automations WHERE account_id = $1 AND is_universal = TRUE AND is_active = TRUE
        ORDER BY created_at DESC LIMIT 1;`;
    let automation;
    try {
        const { rows } = await pool.query(query, [accountDbId]);
        if (rows.length === 0) return;
        automation = rows[0];
        console.log(`ASYNC: Using universal automation ${automation.id} for DM ${messageId}.`);
    } catch (dbError) { console.error(`ASYNC: DB error finding automation for DM ${messageId}:`, dbError); return; }

    // 2. Check Keywords
    const keywordMatch = checkKeywords(messageText, automation.keywords);
    if (!keywordMatch) return;
    console.log(`ASYNC: Keywords matched for DM ${messageId}. Proceeding.`);

    // 3. Check Follower Status
    let proceedWithReply = true;
    if (automation.ask_to_follow) {
        const isFollowing = await checkFollowerStatus(senderIgId, recipientIgId, accessToken);
        if (!isFollowing) {
            proceedWithReply = false;
            const followPromptMessage = constructFollowPrompt(automation, senderIgId, messageId, recipientIgUsername);
            if (!(await hasSentLog(accountDbId, senderIgId, messageId, 'follow_check_dm'))) {
                const sent = await sendDirectMessage(senderIgId, followPromptMessage, accessToken, true);
                if (sent) await logAction(automation.id, accountDbId, senderIgId, messageId, null, 'follow_check_dm');
            }
        }
    }

    // 4. Send Main DM Reply
    if (proceedWithReply) {
        const dmContent = constructDmContent(automation);
        if (!(await hasSentLog(accountDbId, senderIgId, messageId, 'dm_sent'))) {
            const sent = await sendDirectMessage(senderIgId, dmContent, accessToken, true);
            if (sent) await logAction(automation.id, accountDbId, senderIgId, messageId, null, 'dm_sent');
        }
    }
}

async function processPostbackEventAsync(postbackEvent, accountInfo) {
     const { accountDbId, accessToken, recipientIgId } = accountInfo;
     const senderIgId = postbackEvent.sender?.id;
     const payload = postbackEvent.postback?.payload;

     console.log(`ASYNC: Processing postback from ${senderIgId} with payload: ${payload}`);
     if (!payload || !senderIgId) return;

     const params = new URLSearchParams(payload);
     const action = params.get('ACTION');
     const userIdToCheck = params.get('USER');
     const sourceId = params.get('SOURCE');

     if (userIdToCheck !== senderIgId) return;

     if (action === 'RECHECK_FOLLOW' && userIdToCheck && sourceId) {
         const isFollowing = await checkFollowerStatus(userIdToCheck, recipientIgId, accessToken);
         if (isFollowing) {
             console.log(`ASYNC: User ${userIdToCheck} confirmed following. Sending original DM.`);
             const originalAutomation = await findAutomationForSource(accountDbId, sourceId);
             if (originalAutomation) {
                 const dmContent = constructDmContent(originalAutomation);
                 if (!(await hasSentLog(accountDbId, userIdToCheck, sourceId, 'dm_sent'))) {
                     const sent = await sendDirectMessage(userIdToCheck, dmContent, accessToken, true);
                     if (sent) await logAction(originalAutomation.id, accountDbId, userIdToCheck, sourceId, null, 'dm_sent');
                 }
             } else {
                  await sendDirectMessage(userIdToCheck, { message: { text: "Thanks for following!" } }, accessToken, true);
             }
         } else {
             console.log(`ASYNC: User ${userIdToCheck} still not following after postback.`);
             await sendDirectMessage(userIdToCheck, { message: { text: "We couldn't verify the follow yet!" } }, accessToken, true);
         }
     } else {
         console.log(`ASYNC: Unhandled postback action: ${action}`);
     }
}

// Placeholder - needs implementation based on how you link source IDs
async function findAutomationForSource(accountDbId, sourceId) {
    console.warn(`ASYNC: findAutomationForSource using basic universal lookup.`);
     try {
        const query = `SELECT * FROM automations WHERE account_id = $1 AND is_universal = TRUE AND is_active = TRUE ORDER BY created_at DESC LIMIT 1`;
        const { rows } = await pool.query(query, [accountDbId]);
        return rows.length > 0 ? rows[0] : null;
     } catch(dbError) { console.error("DB error in findAutomationForSource:", dbError); return null; }
}


// ===========================================
// Utility Functions (Using graph.instagram.com where applicable)
// ===========================================

function checkKeywords(text, keywords, triggerType = 'contains_any') {
    // (Implementation remains the same)
    if (!keywords || keywords.length === 0) return true;
    const lowerText = text?.toLowerCase() || '';
    for (const keyword of keywords) {
        if (!keyword) continue;
        if (lowerText.includes(keyword.toLowerCase())) return true;
    }
    return false;
}

async function checkFollowerStatus(userIdToCheck, businessAccountIgId, accessToken) {
    // Using graph.instagram.com as requested, although graph.facebook.com is standard for Graph API. Test thoroughly.
    // Note: Friendship status might not be available via graph.instagram.com.
    // If this fails, you may need to revert this specific call to graph.facebook.com
    const url = `https://graph.instagram.com/${API_VERSION}/${userIdToCheck}`;
    console.log(`Checking follower status via ${url}: Does ${userIdToCheck} follow ${businessAccountIgId}?`);
    try {
        const response = await axios.get(url, { params: { fields: 'friendship_status', access_token: accessToken } });
        if (response.data?.friendship_status && typeof response.data.friendship_status.followed_by === 'boolean') {
            console.log(`API check result: User ${userIdToCheck} followed_by status: ${response.data.friendship_status.followed_by}`);
            return response.data.friendship_status.followed_by;
        }
        console.warn(`Could not determine follower status for ${userIdToCheck} from ${url}. Response:`, response.data);
        return false;
    } catch (error) {
        console.error(`Error checking follower status for ${userIdToCheck} using ${url}:`, error.response?.data ? JSON.stringify(error.response.data) : error.message);
        // If error indicates endpoint/field isn't available on graph.instagram.com, consider graph.facebook.com
        if (error.response?.data?.error?.message.includes("requires pages_read_engagement")) {
             console.warn("Friendship status check might require graph.facebook.com endpoint or different permissions.");
        }
        return false;
    }
}

async function handlePublicReply(automation, accountInfo, commentId, commenterIgId) {
    if (!automation.auto_public_reply) return; // Use original field name

    const { accountDbId, accessToken } = accountInfo;
    const replyCount = await countRecentLogs(accountDbId, commenterIgId, commentId, 'public_reply');
    const limit = automation.auto_reply_limit > 0 ? automation.auto_reply_limit : 1;

    if (replyCount >= limit) {
        console.log(`Public reply limit (${limit}) reached for comment ${commentId}.`);
        return;
    }

    let replyText = "Thanks!";
    if (automation.auto_reply_messages && automation.auto_reply_messages.length > 0) {
        const randomIndex = Math.floor(Math.random() * automation.auto_reply_messages.length);
        replyText = automation.auto_reply_messages[randomIndex];
    }

    // Using graph.instagram.com as requested
    const url = `https://graph.instagram.com/${API_VERSION}/${commentId}/replies`;
    console.log(`Sending public reply to ${commentId} via ${url}: "${replyText}"`);
    try {
        const response = await axios.post(url, { message: replyText }, { headers: { Authorization: `Bearer ${accessToken}` } });
        console.log("Public reply sent:", response.data?.id);
        await logAction(automation.id, accountDbId, commenterIgId, commentId, automation.media_id, 'public_reply');
    } catch (error) {
        console.error("Error sending public reply:", error.response?.data ? JSON.stringify(error.response.data) : error.message);
    }
}

async function sendDirectMessage(recipientContext, messagePayload, accessToken, isUserId = false) {
    const postData = { recipient: {}, message: messagePayload.message };
    if (isUserId) { postData.recipient = { id: recipientContext }; }
    else { postData.recipient = { comment_id: recipientContext }; }

    // Using graph.instagram.com as requested
    const url = `https://graph.instagram.com/${API_VERSION}/me/messages`;
    console.log(`Sending DM via ${url} (isUserId: ${isUserId}):`, JSON.stringify(postData));
    try {
        const response = await axios.post(url, postData, { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } });
        console.log("DM sent successfully:", response.data);
        return true;
    } catch (error) {
        console.error("Error sending DM:", error.response?.data ? JSON.stringify(error.response.data) : error.message);
        return false;
    }
}

// Logging functions remain the same
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
     if (!accountDbId || !recipientIgId || !sourceIgId || !actionType) return true;
     try {
        const query = `SELECT 1 FROM automation_logs WHERE account_id = $1 AND recipient_ig_id = $2 AND source_ig_id = $3 AND action_type = $4 LIMIT 1`;
        const { rows } = await pool.query(query, [accountDbId, recipientIgId, sourceIgId, actionType]);
        return rows.length > 0;
    } catch (error) { console.error("Error checking logs:", error); return false; }
}

// Message construction uses ORIGINAL schema fields
function constructFollowPrompt(automation, userIgId, sourceId) {
    const text = automation.ask_follow_text || "Please follow us to continue!";
    const followButtonText = automation.ask_follow_button || "I've Followed";
    const profileUrl =  'https://instagram.com';
    const postbackPayload = `ACTION=RECHECK_FOLLOW&USER=${userIgId}&SOURCE=${sourceId}`;

    // Button Template structure
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
    try {
        if (automation.generic_template) {
            const payload = typeof automation.generic_template === 'string' ? JSON.parse(automation.generic_template) : automation.generic_template;
            return { message: { attachment: { type: "template", payload: payload } } };
        } else if (automation.addition_buttons && automation.dm_message) {
            const quickReplies = typeof automation.addition_buttons === 'string' ? JSON.parse(automation.addition_buttons) : automation.addition_buttons;
            if (!Array.isArray(quickReplies)) throw new Error("addition_buttons not array");
            const validQuickReplies = quickReplies.filter(qr => qr.content_type === 'text' && qr.title);
            if (validQuickReplies.length === 0) throw new Error("No valid quick replies");
            return { message: { text: automation.dm_message, quick_replies: validQuickReplies } };
        } else {
            return { message: { text: automation.dm_message || "Thanks!" } };
        }
    } catch (e) {
        console.error("Error constructing DM content:", e);
        return { message: { text: automation.dm_message || "Thanks!" } };
    }
}

// --- Export Handlers ---
// Ensure these are exported if this code is in a separate controller file
// module.exports = { postwebhookHandler }; // Add getWebhookController, verifyWebhookSignature if needed

