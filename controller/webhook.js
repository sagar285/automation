const crypto = require('crypto');
const axios = require('axios');
const {pool} =require("../dbmanager") // Import Pool from pg
const dotenv = require('dotenv');


// --- Middleware for Webhook Verification ---
const verifyWebhookSignature = (req, res, next) => {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) { console.warn('Sig missing'); return res.sendStatus(400); }
    // Ensure rawBody is available (requires express.raw() or similar in router setup)
    if (!req.rawBody) { console.error('Raw body missing for signature verification.'); return res.sendStatus(500); }

    try {
        const expectedSignature = 'sha256=' + crypto
            .createHmac('sha256', process.env.INSTAGRAM_APP_SECRET)
            .update(req.rawBody, 'utf-8')
            .digest('hex');

        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
            console.warn('Invalid webhook signature.');
            return res.sendStatus(403); // Forbidden - signature mismatch
        }

        // If signature is valid, attempt to parse JSON if needed
        if (req.headers['content-type'] === 'application/json' && typeof req.body !== 'object') {
             req.body = JSON.parse(req.rawBody.toString('utf-8'));
        }
        next(); // Signature verified, proceed

    } catch (error) {
        console.error('Error during signature verification or JSON parsing:', error);
        // Send 200 OK even on internal error to prevent webhook disabling, but log it.
        res.sendStatus(200);
    }
};

