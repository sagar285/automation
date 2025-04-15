// const { pool } = require("../dbmanager");
// const axios = require("axios");

// const getWebhookController = async (req, res) => {
//   try {
//     console.log(req.body, "pppp", req.query, req.params);
//     const mode = req.query["hub.mode"];
//     const token = req.query["hub.verify_token"];
//     const challenge = req.query["hub.challenge"];

//     // Your verification token (set this in Facebook Developer Console)
//     const VERIFY_TOKEN =
//       "IGAApOtLQdo9FBZAE5hVWRrQTEzYUN6WFhNQmtseVVXdDRGS29iUFlxS1N2dGdMLU5XMDlqMk81MDl1S2dMT3M1NVljRXpJU3VxZAmdnRmxJLXFuYjVna0V4UzVfSWdPb3c1Y2ZAyTE9QdS1scVhxOUM2QUkwMVFGaE1ldTBQc1o2QQZDZD";

//     if (mode === "subscribe" && token === VERIFY_TOKEN) {
//       res.status(200).send(challenge);
//     } else {
//       console.error("Verification failed");
//       res.status(200).send({ message: "get request succesfully available" });
//     }
//   } catch (error) {
//     console.log(error, "error in get webhook controller");
//   }
// };

// // const postwebhookHandler = async (req, res) => {
// //   try {
// //     console.log(
// //       "Webhook event received:",
// //       req.body,
// //       req.body.entry,
// //       req.body.entry[0].messaging,
// //     );

// //     if(req.body.entry[0].changes){
// //     const mediaId = req.body.entry[0].changes[0].value.media.id;
// //     const query = `
// //       SELECT a.*, acc.access_token
// //       FROM automations a
// //       INNER JOIN accounts acc ON a.account_id = acc.id
// //       WHERE a.media_id = $1
// //       `;
// //     const { rows } = await pool.query(query, [mediaId]);
// //     console.log(rows, "pppppp");

// //     if (rows.length > 0) {
// //       const automation = rows[0];
// //       const keywords = automation.keywords;
// //       const accessToken = automation.access_token;

// //       for (let word of keywords) {
// //         if (word === req.body.entry[0].changes[0].value.text) {
// //           // Your code here
// //           const postData = {
// //             recipient: {
// //                 comment_id: req.body.entry[0].changes[0].value.id,
// //             },
// //             message: {
// //               text: `You commented this keyword: ${word}`,
// //             },
// //           };

// //           try {
// //             const response = await axios.post(
// //               "https://graph.instagram.com/v22.0/me/messages",
// //               postData,
// //               {
// //                 headers: {
// //                   Authorization: `Bearer ${accessToken}`,
// //                   "Content-Type": "application/json",
// //                 },
// //               }
// //             );

// //             console.log("Message sent successfully:", response.data);
// //           } catch (axiosError) {
// //             console.error(
// //               "Error sending message:",
// //               axiosError.response?.data || axiosError.message
// //             );
// //           }
// //         }
// //       }
// //     } else {
// //       console.log("No matching automation found for this media ID");
// //     }

// //     // Process the webhook event here
// //     res.sendStatus(200);
// //   }
// // }
// //   catch (error) {
// //     console.error("Error processing webhook:", error);
// //     res.sendStatus(500);
// //   }

// // };

// const postwebhookHandler = async (req, res) => {
//     console.log("Webhook event received:", JSON.stringify(req.body, null, 2));

//     // --- SECURITY WARNING ---
//     // This handler is MISSING webhook signature verification (X-Hub-Signature).
//     // You MUST implement this before production to ensure requests are from Instagram.
//     // See previous examples for 'verifyWebhookSignature' middleware.
//     // --- END WARNING ---

//     try {
//         // Check if the event is for comments ('changes' field)
//         if (req.body.entry && req.body.entry[0] && req.body.entry[0].changes) {
//             for (const change of req.body.entry[0].changes) {
//                 if (change.field === 'comments') {
//                     const commentData = change.value;
//                     const mediaId = commentData.media?.id;
//                     const commentId = commentData.id;
//                     const commentText = commentData.text?.toLowerCase() || ''; // Normalize text

//                     if (!mediaId || !commentId || !commentText) {
//                         console.log("Incomplete comment data in change, skipping this change.");
//                         continue; // Move to the next change if essential data is missing
//                     }

//                     console.log(`Processing comment ${commentId} on media ${mediaId} with text: "${commentData.text}"`);

//                     // Query for automations matching ONLY this specific media_id
//                     // WARNING: This ignores account context and universal automations.
//                     const query = `
//                         SELECT a.*, acc.access_token
//                         FROM automations a
//                         INNER JOIN accounts acc ON a.account_id = acc.id
//                         WHERE a.media_id = $1 AND a.is_active = TRUE
//                         LIMIT 1; -- Assuming only one specific automation per media ID
//                     `;
//                     const { rows } = await pool.query(query, [mediaId]);

//                     if (rows.length > 0) {
//                         const automation = rows[0];
//                         const keywords = automation.keywords || []; // Default to empty array
//                         const accessToken = automation.access_token;
//                         const dmMessageToSend = automation.dm_message || "Thanks for your comment!"; // Use stored message or default

//                         console.log(`Found automation ${automation.id} for media ${mediaId}. Checking keywords:`, keywords);

//                         let keywordMatched = false;
//                         for (const keyword of keywords) {
//                             // Using case-insensitive 'includes' check
//                             if (commentText.includes(keyword.toLowerCase())) {
//                                 console.log(`Keyword "${keyword}" matched in comment text.`);
//                                 keywordMatched = true;
//                                 break; // Stop checking once a keyword matches
//                             }
//                         }

//                         if (keywordMatched) {
//                             // Keyword matched, proceed to send DM
//                             const postData = {
//                                 recipient: {
//                                     comment_id: commentId, // Target the specific comment
//                                 },
//                                 message: {
//                                     text: dmMessageToSend, // Use the message from the automation record
//                                 },
//                             };

//                             console.log("Attempting to send DM:", JSON.stringify(postData));

//                             try {
//                                 const response = await axios.post(
//                                     "https://graph.instagram.com/v22.0/me/messages", // Use /me context
//                                     postData,
//                                     {
//                                         headers: {
//                                             Authorization: `Bearer ${accessToken}`,
//                                             "Content-Type": "application/json",
//                                         },
//                                     }
//                                 );
//                                 console.log("DM sent successfully:", response.data);
//                                 // OPTIONAL: Log this action to your automation_logs table if you implement it
//                                 // await logAction(automation.id, automation.account_id, commentData.from?.id, commentId, mediaId, 'dm_sent');

//                             } catch (axiosError) {
//                                 console.error(
//                                     "Error sending DM:",
//                                     axiosError.response?.data || axiosError.message
//                                 );
//                                 // Handle specific errors if needed (e.g., token expired, permissions)
//                             }
//                         } else {
//                             console.log("No keywords matched for this comment.");
//                         }
//                     } else {
//                         console.log(`No active automation found specifically for media ID: ${mediaId}`);
//                     }
//                 } // End if change.field === 'comments'
//             } // End for loop changes
//         } else {
//              console.log("Webhook received, but no 'changes' field found in entry[0]. Ignoring (Might be DM or other event).");
//              // Add logic here later to handle 'messaging' events if needed
//         }

//         // Always acknowledge the webhook quickly
//         res.sendStatus(200);

//     } catch (error) {
//         console.error("Error processing webhook:", error);
//         res.sendStatus(500); // Internal Server Error
//     }
// };

// module.exports = {
//   getWebhookController,
//   postwebhookHandler,
// };

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
