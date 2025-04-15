

const crypto = require('crypto');
const axios = require('axios');
const { pool } = require("../dbmanager"); // Your exported DB pool

// --- Middleware for Webhook Verification (Keep this!) ---
const verifyWebhookSignature = (req, res, next) => {
    // (Same implementation as the previous example - requires req.rawBody and INSTAGRAM_APP_SECRET)
    // ... signature check logic ...
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return res.sendStatus(400);
    if (!req.rawBody) return res.sendStatus(500);

    const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', process.env.INSTAGRAM_APP_SECRET)
        .update(req.rawBody, 'utf-8')
        .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        console.warn('Invalid webhook signature.');
        return res.sendStatus(403);
    }
     try {
        if (req.headers['content-type'] === 'application/json' && typeof req.body !== 'object') {
             req.body = JSON.parse(req.rawBody.toString('utf-8'));
        }
     } catch (e) { return res.sendStatus(400); }
    next();
};

// --- GET Handler for Subscription (Keep this!) ---
const getWebhookController = async (req, res) => {
    // (Same implementation as previous example)
    // ... uses INSTAGRAM_VERIFY_TOKEN ...
        console.log("Received GET /webhook verification request:", req.query);
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN;

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("Webhook verification successful!");
        res.status(200).send(challenge);
    } else {
        console.error("Webhook verification failed. Mode or Token mismatch.");
        res.sendStatus(403);
    }
};

// --- Helper to get the SINGLE assumed active account ---
// WARNING: This assumes only ONE account is ever active in the system.
async function getTheOnlyActiveAccount() {
    try {
        // Fetch the first active account found. Brittle if multiple accounts exist.
        const query = `SELECT id, access_token, instagram_id FROM accounts WHERE is_active = TRUE ORDER BY created_at LIMIT 1`;
        const { rows } = await pool.query(query);
        if (rows.length > 0) {
            console.log(`Using assumed single active account: DB ID ${rows[0].id}, IG ID ${rows[0].instagram_id}`);
            return {
                accountDbId: rows[0].id,
                accessToken: rows[0].access_token,
                recipientIgId: rows[0].instagram_id // Store the IGSID of this single account
            };
        } else {
            console.error("CRITICAL: Could not find any active account in the database (Single-Account Assumption).");
            return null;
        }
    } catch (dbError) {
        console.error("Database error fetching the single active account:", dbError);
        return null;
    }
}


// --- POST Handler for Incoming Webhook Events ---
const postwebhookHandler = async (req, res) => {
    console.log("Webhook POST received (Single-Account Assumption):", JSON.stringify(req.body, null, 2));
    try {
        // --- SINGLE ACCOUNT ASSUMPTION ---
        // Fetch the one and only active account expected in the system.
        const accountInfo = await getTheOnlyActiveAccount();
        if (!accountInfo) {
            console.error("Cannot process webhook: Failed to retrieve the single active account.");
            return res.sendStatus(200); // Still send 200 OK to webhook sender
        }
        // --- END SINGLE ACCOUNT ASSUMPTION ---

        for (const entry of req.body.entry) {
            // We IGNORE entry.id based on your request, relying solely on accountInfo fetched above.
            // This is technically incorrect if the webhook event was for a different account than the one fetched.

            // Process Comments if 'changes' field exists
            if (entry.changes) {
                for (const change of entry.changes) {
                    if (change.field === 'comments') {
                        // Pass the globally fetched single account info
                        await processCommentEvent(change.value, accountInfo);
                    }
                    // Add handlers for other 'changes'
                }
            }

            // Process Direct Messages if 'messaging' field exists
            if (entry.messaging) {
                for (const messageEvent of entry.messaging) {
                     if (messageEvent.message && !messageEvent.message.is_echo) {
                        // Pass the globally fetched single account info
                        await processDirectMessageEvent(messageEvent, accountInfo);
                    }
                     // Add handlers for postbacks, etc.
                }
            }
        } // End for entry loop
        res.sendStatus(200); // Acknowledge receipt

    } catch (error) {
        console.error("Error processing webhook (Single-Account Assumption):", error);
        res.sendStatus(200); // Still send 200 OK
    }
};