// --- GET Handler for Subscription ---
const getWebhookController = async (req, res) => {
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

// --- POST Handler for Incoming Webhook Events ---
const postwebhookHandler = async (req, res) => {
    console.log("Webhook POST received:", JSON.stringify(req.body, null, 2));
    try {
        // Ensure body is parsed (might happen in middleware or here)
        if (typeof req.body !== 'object' || req.body === null) {
             console.warn("Webhook POST body is not a parsed object.");
             // Attempt parsing if rawBody exists and content-type is JSON
             if (req.rawBody && req.headers['content-type'] === 'application/json') {
                 try {
                     req.body = JSON.parse(req.rawBody.toString('utf-8'));
                 } catch (parseError) {
                     console.error("Failed to parse webhook body:", parseError);
                     return res.sendStatus(200); // Acknowledge, but can't process
                 }
             } else {
                 return res.sendStatus(200); // Acknowledge, but can't process
             }
        }


        if (!req.body.entry || !Array.isArray(req.body.entry)) {
             console.warn("Webhook body missing 'entry' array.");
             return res.sendStatus(200); // Acknowledge, but invalid format
        }

        for (const entry of req.body.entry) {
            const recipientIgId = entry.id; // IGSID of *your* page/account that received event

            if (!recipientIgId) {
                console.warn("Webhook entry missing recipient ID (entry.id). Skipping entry.");
                continue;
            }

            // Process Comments if 'changes' field exists
            if (entry.changes && Array.isArray(entry.changes)) {
                for (const change of entry.changes) {
                    if (change.field === 'comments' && change.value) {
                        await processCommentEvent(change.value, recipientIgId);
                    }
                    // Add handlers for other 'changes' like mentions if needed
                }
            }

            // Process Direct Messages if 'messaging' field exists
            if (entry.messaging && Array.isArray(entry.messaging)) {
                for (const messageEvent of entry.messaging) {
                     if (messageEvent.message && !messageEvent.message.is_echo) {
                        await processDirectMessageEvent(messageEvent, recipientIgId);
                    }
                     // Add handlers for postbacks, quick_reply taps, etc.
                     else if (messageEvent.postback) {
                         await processPostbackEvent(messageEvent, recipientIgId);
                     }
                }
            }
        } // End for entry loop
        res.sendStatus(200); // Acknowledge receipt

    } catch (error) {
        console.error("Error processing webhook:", error);
        res.sendStatus(200); // Still send 200 OK to prevent webhook disabling
    }
};

// ===========================================
// Event Processors
// ===========================================

async function processCommentEvent(commentData, recipientIgId) {
    console.log(`Processing comment event for recipient IGSID: ${recipientIgId}`);
    const mediaId = commentData.media?.id;
    const commentId = commentData.id;
    const commentText = commentData.text?.toLowerCase() || '';
    const commenterIgId = commentData.from?.id;

    if (!mediaId || !commentId || !commentText || !commenterIgId) {
        console.log("Incomplete comment data, skipping comment processing.");
        return;
    }

    // 1. Find Automation & Account Info (using recipientIgId with the user_insta_business_id column)
    const query = `
        SELECT a.*, acc.access_token, acc.id as account_db_id, acc.username as recipient_ig_username
        FROM automations a
        INNER JOIN accounts acc ON a.account_id = acc.id
        WHERE acc.user_insta_business_id = $1 -- <<< Use the NEW column for lookup
          AND (a.media_id = $2 OR a.is_universal = TRUE)
          AND a.is_active = TRUE
        ORDER BY
            CASE WHEN a.media_id = $2 THEN 1 ELSE 2 END, -- Prioritize specific media match
            a.created_at DESC
        LIMIT 1;
    `;
    let automation, accessToken, accountDbId, recipientIgUsername;
    try {
        const { rows } = await pool.query(query, [recipientIgId, mediaId]);
        if (rows.length === 0) {
            console.log(`No active automation found for account with business ID ${recipientIgId} matching media ${mediaId} or universal.`);
            return;
        }
        automation = rows[0];
        accessToken = automation.access_token;
        accountDbId = automation.account_db_id;
        recipientIgUsername = automation.recipient_ig_username; // Get username for button link

        // Validate token exists
        if (!accessToken) {
             console.error(`CRITICAL: Access token missing for account DB ID ${accountDbId} (IG ID ${recipientIgId}). Cannot proceed.`);
             return;
        }
         if (!recipientIgUsername) {
             console.warn(`Warning: Username missing for account DB ID ${accountDbId}. Follow button link might be broken.`);
         }

        console.log(`Using automation ${automation.id} (Media Specific: ${!automation.is_universal}) for comment ${commentId}`);

    } catch (dbError) {
        console.error(`Database error finding automation for comment:`, dbError);
        return;
    }

    // --- Store account info for helper functions ---
    const accountInfo = { accountDbId, accessToken, recipientIgId, recipientIgUsername };

    // 2. Check Keywords
    const keywordMatch = checkKeywords(commentText, automation.keywords, automation.keyword_trigger_type);

    // 3. Handle Public Auto-Reply (if enabled)
    // Run this regardless of keyword match for DM, based on automation setting
    if (automation.auto_public_reply) {
        await handlePublicReply(automation, accountInfo, commentId, commenterIgId);
    }

    // 4. Proceed with DM/Follow Check ONLY if keywords match (or if automation has no keywords)
    if (!keywordMatch) {
        console.log(`Comment text "${commentText}" does not match keywords for automation ${automation.id}. No DM action needed.`);
        return;
    }
    console.log("Keyword match successful or not required. Proceeding with potential DM.");


    // 5. Check Follower Status (if required)
    let proceedWithDm = true;
    if (automation.ask_to_follow) {
        const isFollowing = await checkFollowerStatus(commenterIgId, recipientIgId, accessToken);
        if (!isFollowing) {
            proceedWithDm = false;
            console.log(`User ${commenterIgId} is not following ${recipientIgId}. Sending follow prompt.`);
            const followPromptMessage = constructFollowPrompt(automation, commenterIgId, commentId, recipientIgUsername);
            if (!(await hasSentLog(accountDbId, commenterIgId, commentId, 'follow_check_dm'))) {
                const sent = await sendDirectMessage(commentId, followPromptMessage, accessToken);
                if (sent) {
                    await logAction(automation.id, accountDbId, commenterIgId, commentId, mediaId, 'follow_check_dm');
                }
            } else {
                console.log(`Follow prompt already sent for comment ${commentId} to user ${commenterIgId}.`);
            }
        } else {
            console.log(`User ${commenterIgId} is following ${recipientIgId}. OK to send main DM.`);
        }
    }

    // 6. Send Main DM (Private Reply) if checks passed
    if (proceedWithDm) {
        const dmContent = constructDmContent(automation);
        if (!(await hasSentLog(accountDbId, commenterIgId, commentId, 'dm_sent'))) {
            const sent = await sendDirectMessage(commentId, dmContent, accessToken);
             if (sent) {
                await logAction(automation.id, accountDbId, commenterIgId, commentId, mediaId, 'dm_sent');
             }
        } else {
            console.log(`Main DM already sent for comment ${commentId} to user ${commenterIgId}.`);
        }
    }
}

async function processDirectMessageEvent(messageEvent, recipientIgId) {
    console.log(`Processing DM event for recipient IGSID: ${recipientIgId}`);
    const senderIgId = messageEvent.sender?.id;
    const messageText = messageEvent.message?.text?.toLowerCase() || '';
    const messageId = messageEvent.message?.mid;

    if (!senderIgId || !messageId) {
         console.log("Incomplete DM data (sender or message ID missing), skipping.");
         return;
    }
    // Ignore messages sent *by* the page itself (echoes) or empty messages
    if (!messageText || senderIgId === recipientIgId) {
        console.log("Ignoring empty message or echo.");
        return;
    }

    // 1. Find Universal Automation & Account Info for DMs (using NEW column)
    const query = `
        SELECT a.*, acc.access_token, acc.id as account_db_id, acc.username as recipient_ig_username
        FROM automations a
        INNER JOIN accounts acc ON a.account_id = acc.id
        WHERE acc.user_insta_business_id = $1 -- <<< Use the NEW column for lookup
          AND a.is_universal = TRUE
          AND a.is_active = TRUE
        ORDER BY a.created_at DESC -- Or other priority logic if needed
        LIMIT 1;
    `;
    let automation, accessToken, accountDbId, recipientIgUsername;
    try {
        const { rows } = await pool.query(query, [recipientIgId]);
        if (rows.length === 0) {
            console.log(`No active universal automation found for DM handling for account with business ID ${recipientIgId}.`);
            return;
        }
        automation = rows[0];
        accessToken = automation.access_token;
        accountDbId = automation.account_db_id;
        recipientIgUsername = automation.recipient_ig_username;

        if (!accessToken) {
             console.error(`CRITICAL: Access token missing for account DB ID ${accountDbId} (IG ID ${recipientIgId}). Cannot process DM.`);
             return;
        }
         if (!recipientIgUsername) {
             console.warn(`Warning: Username missing for account DB ID ${accountDbId}. Follow button link might be broken.`);
         }

        console.log(`Using universal automation ${automation.id} for DM ${messageId}`);
    } catch (dbError) {
        console.error(`Database error finding automation for DM:`, dbError);
        return;
    }

    // --- Store account info ---
    const accountInfo = { accountDbId, accessToken, recipientIgId, recipientIgUsername };

    // 2. Check Keywords
    const keywordMatch = checkKeywords(messageText, automation.keywords, automation.keyword_trigger_type);
    if (!keywordMatch) {
        console.log(`DM text "${messageText}" does not match keywords for automation ${automation.id}. No action taken.`);
        return; // Or implement default reply logic
    }
    console.log("Keyword match successful or not required for DM. Proceeding.");

    // 3. Check Follower Status
    let proceedWithReply = true;
    if (automation.ask_to_follow) {
        const isFollowing = await checkFollowerStatus(senderIgId, recipientIgId, accessToken);
        if (!isFollowing) {
            proceedWithReply = false;
            console.log(`User ${senderIgId} is not following ${recipientIgId}. Sending follow prompt via DM.`);
            const followPromptMessage = constructFollowPrompt(automation, senderIgId, messageId, recipientIgUsername);
             if (!(await hasSentLog(accountDbId, senderIgId, messageId, 'follow_check_dm'))) {
                const sent = await sendDirectMessage(senderIgId, followPromptMessage, accessToken, true); // Send DM directly to sender ID
                 if(sent) {
                    await logAction(automation.id, accountDbId, senderIgId, messageId, null, 'follow_check_dm');
                 }
            } else {
                 console.log(`Follow prompt already sent for message ${messageId} to user ${senderIgId}.`);
            }
        } else {
             console.log(`User ${senderIgId} is following ${recipientIgId}. OK to send main DM reply.`);
        }
    }

    // 4. Send Main DM Reply
    if (proceedWithReply) {
        const dmContent = constructDmContent(automation);
         if (!(await hasSentLog(accountDbId, senderIgId, messageId, 'dm_sent'))) {
            const sent = await sendDirectMessage(senderIgId, dmContent, accessToken, true); // Send DM directly to sender ID
             if (sent) {
                await logAction(automation.id, accountDbId, senderIgId, messageId, null, 'dm_sent');
             }
        } else {
             console.log(`Main DM reply already sent for message ${messageId} to user ${senderIgId}.`);
        }
    }
}

async function processPostbackEvent(postbackEvent, recipientIgId) {
    const senderIgId = postbackEvent.sender?.id; // User who clicked button
    const payload = postbackEvent.postback?.payload;
    const messageId = postbackEvent.message?.mid; // ID of the message the button was attached to? May not always be present.

    console.log(`Processing postback event from ${senderIgId} with payload: ${payload}`);

    if (!payload || !senderIgId) {
        console.log("Incomplete postback data (payload or sender missing).");
        return;
    }

    // Parse the payload
    const params = new URLSearchParams(payload);
    const action = params.get('ACTION');
    const userIdToCheck = params.get('USER'); // This should match senderIgId
    const sourceId = params.get('SOURCE'); // Original comment/message ID

    // Verify sender matches user in payload for security
    if (userIdToCheck !== senderIgId) {
        console.warn(`Postback payload user ${userIdToCheck} does not match sender ${senderIgId}. Ignoring.`);
        return;
    }

    if (action === 'RECHECK_FOLLOW' && userIdToCheck && sourceId) {
        console.log(`Action: Recheck follow status for user ${userIdToCheck} related to source ${sourceId}`);

        // Find account info using recipientIgId (who received the postback)
         const accountQuery = `
            SELECT id as account_db_id, access_token, username as recipient_ig_username
            FROM accounts
            WHERE user_insta_business_id = $1 AND is_active = TRUE LIMIT 1`;
         let accountInfo;
         try {
             const { rows } = await pool.query(accountQuery, [recipientIgId]);
             if(rows.length === 0) {
                 console.error(`Could not find active account for postback recipient ${recipientIgId}`);
                 return;
             }
             accountInfo = rows[0];
              if (!accountInfo.accessToken) {
                 console.error(`CRITICAL: Access token missing for account DB ID ${accountInfo.accountDbId} (IG ID ${recipientIgId}) during postback.`);
                 return;
             }
         } catch (dbError) {
             console.error("DB error fetching account for postback:", dbError);
             return;
         }

        // Re-check follower status
        const isFollowing = await checkFollowerStatus(userIdToCheck, recipientIgId, accountInfo.accessToken);

        if (isFollowing) {
            console.log(`User ${userIdToCheck} is now following (re-checked). Attempting to send original DM.`);

            // Find the original/relevant automation rule. This is complex.
            // We need context (was sourceId a comment or DM?) to find the right rule.
            // Simplification: Find *any* active universal rule for the account.
            const originalAutomation = await findAutomationForSource(accountInfo.accountDbId, sourceId); // Requires better logic

            if (originalAutomation) {
                 const dmContent = constructDmContent(originalAutomation);
                 // Check if main DM was already sent for the *original source*
                 if (!(await hasSentLog(accountInfo.accountDbId, userIdToCheck, sourceId, 'dm_sent'))) {
                     const sent = await sendDirectMessage(userIdToCheck, dmContent, accountInfo.accessToken, true); // Send to user ID
                      if (sent) {
                         await logAction(originalAutomation.id, accountInfo.accountDbId, userIdToCheck, sourceId, null, 'dm_sent'); // Log against original source
                      }
                 } else {
                      console.log(`Main DM for source ${sourceId} appears to have been sent already.`);
                      // Optionally send a simple "Thanks again!" or take no action.
                 }
            } else {
                 console.log(`Could not find original automation rule for source ${sourceId} after postback.`);
                 // Send a generic "Thanks for following!" message as a fallback
                 const thanksMsg = { message: { text: "Thanks for following!" }};
                 await sendDirectMessage(userIdToCheck, thanksMsg, accountInfo.accessToken, true);
            }

        } else {
            console.log(`User ${userIdToCheck} is still not following after clicking the 'Followed' button.`);
            // Optional: Send a message like "We couldn't verify you followed yet. Please try again later or ensure you followed correctly."
             const notFollowingMsg = { message: { text: "We couldn't verify the follow yet. Please make sure you've followed our profile!" }};
             await sendDirectMessage(userIdToCheck, notFollowingMsg, accountInfo.accessToken, true);
        }
    } else {
        console.log("Received postback with unhandled action or missing data:", payload);
    }
}

// Placeholder - needs better implementation based on source type/ID
async function findAutomationForSource(accountDbId, sourceId) {
    console.warn(`findAutomationForSource using basic universal lookup. Needs improvement.`);
    // Ideally, check if sourceId corresponds to a mediaId to find specific rules,
    // otherwise default to universal. Requires more context passed in payload or DB lookup.
     try {
        const query = `SELECT * FROM automations WHERE account_id = $1 AND is_universal = TRUE AND is_active = TRUE ORDER BY created_at DESC LIMIT 1`;
        const { rows } = await pool.query(query, [accountDbId]);
        return rows.length > 0 ? rows[0] : null;
     } catch(dbError) {
         console.error("DB error in findAutomationForSource:", dbError);
         return null;
     }
}


// ===========================================
// Utility Functions (Implementations)
// ===========================================

/**
 * Checks if comment text contains any specified keywords (case-insensitive).
 */
function checkKeywords(text, keywords, triggerType = 'contains_any') {
    // If no keywords are defined for the automation, it's considered a match
    if (!keywords || keywords.length === 0) {
        return true;
    }
    const lowerText = text.toLowerCase();
    for (const keyword of keywords) {
        if (!keyword) continue; // Skip empty keywords
        const lowerKeyword = keyword.toLowerCase();
        // Simple 'contains' check for now. Expand if triggerType logic is needed.
        if (lowerText.includes(lowerKeyword)) {
            return true;
        }
    }
    return false; // No keywords matched
}

/**
 * Checks if a specific Instagram user follows the authenticated business account.
 * Requires instagram_basic, pages_show_list, pages_read_engagement permissions.
 */
async function checkFollowerStatus(userIdToCheck, businessAccountIgId, accessToken) {
    const apiVersion = process.env.IG_API_VERSION || "v22.0"; // Use env var for version
    const url = `https://graph.facebook.com/${apiVersion}/${userIdToCheck}`;
    console.log(`Checking follower status via API: Does ${userIdToCheck} follow account associated with token?`);

    try {
        const response = await axios.get(url, {
            params: {
                fields: 'friendship_status',
                access_token: accessToken
            }
        });
        // console.log("Full friendship status response:", JSON.stringify(response.data, null, 2)); // Verbose logging

        if (response.data?.friendship_status && typeof response.data.friendship_status.followed_by === 'boolean') {
            const isFollowing = response.data.friendship_status.followed_by;
            console.log(`API check result: User ${userIdToCheck} followed_by status: ${isFollowing}`);
            return isFollowing;
        } else {
            console.warn(`Could not determine follower status from API response for user ${userIdToCheck}. Response lacked expected fields.`);
            return false; // Default to false if data is missing/unexpected
        }
    } catch (error) {
        console.error(`Error checking follower status for user ${userIdToCheck}:`,
            error.response?.data ? JSON.stringify(error.response.data) : error.message
        );
        // Specific error handling could be added here (e.g., for permission errors)
        return false; // Default to false on API error
    }
}

/**
 * Sends a public reply to a specific comment.
 */
async function handlePublicReply(automation, accountInfo, commentId, commenterIgId) {
     if (!automation.auto_public_reply) {
         console.log("Public reply disabled for this automation.");
         return; // Ensure check happens
     }

    const { accountDbId, accessToken } = accountInfo;

    // 1. Check Reply Limit (using automation_logs table)
    const replyCount = await countRecentLogs(accountDbId, commenterIgId, commentId, 'public_reply');
    // Use configured limit, default to 1 if not set or invalid
    const limit = automation.auto_reply_limit > 0 ? automation.auto_reply_limit : 1;

    if (replyCount >= limit) {
        console.log(`Public reply limit (${limit}) reached for user ${commenterIgId} on comment ${commentId}. No reply sent.`);
        return;
    }

    // 2. Select Reply Message
    let replyText = "Thanks for your comment!"; // Default fallback
    if (automation.auto_reply_messages && automation.auto_reply_messages.length > 0) {
        // Simple random selection for now. Add 'AI' or 'sequential' logic if needed based on auto_reply_mode.
        const randomIndex = Math.floor(Math.random() * automation.auto_reply_messages.length);
        replyText = automation.auto_reply_messages[randomIndex];
    } else {
         console.log("No auto-reply messages configured, using default.");
    }

    // 3. Send Reply via API
    const apiVersion = process.env.IG_API_VERSION || "v22.0";
    const url = `https://graph.facebook.com/${apiVersion}/${commentId}/replies`;
    console.log(`Attempting to send public reply to comment ${commentId}: "${replyText}"`);
    try {
        const response = await axios.post(url,
            { message: replyText },
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        console.log("Public reply sent successfully. Response ID:", response.data?.id);
        // 4. Log the action
        await logAction(automation.id, accountDbId, commenterIgId, commentId, automation.media_id, 'public_reply');

    } catch (error) {
        console.error("Error sending public reply:",
             error.response?.data ? JSON.stringify(error.response.data) : error.message);
        // Handle specific errors (e.g., comment deleted, permissions)
    }
}

/**
 * Sends a direct message via the Instagram Graph API.
 * Can send in context of a comment or directly to a user ID.
 */
async function sendDirectMessage(recipientContext, messagePayload, accessToken, isUserId = false) {
    const postData = {
        recipient: {},
        message: messagePayload.message // Expecting { message: { text: ..., quick_replies: ..., attachment: ... } }
    };

    if (isUserId) {
        postData.recipient = { id: recipientContext }; // Target user IGSID directly
    } else {
        postData.recipient = { comment_id: recipientContext }; // Target in context of comment
    }

    const apiVersion = process.env.IG_API_VERSION || "v22.0";
    const url = `https://graph.facebook.com/${apiVersion}/me/messages`; // Always use /me context

    console.log(`Attempting to send DM (isUserId: ${isUserId}, recipientContext: ${recipientContext}):`, JSON.stringify(postData));
    try {
        const response = await axios.post(url, postData, {
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
        });
        console.log("DM sent successfully:", response.data);
        return true; // Indicate success
    } catch (error) {
        console.error("Error sending DM:",
             error.response?.data ? JSON.stringify(error.response.data) : error.message);
        // Handle specific errors: permissions, user blocking DMs, rate limits, message format errors
        return false; // Indicate failure
    }
}

/**
 * Logs an action performed by the automation.
 */
async function logAction(automationId, accountDbId, recipientIgId, sourceIgId, mediaIgId, actionType) {
     if (!automationId || !accountDbId || !recipientIgId || !actionType) {
         console.error("Missing required data for logging action. Skipping log.");
         return;
     }
     console.log(`Logging action: Type=${actionType}, Automation=${automationId}, Account=${accountDbId}, User=${recipientIgId}, Source=${sourceIgId}`);
     try {
        const query = `
            INSERT INTO automation_logs
              (automation_id, account_id, recipient_ig_id, source_ig_id, media_ig_id, action_type)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        // Ensure sourceIgId and mediaIgId are passed correctly (can be null)
        await pool.query(query, [automationId, accountDbId, recipientIgId, sourceIgId || null, mediaIgId || null, actionType]);
     } catch (error) {
        // Log DB error but don't crash the main flow
        console.error("Error logging action to database:", error);
     }
}

/**
 * Counts how many times a specific action was logged for a user/source combo.
 */
async function countRecentLogs(accountDbId, recipientIgId, sourceIgId, actionType) {
     if (!accountDbId || !recipientIgId || !sourceIgId || !actionType) {
         console.error("Missing required data for counting logs.");
         return 999; // Return high number to prevent action if data is missing
     }
     try {
        // Count logs for a specific user on a specific comment/message source
        const query = `
            SELECT COUNT(*)
            FROM automation_logs
            WHERE account_id = $1
              AND recipient_ig_id = $2
              AND source_ig_id = $3
              AND action_type = $4
        `;
        const { rows } = await pool.query(query, [accountDbId, recipientIgId, sourceIgId, actionType]);
        const count = parseInt(rows[0].count, 10);
        console.log(`Log count for ${actionType}, User ${recipientIgId}, Source ${sourceIgId}: ${count}`);
        return count;
    } catch (error) {
        console.error("Error counting logs:", error);
        return 999; // Return high number on DB error to be safe
    }
}

/**
 * Checks if a specific action has already been logged for a user/source combo.
 */
async function hasSentLog(accountDbId, recipientIgId, sourceIgId, actionType) {
     if (!accountDbId || !recipientIgId || !sourceIgId || !actionType) {
         console.error("Missing required data for checking logs.");
         return true; // Assume sent to prevent duplicates if data is missing
     }
     try {
        const query = `
            SELECT 1
            FROM automation_logs
            WHERE account_id = $1
              AND recipient_ig_id = $2
              AND source_ig_id = $3
              AND action_type = $4
            LIMIT 1;
        `;
        const { rows } = await pool.query(query, [accountDbId, recipientIgId, sourceIgId, actionType]);
        return rows.length > 0; // True if at least one log entry exists
    } catch (error) {
        console.error("Error checking logs:", error);
        return false; // Assume not sent if DB error occurs
    }
}

/**
 * Constructs the "Please follow" message using a Button Template.
 */
function constructFollowPrompt(automation, userIgId, sourceId, yourIgUsername) {
    const text = automation.ask_follow_text || "Please follow us to continue!";
    const followButtonText = automation.ask_follow_button || "I've Followed"; // Button label from config

    // Use a fallback if username isn't available
    const profileUrl = yourIgUsername
        ? `https://instagram.com/${yourIgUsername}`
        : 'https://instagram.com'; // Generic link if username missing

    // Construct the postback payload dynamically
    const postbackPayload = `ACTION=RECHECK_FOLLOW&USER=${userIgId}&SOURCE=${sourceId}`;

    // Verify JSON structure with Instagram/Messenger Platform Button Template docs
    return {
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: text,
                    buttons: [
                        {
                            type: "web_url",
                            url: profileUrl,
                            title: "Follow Our Profile" // Clear call to action
                        },
                        {
                            type: "postback",
                            title: followButtonText, // Use configured text
                            payload: postbackPayload
                        }
                    ]
                }
            }
        }
    };
}

