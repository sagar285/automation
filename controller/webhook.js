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

const crypto = require("crypto");
const axios = require("axios");
const { pool } = require("../dbmanager"); // Your exported DB pool

// --- Middleware for Webhook Verification ---
// Place this before your main handler in the route definition
const verifyWebhookSignature = (req, res, next) => {
  // Use raw body parser middleware before this if needed, e.g., express.raw({ type: 'application/json' })
  // Store the raw body in req.rawBody
  const signature = req.headers["x-hub-signature-256"];

  if (!signature) {
    console.warn("Webhook signature missing!");
    // Don't send 403, as FB documentation suggests 200 OK even for errors.
    // But log it and stop processing. Maybe send 400 Bad Request.
    return res.sendStatus(400);
  }

  // Ensure req.rawBody contains the raw, unparsed request body string
  // If using express.json(), you might need a custom setup or use express.raw() first
  if (!req.rawBody) {
    console.error("Raw request body is required for signature verification.");
    return res.sendStatus(500); // Server configuration error
  }

  const expectedSignature =
    "sha256=" +
    crypto
      .createHmac("sha256", process.env.INSTAGRAM_APP_SECRET)
      .update(req.rawBody, "utf-8") // Use the raw body buffer/string
      .digest("hex");

  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  ) {
    console.warn("Invalid webhook signature.");
    // Maybe send 403 Forbidden. Logging is important.
    return res.sendStatus(403);
  }

  // Signature is valid, parse the JSON body if you used express.raw()
  // If using express.json() with verify, body is already parsed.
  try {
    // If using express.raw(), parse the body now for the next middleware/handler
    if (req.headers["content-type"] === "application/json" && !req.body) {
      req.body = JSON.parse(req.rawBody.toString("utf-8"));
    }
  } catch (e) {
    console.error("Error parsing JSON body after signature verification:", e);
    return res.sendStatus(400); // Bad Request (invalid JSON)
  }

  next(); // Proceed to the main handler
};

// --- GET Handler for Webhook Subscription Verification ---
const getWebhookController = async (req, res) => {
  console.log("Received GET /webhook verification request:", req.query);
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // Use an environment variable for your verify token! Do not hardcode.
  const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN; // Set this in your .env

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verification successful!");
    res.status(200).send(challenge);
  } else {
    console.error("Webhook verification failed. Mode or Token mismatch.");
    // Still send 200 as per FB docs, but indicates failure to subscribe/verify
    res.sendStatus(403); // Or send 200 but log error
  }
};

// --- POST Handler for Incoming Webhook Events ---
const postwebhookHandler = async (req, res) => {
  console.log("Webhook POST received:", JSON.stringify(req.body, null, 2));

  try {
    // Process each entry (usually just one)
    for (const entry of req.body.entry) {
      const recipientIgId = entry.id; // ID of the IG Page/Account that received the event

      // 1. Find our internal account representation using the recipient IGSID
      const account = await findAccountByIgId(recipientIgId);
      if (!account) {
        console.log(
          `No active, managed account found for IG ID: ${recipientIgId}. Skipping entry.`
        );
        continue; // Skip this entry
      }
      console.log(
        `Processing event for account: ${account.id} (IG: ${recipientIgId})`
      );

      // 2. Process different event types within the entry
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === "comments") {
            await handleCommentEvent(change.value, account);
          } else if (change.field === "mentions") {
            // await handleMentionEvent(change.value, account); // TODO
          }
          // Handle other 'changes' field types if subscribed
        }
      }

      if (entry.messaging) {
        for (const messageEvent of entry.messaging) {
          if (messageEvent.message && !messageEvent.message.is_echo) {
            // Process incoming DMs
            await handleDirectMessageEvent(messageEvent, account);
          } else if (messageEvent.postback) {
            // await handlePostbackEvent(messageEvent, account); // TODO: Handle button clicks from templates
          } else if (messageEvent.reaction) {
            // Handle message reactions if needed
          }
          // Handle other 'messaging' event types (quick replies, optins etc.)
        }
      }
    } // End for entry loop

    res.sendStatus(200); // Acknowledge receipt successfully
  } catch (error) {
    console.error("Error processing webhook:", error);
    // Still send 200 OK to Facebook/Instagram to prevent webhook disabling
    res.sendStatus(200);
    // But log the internal error thoroughly
  }
};