// ===========================================
// Event Processors (Modified for Single-Account Assumption)
// ===========================================

// Now accepts accountInfo containing { accountDbId, accessToken, recipientIgId }
async function processCommentEvent(commentData, accountInfo) {
    const { accountDbId, accessToken, recipientIgId } = accountInfo; // Use the globally fetched account info

    console.log(`Processing comment event for assumed account DB ID: ${accountDbId}`);
    const mediaId = commentData.media?.id;
    const commentId = commentData.id;
    const commentText = commentData.text?.toLowerCase() || '';
    const commenterIgId = commentData.from?.id;

    if (!mediaId || !commentId || !commentText || !commenterIgId) {
        console.log("Incomplete comment data, skipping.");
        return;
    }

    // 1. Find Automation for the assumed single account
    // Query filters only by the single account's DB ID now.
    const query = `
        SELECT a.*
        FROM automations a
        WHERE a.account_id = $1 -- Filter by the assumed single account's DB ID
          AND (a.media_id = $2 OR a.is_universal = TRUE)
          AND a.is_active = TRUE
        ORDER BY
            CASE WHEN a.media_id = $2 THEN 1 ELSE 2 END,
            a.created_at DESC
        LIMIT 1;
    `;
    let automation;
    try {
        const { rows } = await pool.query(query, [accountDbId, mediaId]);
        if (rows.length === 0) {
            console.log(`No active automation found for account ${accountDbId} matching media ${mediaId} or universal.`);
            return;
        }
        automation = rows[0];
        console.log(`Using automation ${automation.id} (Media Specific: ${!automation.is_universal}) for comment ${commentId}`);

    } catch (dbError) {
        console.error(`Database error finding automation for comment:`, dbError);
        return;
    }

    // 2. Check Keywords
    const keywordMatch = checkKeywords(commentText, automation.keywords, automation.keyword_trigger_type);

    // 3. Handle Public Auto-Reply
    if (automation.auto_public_reply) {
        // Pass explicit accountInfo object
        await handlePublicReply(automation, accountInfo, commentId, commenterIgId);
    }

    // 4. Proceed with DM/Follow Check if keywords match
    if (!keywordMatch) return;

    // 5. Check Follower Status
    let proceedWithDm = true;
    if (automation.ask_to_follow) {
        // Use recipientIgId from the fetched accountInfo
        const isFollowing = await checkFollowerStatus(commenterIgId, recipientIgId, accessToken);
        if (!isFollowing) {
            proceedWithDm = false;
            // ... (rest of follow prompt logic, sending DM, logging) ...
            const followPromptMessage = constructFollowPrompt(automation);
            if (!(await hasSentLog(accountDbId, commenterIgId, commentId, 'follow_check_dm'))) {
                 await sendDirectMessage(commentId, followPromptMessage, accessToken); // Use fetched token
                 await logAction(automation.id, accountDbId, commenterIgId, commentId, mediaId, 'follow_check_dm');
            }
        }
    }

    // 6. Send Main DM
    if (proceedWithDm) {
        // ... (rest of main DM logic, sending DM, logging) ...
         const dmContent = constructDmContent(automation);
         if (!(await hasSentLog(accountDbId, commenterIgId, commentId, 'dm_sent'))) {
            await sendDirectMessage(commentId, dmContent, accessToken); // Use fetched token
            await logAction(automation.id, accountDbId, commenterIgId, commentId, mediaId, 'dm_sent');
        }
    }
}