/**
 * Constructs the main DM content based on automation settings.
 */
function constructDmContent(automation) {
    // Prioritize template, then buttons+text, then just text
    if (automation.generic_template) {
         console.log("Constructing DM using generic_template");
         // Ensure generic_template is valid JSON object
         try {
             const payload = typeof automation.generic_template === 'string'
                ? JSON.parse(automation.generic_template)
                : automation.generic_template;
             return { message: { attachment: { type: "template", payload: payload } } };
         } catch (e) {
              console.error("Error parsing generic_template JSON:", e);
              // Fallback to text message
              return { message: { text: automation.dm_message || "Thanks!" } };
         }
    } else if (automation.addition_buttons && automation.dm_message) {
         console.log("Constructing DM using text and quick_replies (addition_buttons)");
         // Ensure addition_buttons is valid array of quick reply objects
          try {
             const quickReplies = typeof automation.addition_buttons === 'string'
                ? JSON.parse(automation.addition_buttons)
                : automation.addition_buttons;

             if (!Array.isArray(quickReplies)) throw new Error("addition_buttons is not an array");

             // Basic validation of quick reply format (can be enhanced)
             const validQuickReplies = quickReplies.filter(qr => qr.content_type === 'text' && qr.title);
             if (validQuickReplies.length === 0) throw new Error("No valid quick replies found in addition_buttons");

             return {
                 message: {
                     text: automation.dm_message,
                     quick_replies: validQuickReplies
                 }
             };
         } catch (e) {
              console.error("Error parsing or validating addition_buttons JSON:", e);
              // Fallback to text message
              return { message: { text: automation.dm_message || "Thanks!" } };
         }
    } else {
        console.log("Constructing DM using simple text (dm_message)");
        return { message: { text: automation.dm_message || "Thanks!" } }; // Default text
    }
}


// --- Export Handlers ---
module.exports = {
    getWebhookController,
    postwebhookHandler,
    verifyWebhookSignature
};