// ===========================================
// Helper Functions
// ===========================================

async function findAccountByIgId(recipientIgId) {
  try {
    const query =
      "SELECT id, access_token FROM accounts WHERE instagram_id = $1 AND is_active = TRUE LIMIT 1";
    const { rows } = await pool.query(query, [recipientIgId]);
    if (rows.length > 0) {
      return { id: rows[0].id, accessToken: rows[0].access_token };
    }
  } catch (dbError) {
    console.error(
      `Database error finding account for IG ID ${recipientIgId}:`,
      dbError
    );
  }
  return null;
}

// --- Comment Event Handler ---
async function handleCommentEvent(commentData, account) {
  console.log("Handling comment:", JSON.stringify(commentData));
  const mediaId = commentData.media?.id;
  const commentId = commentData.id;
  const commentText = commentData.text?.toLowerCase() || "";
  const commenterIgId = commentData.from?.id; // User who commented
  const recipientIgId = commentData.media?.owner?.id; // ID of the account owning the media - SHOULD match account.instagram_id used for lookup

  if (
    !mediaId ||
    !commentId ||
    !commentText ||
    !commenterIgId ||
    !recipientIgId
  ) {
    console.log("Incomplete comment data, skipping.");
    return;
  }

  // 1. Find Matching Automation (Specific Media > Universal)
  const automation = await findMatchingAutomation(account.id, mediaId);
  if (!automation) {
    console.log(
      `No active automation found for account ${account.id} and media ${mediaId} (or universal).`
    );
    return;
  }
  console.log(
    `Using automation ${automation.id} (Type: ${
      automation.is_universal ? "Universal" : "Specific"
    }) for comment ${commentId}`
  );

  // 2. Check Keywords (if automation requires them)
  const keywordMatch = checkKeywords(
    commentText,
    automation.keywords,
    automation.keyword_trigger_type
  );

  // 3. Handle Public Auto-Reply (Do this even if keywords don't match for DM, if enabled)
  if (automation.auto_public_reply) {
    await handlePublicReply(automation, account, commentId, commenterIgId);
  }

  // 4. Proceed with DM/Follow Check ONLY if keywords match (or if no keywords are set)
  if (!keywordMatch) {
    console.log(
      `Comment text "${commentText}" does not match keywords for automation ${automation.id}. No DM action taken.`
    );
    return;
  }
  console.log(
    "Keyword match successful or not required. Proceeding with potential DM."
  );

  // 5. Check Follower Status (If Required)
  if (automation.ask_to_follow) {
    const isFollowing = await checkFollowerStatus(
      commenterIgId,
      recipientIgId,
      account.accessToken
    );
    if (!isFollowing) {
      console.log(
        `User ${commenterIgId} is not following ${recipientIgId}. Sending follow prompt.`
      );
      const followPromptMessage = constructFollowPrompt(automation);
      if (
        !(await hasSentLog(
          account.id,
          commenterIgId,
          commentId,
          "follow_check_dm"
        ))
      ) {
        await sendDirectMessage(
          commentId,
          followPromptMessage,
          account.accessToken
        );
        await logAction(
          automation.id,
          account.id,
          commenterIgId,
          commentId,
          mediaId,
          "follow_check_dm"
        );
      }
      return; // Stop processing if user isn't following
    }
    console.log(
      `User ${commenterIgId} is following ${recipientIgId}. Proceeding with main DM.`
    );
  }

  // 6. Send the Main DM
  const dmContent = constructDmContent(automation);
  if (!(await hasSentLog(account.id, commenterIgId, commentId, "dm_sent"))) {
    await sendDirectMessage(commentId, dmContent, account.accessToken);
    await logAction(
      automation.id,
      account.id,
      commenterIgId,
      commentId,
      mediaId,
      "dm_sent"
    );
  } else {
    console.log(
      `Already sent main DM for comment ${commentId} to user ${commenterIgId}. Skipping.`
    );
  }
}