// Now accepts accountInfo containing { accountDbId, accessToken, recipientIgId }
async function processDirectMessageEvent(messageEvent, accountInfo) {
    const { accountDbId, accessToken, recipientIgId } = accountInfo; // Use globally fetched account info

    console.log(`Processing DM event for assumed account DB ID: ${accountDbId}`);
    const senderIgId = messageEvent.sender.id;
    const messageText = messageEvent.message?.text?.toLowerCase() || '';
    const messageId = messageEvent.message?.mid;

    if (!messageText || senderIgId === recipientIgId) return; // Ignore echoes or empty

    // 1. Find Universal Automation for the assumed single account
    const query = `
        SELECT a.*
        FROM automations a
        WHERE a.account_id = $1 -- Filter by the assumed single account's DB ID
          AND a.is_universal = TRUE
          AND a.is_active = TRUE
        ORDER BY a.created_at DESC
        LIMIT 1;
    `;
    let automation;
    try {
        const { rows } = await pool.query(query, [accountDbId]);
        if (rows.length === 0) {
            console.log(`No active universal automation found for DM handling for account ${accountDbId}.`);
            return;
        }
        automation = rows[0];
        console.log(`Using universal automation ${automation.id} for DM ${messageId}`);
    } catch (dbError) {
        console.error(`Database error finding automation for DM:`, dbError);
        return;
    }

    // 2. Check Keywords
    const keywordMatch = checkKeywords(messageText, automation.keywords, automation.keyword_trigger_type);
    if (!keywordMatch) return;

    // 3. Check Follower Status
    let proceedWithReply = true;
    if (automation.ask_to_follow) {
        // Use recipientIgId from the fetched accountInfo
        const isFollowing = await checkFollowerStatus(senderIgId, recipientIgId, accessToken);
        if (!isFollowing) {
            proceedWithReply = false;
            // ... (rest of follow prompt logic, sending DM, logging) ...
            const followPromptMessage = constructFollowPrompt(automation);
            if (!(await hasSentLog(accountDbId, senderIgId, messageId, 'follow_check_dm'))) {
                await sendDirectMessage(senderIgId, followPromptMessage, accessToken, true); // Use fetched token
                await logAction(automation.id, accountDbId, senderIgId, messageId, null, 'follow_check_dm');
            }
        }
    }

    // 4. Send Main DM Reply
    if (proceedWithReply) {
        // ... (rest of main DM reply logic, sending DM, logging) ...
        const dmContent = constructDmContent(automation);
        if (!(await hasSentLog(accountDbId, senderIgId, messageId, 'dm_sent'))) {
            await sendDirectMessage(senderIgId, dmContent, accessToken, true); // Use fetched token
            await logAction(automation.id, accountDbId, senderIgId, messageId, null, 'dm_sent');
        }
    }
}

// ===========================================
// Utility Functions (Implementations required based on previous examples)
// ===========================================
function checkKeywords(text, keywords, triggerType) { /* ... */ if (!keywords || keywords.length === 0) return true; const lt = text.toLowerCase(); for (const k of keywords) { if (lt.includes(k.toLowerCase())) return true;} return false; }
async function checkFollowerStatus(userId, targetId, accessToken) { /* ... placeholder ... */ console.warn("Follower check not implemented!"); return true; }
async function handlePublicReply(automation, accountInfo, commentId, commenterIgId) { /* ... use accountInfo.accessToken, accountInfo.accountDbId ... */ console.log("Public reply logic placeholder."); }
async function sendDirectMessage(recipientContext, messagePayload, accessToken, isUserId = false) { /* ... (use access token provided) ... */ console.log("Send DM logic placeholder.");}
async function logAction(automationId, accountDbId, recipientIgId, sourceIgId, mediaIgId, actionType) { /* ... */ console.log(`Logging action: ${actionType}`);}
async function countRecentLogs(accountDbId, recipientIgId, sourceIgId, actionType) { /* ... */ return 0; } // Placeholder needs DB call
async function hasSentLog(accountDbId, recipientIgId, sourceIgId, actionType) { /* ... */ return false; } // Placeholder needs DB call
function constructFollowPrompt(automation) { /* ... placeholder ... */ return { message: { text: "Please follow (Placeholder)" } }; }
function constructDmContent(automation) { /* ... placeholder ... */ return { message: { text: "Thanks (Placeholder)" } }; }

// --- Export Handlers ---
module.exports = {
    getWebhookController,
    postwebhookHandler,
    verifyWebhookSignature
};