// --- Direct Message Event Handler ---
async function handleDirectMessageEvent(messageEvent, account) {
  const senderIgId = messageEvent.sender.id; // User who sent the DM
  const recipientIgId = messageEvent.recipient.id; // Your Page/Account ID
  const messageText = messageEvent.message?.text?.toLowerCase() || "";
  const messageId = messageEvent.message?.mid;

  // Ignore messages sent *by* the page itself (echoes) or empty messages
  if (!messageText || senderIgId === recipientIgId) {
    return;
  }
  console.log(
    `Handling DM ${messageId} from ${senderIgId} to ${recipientIgId}: "${messageEvent.message?.text}"`
  );

  // 1. Find Matching Automation (Usually Universal for DMs)
  // Modify query if you have specific DM automation types/triggers
  const automation = await findMatchingAutomation(account.id, null, true); // Prioritize universal for DMs
  if (!automation) {
    console.log(
      `No active universal automation found for DM handling for account ${account.id}.`
    );
    // Optional: Implement a default reply or specific 'no automation' logic
    return;
  }
  console.log(`Using automation ${automation.id} for DM ${messageId}`);

  // 2. Check Keywords (if automation uses them)
  const keywordMatch = checkKeywords(
    messageText,
    automation.keywords,
    automation.keyword_trigger_type
  );
  if (!keywordMatch) {
    console.log(
      `DM text "${messageText}" does not match keywords for automation ${automation.id}.`
    );
    // Optional: Implement logic for DMs that *don't* match keywords (e.g., forward to human, default reply)
    return;
  }

  // 3. Check Follower Status (If Required)
  if (automation.ask_to_follow) {
    const isFollowing = await checkFollowerStatus(
      senderIgId,
      recipientIgId,
      account.accessToken
    );
    if (!isFollowing) {
      console.log(
        `User ${senderIgId} is not following ${recipientIgId}. Sending follow prompt via DM.`
      );
      const followPromptMessage = constructFollowPrompt(automation);
      if (
        !(await hasSentLog(
          account.id,
          senderIgId,
          messageId,
          "follow_check_dm"
        ))
      ) {
        await sendDirectMessage(
          senderIgId,
          followPromptMessage,
          account.accessToken,
          true
        ); // Send DM directly to sender ID
        await logAction(
          automation.id,
          account.id,
          senderIgId,
          messageId,
          null,
          "follow_check_dm"
        );
      }
      return;
    }
    console.log(
      `User ${senderIgId} is following ${recipientIgId}. Proceeding with main DM reply.`
    );
  }

  // 4. Send DM Reply
  const dmContent = constructDmContent(automation);
  if (!(await hasSentLog(account.id, senderIgId, messageId, "dm_sent"))) {
    await sendDirectMessage(senderIgId, dmContent, account.accessToken, true); // Send DM directly to sender ID
    await logAction(
      automation.id,
      account.id,
      senderIgId,
      messageId,
      null,
      "dm_sent"
    );
  } else {
    console.log(
      `Already sent main DM reply for message ${messageId} to user ${senderIgId}. Skipping.`
    );
  }
}

// --- Utility Functions --- (Similar to previous example, ensure they are defined)

async function findMatchingAutomation(
  accountId,
  mediaId = null,
  preferUniversal = false
) {
  // Query logic prioritizing specific or universal based on context
  let query = "";
  const params = [accountId];

  if (mediaId && !preferUniversal) {
    // Prioritize specific media match for comments
    query = `
            (SELECT *, 1 as priority FROM automations WHERE account_id = $1 AND media_id = $2 AND is_active = TRUE)
            UNION ALL
            (SELECT *, 2 as priority FROM automations WHERE account_id = $1 AND is_universal = TRUE AND is_active = TRUE)
            ORDER BY priority ASC LIMIT 1;
        `;
    params.push(mediaId);
  } else {
    // Prioritize universal for DMs or if no mediaId
    query = `
            (SELECT *, 1 as priority FROM automations WHERE account_id = $1 AND is_universal = TRUE AND is_active = TRUE)
            ${
              mediaId
                ? `UNION ALL (SELECT *, 2 as priority FROM automations WHERE account_id = $1 AND media_id = $2 AND is_active = TRUE)`
                : ""
            }
            ORDER BY priority ASC LIMIT 1;
        `;
    if (mediaId) params.push(mediaId);
  }

  try {
    const { rows } = await pool.query(query, params);
    return rows.length > 0 ? rows[0] : null;
  } catch (dbError) {
    console.error(
      `Database error finding automation for account ${accountId}:`,
      dbError
    );
    return null;
  }
}

function checkKeywords(text, keywords, triggerType = "contains_any") {
  if (!keywords || keywords.length === 0) return true; // No keywords = match
  const lowerText = text.toLowerCase();
  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase();
    // Add logic based on triggerType ('exact', 'contains_any', 'contains_all', 'regex')
    if (lowerText.includes(lowerKeyword)) return true; // Simple contains check
  }
  return false;
}

async function checkFollowerStatus(userId, targetId, accessToken) {
  // *** Placeholder: Implement ACTUAL Instagram Graph API call ***
  // Requires permissions. Endpoint details might change. Consult IG Graph API docs.
  // Example Concept: GET /vXX.0/{targetId}?fields=followers_count,follows_count OR check relationship endpoint
  console.warn(
    `Follower check for ${userId} following ${targetId} NOT IMPLEMENTED. Returning TRUE.`
  );
  return true; // *** Replace with actual API call ***
}

function constructFollowPrompt(automation) {
  // Build the follow prompt message based on automation settings
  // Might be simple text, or include a button/quick reply if API allows
  return {
    message: {
      text: `${
        automation.ask_follow_text || "Please follow us first!"
      }\n(Button: ${automation.ask_follow_button || "Followed!"})`,
    },
  }; // Placeholder
}

function constructDmContent(automation) {
  // Build the main DM payload based on automation settings (text, template, buttons)
  // Ensure the structure matches IG API requirements
  if (automation.generic_template) {
    return {
      message: {
        attachment: { type: "template", payload: automation.generic_template },
      },
    };
  } else if (automation.addition_buttons && automation.dm_message) {
    return {
      message: {
        text: automation.dm_message,
        quick_replies: automation.addition_buttons,
      },
    };
  } else {
    return { message: { text: automation.dm_message || "Thanks!" } }; // Default text
  }
}

async function sendDirectMessage(
  recipientContext,
  messagePayload,
  accessToken,
  isUserId = false
) {
  // Sends DM using comment_id context or directly to user_id
  const postData = { recipient: {}, ...messagePayload };
  if (isUserId) {
    postData.recipient = { id: recipientContext }; // Send directly to user IGSID
  } else {
    postData.recipient = { comment_id: recipientContext }; // Send in context of a comment
  }

  console.log(`Sending DM (isUserId: ${isUserId}):`, JSON.stringify(postData));
  try {
    const response = await axios.post(
      "https://graph.instagram.com/v22.0/me/messages",
      postData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("DM sent successfully:", response.data);
    return true;
  } catch (error) {
    console.error(
      "Error sending DM:",
      error.response?.data ? JSON.stringify(error.response.data) : error.message
    );
    return false;
  }
}

async function handlePublicReply(
  automation,
  account,
  commentId,
  commenterIgId
) {
  // Checks limit, selects reply, sends reply, logs action
  if (!automation.auto_public_reply) return; // Double check

  // Check limit using logs
  const replyCount = await countRecentLogs(
    account.id,
    commenterIgId,
    commentId,
    "public_reply"
  );
  const limit =
    automation.auto_reply_limit > 0 ? automation.auto_reply_limit : 1; // Default limit 1 if 0 or null

  if (replyCount >= limit) {
    console.log(
      `Public reply limit (${limit}) reached for user ${commenterIgId} on comment ${commentId}.`
    );
    return;
  }

  // Select Reply Message
  let replyText = "Thanks!"; // Default
  if (
    automation.auto_reply_messages &&
    automation.auto_reply_messages.length > 0
  ) {
    // Add logic for 'AI' mode vs 'MANUAL' (random/sequential) if needed
    const randomIndex = Math.floor(
      Math.random() * automation.auto_reply_messages.length
    );
    replyText = automation.auto_reply_messages[randomIndex];
  } else {
    console.log("No auto-reply messages configured, using default.");
  }

  // Send Reply via API
  console.log(`Sending public reply to comment ${commentId}: "${replyText}"`);
  try {
    await axios.post(
      `https://graph.instagram.com/v22.0/${commentId}/replies`,
      { message: replyText },
      { headers: { Authorization: `Bearer ${account.accessToken}` } }
    );
    console.log("Public reply sent successfully.");
    await logAction(
      automation.id,
      account.id,
      commenterIgId,
      commentId,
      automation.media_id,
      "public_reply"
    );
  } catch (error) {
    console.error(
      "Error sending public reply:",
      error.response?.data ? JSON.stringify(error.response.data) : error.message
    );
  }
}

// --- Logging Functions --- (Ensure these match previous example using automation_logs table)
async function logAction(
  automationId,
  accountId,
  recipientIgId,
  sourceIgId,
  mediaIgId,
  actionType
) {
  try {
    const query = `INSERT INTO automation_logs (automation_id, account_id, recipient_ig_id, source_ig_id, media_ig_id, action_type) VALUES ($1, $2, $3, $4, $5, $6)`;
    await pool.query(query, [
      automationId,
      accountId,
      recipientIgId,
      sourceIgId,
      mediaIgId,
      actionType,
    ]);
  } catch (error) {
    console.error("Error logging action:", error);
  }
}

async function countRecentLogs(
  accountId,
  recipientIgId,
  sourceIgId,
  actionType
) {
  // Counts specific action for a user on a specific comment/message
  try {
    const query = `SELECT COUNT(*) FROM automation_logs WHERE account_id = $1 AND recipient_ig_id = $2 AND source_ig_id = $3 AND action_type = $4`;
    const { rows } = await pool.query(query, [
      accountId,
      recipientIgId,
      sourceIgId,
      actionType,
    ]);
    return parseInt(rows[0].count, 10);
  } catch (error) {
    console.error("Error counting logs:", error);
    return 999;
  } // Return high number on error to be safe
}

async function hasSentLog(accountId, recipientIgId, sourceIgId, actionType) {
  // Checks if a specific action log already exists
  try {
    const query = `SELECT 1 FROM automation_logs WHERE account_id = $1 AND recipient_ig_id = $2 AND source_ig_id = $3 AND action_type = $4 LIMIT 1`;
    const { rows } = await pool.query(query, [
      accountId,
      recipientIgId,
      sourceIgId,
      actionType,
    ]);
    return rows.length > 0;
  } catch (error) {
    console.error("Error checking logs:", error);
    return false;
  }
}

// --- Export Handlers ---
module.exports = {
  getWebhookController,
  postwebhookHandler,
  verifyWebhookSignature, // Export middleware to be used in router setup
};
