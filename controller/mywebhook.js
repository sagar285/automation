const { pool } = require("../dbmanager");
const axios = require("axios");

const getWebhookController = async (req, res) => {
  try {
    console.log(req.body, "pppp", req.query, req.params);
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    // Your verification token (set this in Facebook Developer Console)
    const VERIFY_TOKEN =
      "IGAApOtLQdo9FBZAE5hVWRrQTEzYUN6WFhNQmtseVVXdDRGS29iUFlxS1N2dGdMLU5XMDlqMk81MDl1S2dMT3M1NVljRXpJU3VxZAmdnRmxJLXFuYjVna0V4UzVfSWdPb3c1Y2ZAyTE9QdS1scVhxOUM2QUkwMVFGaE1ldTBQc1o2QQZDZD";

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      console.error("Verification failed");
      res.status(200).send({ message: "get request succesfully available" });
    }
  } catch (error) {
    console.log(error, "error in get webhook controller");
  }
};

// const postwebhookHandler = async (req, res) => {
//   try {
//     console.log(
//       "Webhook event received:",
//       req.body,
//       req.body.entry,
//       req.body.entry[0].messaging,
//     );

//     if(req.body.entry[0].changes){
//     const mediaId = req.body.entry[0].changes[0].value.media.id;
//     const query = `
//       SELECT a.*, acc.access_token
//       FROM automations a
//       INNER JOIN accounts acc ON a.account_id = acc.id
//       WHERE a.media_id = $1
//       `;
//     const { rows } = await pool.query(query, [mediaId]);
//     console.log(rows, "pppppp");

//     if (rows.length > 0) {
//       const automation = rows[0];
//       const keywords = automation.keywords;
//       const accessToken = automation.access_token;

//       for (let word of keywords) {
//         if (word === req.body.entry[0].changes[0].value.text) {
//           // Your code here
//           const postData = {
//             recipient: {
//                 comment_id: req.body.entry[0].changes[0].value.id,
//             },
//             message: {
//               text: `You commented this keyword: ${word}`,
//             },
//           };

//           try {
//             const response = await axios.post(
//               "https://graph.instagram.com/v22.0/me/messages",
//               postData,
//               {
//                 headers: {
//                   Authorization: `Bearer ${accessToken}`,
//                   "Content-Type": "application/json",
//                 },
//               }
//             );

//             console.log("Message sent successfully:", response.data);
//           } catch (axiosError) {
//             console.error(
//               "Error sending message:",
//               axiosError.response?.data || axiosError.message
//             );
//           }
//         }
//       }
//     } else {
//       console.log("No matching automation found for this media ID");
//     }

//     // Process the webhook event here
//     res.sendStatus(200);
//   }
// }
//   catch (error) {
//     console.error("Error processing webhook:", error);
//     res.sendStatus(500);
//   }

// };

// const postwebhookHandler = async (req, res) => {
//   console.log("Webhook event received:", JSON.stringify(req.body, null, 2));

//   // --- SECURITY WARNING ---
//   // This handler is MISSING webhook signature verification (X-Hub-Signature).
//   // You MUST implement this before production to ensure requests are from Instagram.
//   // See previous examples for 'verifyWebhookSignature' middleware.
//   // --- END WARNING ---

//   try {
//     var accessToken;
//     var entryId = req.body.entry[0].id
//     const accountQuery = `
//     SELECT id as account_db_id, access_token
//     FROM accounts
//     WHERE user_insta_business_id = $1 AND is_active = TRUE
//     LIMIT 1`;
//      const { rows } = await pool.query(accountQuery, [entryId]);
//      if (rows.length === 0) {
//       console.log(`No active account found for business ID ${recipientIgId}. Webhook ignored for this entry.`);
//       // We still send 200 OK later, just don't process this entry further.
//       // Skip to the next entry
//   }
//   accessToken =rows[0].access_token

//     // Check if the event is for comments ('changes' field)
//     if (req.body.entry && req.body.entry[0] && req.body.entry[0].changes) {
//       for (const change of req.body.entry[0].changes) {
//         if (change.field === "comments") {
//           const commentData = change.value;
//           const mediaId = commentData.media?.id;
//           const commentId = commentData.id;
//           const commentText = commentData.text?.toLowerCase() || ""; // Normalize text

//           if (!mediaId || !commentId || !commentText) {
//             console.log(
//               "Incomplete comment data in change, skipping this change."
//             );
//             continue; // Move to the next change if essential data is missing
//           }

//           console.log(
//             `Processing comment ${commentId} on media ${mediaId} with text: "${commentData.text}"`
//           );

//           // Query for automations matching ONLY this specific media_id
//           // WARNING: This ignores account context and universal automations.
//           const query = `
//                         SELECT a.*, acc.access_token
//                         FROM automations a
//                         INNER JOIN accounts acc ON a.account_id = acc.id
//                         WHERE a.media_id = $1 AND a.is_active = TRUE
//                         LIMIT 1; -- Assuming only one specific automation per media ID
//                     `;
//           const { rows } = await pool.query(query, [mediaId]);

//           if (rows.length > 0) {
//             const automation = rows[0];
//             const keywords = automation.keywords || []; // Default to empty array
//             accessToken = automation.access_token;
//             const dmMessageToSend =
//               automation.dm_message || "Thanks for your comment!"; // Use stored message or default

//             console.log(
//               `Found automation ${automation.id} for media ${mediaId}. Checking keywords:`,
//               keywords
//             );

//             let keywordMatched = false;
//             for (const keyword of keywords) {
//               // Using case-insensitive 'includes' check
//               if (commentText.includes(keyword.toLowerCase())) {
//                 console.log(`Keyword "${keyword}" matched in comment text.`);
//                 keywordMatched = true;
//                 break; // Stop checking once a keyword matches
//               }
//             }

//             if (keywordMatched) {
//               // Keyword matched, proceed to send DM and auto replies

//               try {
//                 const response = await axios.post(
//                   `https://graph.instagram.com/v22.0/${commentId}/replies`, // Use /me context
//                   { message: "bake samosa kaeo" },
//                   {
//                     headers: {
//                       Authorization: `Bearer ${accessToken}`,
//                       "Content-Type": "application/json",
//                     },
//                   }
//                 );
//               } catch (error) {
//                 console.log(error, "error in quick replies");
//               }

//               const postData = {
//                 recipient: {
//                   comment_id: commentId, // Target the specific comment
//                 },
//                 message: {
//                   text: dmMessageToSend, // Use the message from the automation record
//                 },
//               };

//               console.log("Attempting to send DM:", JSON.stringify(postData));

//               try {
//                 const response = await axios.post(
//                   "https://graph.instagram.com/v22.0/me/messages", // Use /me context
//                   postData,
//                   {
//                     headers: {
//                       Authorization: `Bearer ${accessToken}`,
//                       "Content-Type": "application/json",
//                     },
//                   }
//                 );
//                 console.log("DM sent successfully:", response.data);
//                 // OPTIONAL: Log this action to your automation_logs table if you implement it
//                 // await logAction(automation.id, automation.account_id, commentData.from?.id, commentId, mediaId, 'dm_sent');
//               } catch (axiosError) {
//                 console.error(
//                   "Error sending DM:",
//                   axiosError.response?.data || axiosError.message
//                 );
//                 // Handle specific errors if needed (e.g., token expired, permissions)
//               }
//             } else {
//               console.log("No keywords matched for this comment.");
//             }
//           } else {
//             console.log(
//               `No active automation found specifically for media ID: ${mediaId}`
//             );
//           }
//         } // End if change.field === 'comments'
//       } // End for loop changes
//     } else {
//       console.log(
//         "Webhook received, but no 'changes' field found in entry[0]. Ignoring (Might be DM or other event)."
//       );
//       if (req.body.entry[0].messaging) {
//         const senderId = req.body.entry[0].messaging[0].sender.id;
//         try {
//           const response = await axios.get(
//             `https://graph.instagram.com/v21.0/${senderId}`,
//             {
//               params: {
//                 fields:
//                   "name,profile_pic,username,follower_count,is_business_follow_user,is_user_follow_business,is_verified_user",
//                 access_token: accessToken,
//               },
//             }
//           );

//           console.log("User info retrieved successfully:", response.data);
//           if (response.data.is_user_follow_business) {
//             try {
//               const postData = {
//                 recipient: {
//                   id: senderId, // Target the specific user
//                 },
//                 message: {
//                   text: "hello i am jalebi samosa", // Use the message from the automation record
//                 },
//               };
//               const response = await axios.post(
//                 "https://graph.instagram.com/v22.0/me/messages", // Use /me context
//                 postData,
//                 {
//                   headers: {
//                     Authorization: `Bearer ${accessToken}`,
//                     "Content-Type": "application/json",
//                   },
//                 }
//               );
//             } catch (error) {
//               console.log(error, "error in sending messages replies");
//             }
//           } else {
//             try {
//               const postData = {
//                 recipient: {
//                   id: senderId, // Target the specific user
//                 },
//                 message: {
//                   attachment: {
//                     type: "template",
//                     payload: {
//                       template_type: "button",
//                       text: "You're not following ur,once you follow then only i will send you the link!",
//                       buttons: [
//                         {
//                           type: "web_url",
//                           url: "https://www.google.com",
//                           title: "googlelink",
//                         },
//                         {
//                           type: "postback",
//                            payload: "FOLLOWED_CONFIRMATION",
//                           title: "Yes i followed",
//                         },
//                       ],
//                     },
//                   },
//                 },
//               };
//               const response = await axios.post(
//                 "https://graph.instagram.com/v22.0/me/messages", // Use /me context
//                 postData,
//                 {
//                   headers: {
//                     Authorization: `Bearer ${accessToken}`,
//                     "Content-Type": "application/json",
//                   },
//                 }
//               );
//             } catch (error) {
//               console.log(error, "error in sending messages replies");
//             }
//           }
//         } catch (error) {
//           console.error(
//             "Error retrieving Instagram user info:",
//             error.response?.data || error.message
//           );
//           throw error;
//         }
//       }

//       // Add logic here later to handle 'messaging' events if needed
//     }

//     // Always acknowledge the webhook quickly
//     res.sendStatus(200);
//   } catch (error) {
//     console.error("Error processing webhook:", error);
//     res.sendStatus(500); // Internal Server Error
//   }
// };

const API_VERSION = process.env.IG_API_VERSION || "v22.0"; // Use environment variable

// --- POST Handler ---
const postwebhookHandler = async (req, res) => {
  console.log("Webhook POST received:", JSON.stringify(req.body, null, 2));

  // Basic validation
  if (
    typeof req.body !== "object" ||
    req.body === null ||
    !Array.isArray(req.body.entry)
  ) {
    console.warn("Webhook body missing 'entry' array or not an object.");
    return res.sendStatus(200); // Acknowledge, but invalid format
  }

  // Send 200 OK immediately to ensure fast response
  res.sendStatus(200);
  console.log("Sent 200 OK response immediately. Processing async...");

  // Process entries asynchronously
  setTimeout(async () => {
    try {
      // Process entries one by one
      for (const entry of req.body.entry) {
        const recipientIgId = entry.id; // Your Account's IGSID
        if (!recipientIgId) {
          console.warn(
            "Webhook entry missing recipient ID (entry.id). Skipping."
          );
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
            console.log(
              `No active account found for business ID ${recipientIgId}.`
            );
            continue; // Skip this entry
          }
          accountInfo = {
            accountDbId: rows[0].account_db_id,
            accessToken: rows[0].access_token,
            recipientIgId: recipientIgId,
          };

          if (!accountInfo.accessToken) {
            console.error(
              `CRITICAL: Access token missing for account ${accountInfo.accountDbId}.`
            );
            continue; // Skip this entry
          }

          console.log(
            `ASYNC: Starting processing for account ${accountInfo.accountDbId}`
          );

          // Process Comments
          if (entry.changes && Array.isArray(entry.changes)) {
            for (const change of entry.changes) {
              if (change.field === "comments" && change.value) {
                await processCommentEventAsync(change.value, accountInfo);
              }
            }
          }

          // Process DMs
          if (entry.messaging && Array.isArray(entry.messaging)) {
            for (const messageEvent of entry.messaging) {
              if (messageEvent.message && !messageEvent.message.is_echo) {
                await processDirectMessageEventAsync(messageEvent, accountInfo);
              } else if (messageEvent.postback) {
                await processPostbackEventAsync(messageEvent, accountInfo);
              }
            }
          }

          console.log(
            `ASYNC: Finished processing for account ${accountInfo.accountDbId}`
          );
        } catch (dbError) {
          console.error(
            `Database error looking up account for ${recipientIgId}:`,
            dbError
          );
        }
      } // End for entry loop
    } catch (asyncError) {
      console.error("ASYNC Error in webhook processing:", asyncError);
    }
  }, 0);
};

// ===========================================
// ASYNCHRONOUS Event Processors
// ===========================================

async function processCommentEventAsync(commentData, accountInfo) {
  const { accountDbId, accessToken, recipientIgId } = accountInfo;
  const mediaId = commentData.media?.id;
  const commentId = commentData.id;
  const commentText = commentData.text?.toLowerCase() || "";
  const commenterIgId = commentData.from?.id;

  if (!mediaId || !commentId || !commentText || !commenterIgId) {
    console.log("Incomplete comment data, skipping processing");
    return;
  }

  console.log(`ASYNC: Processing comment ${commentId} on media ${mediaId}`);

  // Check if this comment has already been processed
  if (
    await hasSentLog(accountDbId, commenterIgId, commentId, "comment_processed")
  ) {
    console.log(`Comment ${commentId} already processed. Skipping.`);
    return;
  }

  // Mark comment as processed
  await logAction(
    null,
    accountDbId,
    commenterIgId,
    commentId,
    mediaId,
    "comment_processed"
  );

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
    console.log(
      `ASYNC: Using automation ${automation.id} for comment ${commentId}.`
    );
  } catch (dbError) {
    console.error(
      `ASYNC: DB error finding automation for comment ${commentId}:`,
      dbError
    );
    return;
  }

  // 2. Check Keywords
  const keywordMatch = checkKeywords(commentText, automation.keywords);

  // 3. Handle Public Auto-Reply (only send one)
  if (
    automation.auto_public_reply &&
    !(await hasSentLog(accountDbId, commenterIgId, commentId, "public_reply"))
  ) {
    await handlePublicReply(automation, accountInfo, commentId, commenterIgId);
  }

  // 4. Proceed with DM ONLY if keywords matched
  if (!keywordMatch) return;
  console.log(`ASYNC: Keywords matched for comment ${commentId}. Proceeding.`);

  // 5. Check Follower Status (if required)
  if (automation.ask_to_follow) {
    const isFollowing = await checkFollowerStatus(
      commenterIgId,
      recipientIgId,
      accessToken
    );
    if (!isFollowing) {
      const followPromptMessage = constructFollowPrompt(
        automation,
        commenterIgId,
        commentId
      );
      if (
        !(await hasSentLog(
          accountDbId,
          commenterIgId,
          commentId,
          "follow_check_dm"
        ))
      ) {
        const sent = await sendDirectMessage(
          commentId,
          followPromptMessage,
          accessToken
        );
        if (sent)
          await logAction(
            automation.id,
            accountDbId,
            commenterIgId,
            commentId,
            mediaId,
            "follow_check_dm"
          );
      }
      return; // Don't send main DM yet
    }
  }

  // 6. Send Main DM (with YouTube link)
  if (
    !(await hasSentLog(
      accountDbId,
      commenterIgId,
      commentId,
      "youtube_link_sent"
    ))
  ) {
    const youtubeMessage = {
      message: {
        text: "Thanks for your comment! Here's your YouTube link: https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
    };
    const sent = await sendDirectMessage(
      commentId,
      youtubeMessage,
      accessToken
    );
    if (sent)
      await logAction(
        automation.id,
        accountDbId,
        commenterIgId,
        commentId,
        mediaId,
        "youtube_link_sent"
      );
  }
}

async function processDirectMessageEventAsync(messageEvent, accountInfo) {
  const { accountDbId, accessToken, recipientIgId } = accountInfo;
  const senderIgId = messageEvent.sender?.id;
  const messageText = messageEvent.message?.text?.toLowerCase() || "";
  const messageId = messageEvent.message?.mid;

  if (
    !senderIgId ||
    !messageId ||
    !messageText ||
    senderIgId === recipientIgId
  ) {
    console.log("Incomplete message data or self-message, skipping processing");
    return;
  }

  console.log(`ASYNC: Processing DM ${messageId} from ${senderIgId}`);

  // Check if this message has already been processed
  if (
    await hasSentLog(accountDbId, senderIgId, messageId, "message_processed")
  ) {
    console.log(`Message ${messageId} already processed. Skipping.`);
    return;
  }

  // Mark message as processed
  await logAction(
    null,
    accountDbId,
    senderIgId,
    messageId,
    null,
    "message_processed"
  );

  // 1. Find Universal Automation (Original Schema)
  const query = `
        SELECT * FROM automations WHERE account_id = $1 AND is_universal = TRUE AND is_active = TRUE
        ORDER BY created_at DESC LIMIT 1;`;
  let automation;
  try {
    const { rows } = await pool.query(query, [accountDbId]);
    if (rows.length === 0) return;
    automation = rows[0];
    console.log(
      `ASYNC: Using universal automation ${automation.id} for DM ${messageId}.`
    );
  } catch (dbError) {
    console.error(
      `ASYNC: DB error finding automation for DM ${messageId}:`,
      dbError
    );
    return;
  }

  // 2. Check Keywords
  const keywordMatch = checkKeywords(messageText, automation.keywords);
  if (!keywordMatch) return;
  console.log(`ASYNC: Keywords matched for DM ${messageId}. Proceeding.`);

  // 3. Check Follower Status
  const isFollowing = await checkFollowerStatus(
    senderIgId,
    recipientIgId,
    accessToken
  );
  if (!isFollowing) {
    const followPromptMessage = constructFollowPrompt(
      automation,
      senderIgId,
      messageId
    );
    if (
      !(await hasSentLog(accountDbId, senderIgId, messageId, "follow_check_dm"))
    ) {
      const sent = await sendDirectMessage(
        senderIgId,
        followPromptMessage,
        accessToken,
        true
      );
      if (sent)
        await logAction(
          automation.id,
          accountDbId,
          senderIgId,
          messageId,
          null,
          "follow_check_dm"
        );
    }
    return; // Don't send YouTube link yet
  }

  // 4. Send YouTube Link to following users
  if (
    !(await hasSentLog(accountDbId, senderIgId, messageId, "youtube_link_sent"))
  ) {
    const youtubeMessage = {
      message: {
        text: "Thanks for your message! Here's your YouTube link: https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
    };
    const sent = await sendDirectMessage(
      senderIgId,
      youtubeMessage,
      accessToken,
      true
    );
    if (sent)
      await logAction(
        automation.id,
        accountDbId,
        senderIgId,
        messageId,
        null,
        "youtube_link_sent"
      );
  }
}

async function processPostbackEventAsync(postbackEvent, accountInfo) {
  const { accountDbId, accessToken, recipientIgId } = accountInfo;
  const senderIgId = postbackEvent.sender?.id;
  const payload = postbackEvent.postback?.payload;

  console.log(
    `ASYNC: Processing postback from ${senderIgId} with payload: ${payload}`
  );
  if (!payload || !senderIgId) return;

  const params = new URLSearchParams(payload);
  const action = params.get("ACTION");
  const userIdToCheck = params.get("USER");
  const sourceId = params.get("SOURCE");

  if (userIdToCheck !== senderIgId) return;

  if (action === "RECHECK_FOLLOW" && userIdToCheck && sourceId) {
    const isFollowing = await checkFollowerStatus(
      userIdToCheck,
      recipientIgId,
      accessToken
    );
    if (isFollowing) {
      console.log(
        `ASYNC: User ${userIdToCheck} confirmed following. Sending YouTube link.`
      );

      // Send YouTube link if not already sent
      if (
        !(await hasSentLog(
          accountDbId,
          userIdToCheck,
          sourceId,
          "youtube_link_sent"
        ))
      ) {
        const youtubeMessage = {
          message: {
            text: "Thanks for following! Here's your YouTube link: https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          },
        };
        const sent = await sendDirectMessage(
          userIdToCheck,
          youtubeMessage,
          accessToken,
          true
        );
        if (sent) {
          // Find automation ID if needed for logging
          const originalAutomation = await findAutomationForSource(
            accountDbId,
            sourceId
          );
          const automationId = originalAutomation
            ? originalAutomation.id
            : null;
          await logAction(
            automationId,
            accountDbId,
            userIdToCheck,
            sourceId,
            null,
            "youtube_link_sent"
          );
        }
      } else {
        console.log(
          `YouTube link already sent to user ${userIdToCheck} for source ${sourceId}`
        );
      }
    } else {
      console.log(
        `ASYNC: User ${userIdToCheck} still not following after postback.`
      );
      await sendDirectMessage(
        userIdToCheck,
        {
          message: {
            text: "Please follow us to continue!",
          },
        },
        accessToken,
        true
      );
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
  } catch (dbError) {
    console.error("DB error in findAutomationForSource:", dbError);
    return null;
  }
}

// ===========================================
// Utility Functions (Using graph.instagram.com)
// ===========================================

function checkKeywords(text, keywords, triggerType = "contains_any") {
  if (!keywords || keywords.length === 0) return true;
  const lowerText = text?.toLowerCase() || "";
  for (const keyword of keywords) {
    if (!keyword) continue;
    if (lowerText.includes(keyword.toLowerCase())) return true;
  }
  return false;
}

async function checkFollowerStatus(
  userIdToCheck,
  businessAccountIgId,
  accessToken
) {
  // Using graph.instagram.com for follower check
  try {
    const response = await axios.get(
      `https://graph.instagram.com/${API_VERSION}/${userIdToCheck}`,
      {
        params: {
          fields:
            "name,profile_pic,username,follower_count,is_business_follow_user,is_user_follow_business,is_verified_user",
          access_token: accessToken,
        },
      }
    );

    if (
      response.data &&
      typeof response.data.is_user_follow_business === "boolean"
    ) {
      console.log(
        `API check result: User ${userIdToCheck} follows business: ${response.data.is_user_follow_business}`
      );
      return response.data.is_user_follow_business;
    }

    console.warn(
      `Could not determine follower status for ${userIdToCheck}. Response:`,
      response.data
    );
    return false;
  } catch (error) {
    console.error(
      `Error checking follower status for ${userIdToCheck}:`,
      error.response?.data ? JSON.stringify(error.response.data) : error.message
    );
    return false;
  }
}

async function handlePublicReply(
  automation,
  accountInfo,
  commentId,
  commenterIgId
) {
  const { accountDbId, accessToken } = accountInfo;

  let replyText = "Thanks!";
  if (
    automation.auto_reply_messages &&
    automation.auto_reply_messages.length > 0
  ) {
    const randomIndex = Math.floor(
      Math.random() * automation.auto_reply_messages.length
    );
    replyText = automation.auto_reply_messages[randomIndex];
  }

  // Using graph.instagram.com as requested
  const url = `https://graph.instagram.com/v22.0/${commentId}/replies`;
  console.log(
    `Sending public reply to ${commentId} via ${url}: "${replyText}"`
  );
  try {
    const response = await axios.post(
      url,
      { message: replyText },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("Public reply sent:", response.data?.id);
    await logAction(
      automation.id,
      accountDbId,
      commenterIgId,
      commentId,
      automation.media_id,
      "public_reply"
    );
    return true;
  } catch (error) {
    console.error(
      "Error sending public reply:",
      error.response?.data ? JSON.stringify(error.response.data) : error.message
    );
    return false;
  }
}

async function sendDirectMessage(
  recipientContext,
  messagePayload,
  accessToken,
  isUserId = false
) {
  const postData = {
    recipient: isUserId
      ? { id: recipientContext }
      : { comment_id: recipientContext },
    message: messagePayload.message,
  };

  // Using graph.instagram.com as requested
  const url = `https://graph.instagram.com/${API_VERSION}/me/messages`;
  console.log(
    `Sending DM via ${url} (isUserId: ${isUserId}):`,
    JSON.stringify(postData)
  );
  try {
    const response = await axios.post(url, postData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
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

// Simplified follow prompt without username references
function constructFollowPrompt(automation, userIgId, sourceId) {
  const text =
    "You're not following us. Please follow to get the YouTube link!";
  const followButtonText = "I've Followed";
  const postbackPayload = `ACTION=RECHECK_FOLLOW&USER=${userIgId}&SOURCE=${sourceId}`;

  return {
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: text,
          buttons: [
            {
              type: "postback",
              title: followButtonText,
              payload: postbackPayload,
            },
          ],
        },
      },
    },
  };
}

// Logging functions
async function logAction(
  automationId,
  accountDbId,
  recipientIgId,
  sourceIgId,
  mediaIgId,
  actionType
) {
  if (!accountDbId || !recipientIgId || !actionType) return;
  console.log(
    `Logging: ${actionType}, AutoID:${
      automationId || "null"
    }, AccID:${accountDbId}, User:${recipientIgId}, Src:${sourceIgId}`
  );
  try {
    const query = `INSERT INTO automation_logs (automation_id, account_id, recipient_ig_id, source_ig_id, media_ig_id, action_type) VALUES ($1, $2, $3, $4, $5, $6)`;
    await pool.query(query, [
      automationId,
      accountDbId,
      recipientIgId,
      sourceIgId || null,
      mediaIgId || null,
      actionType,
    ]);
  } catch (error) {
    console.error("Error logging action:", error);
  }
}

async function countRecentLogs(
  accountDbId,
  recipientIgId,
  sourceIgId,
  actionType
) {
  if (!accountDbId || !recipientIgId || !sourceIgId || !actionType) return 999;
  try {
    const query = `SELECT COUNT(*) FROM automation_logs WHERE account_id = $1 AND recipient_ig_id = $2 AND source_ig_id = $3 AND action_type = $4`;
    const { rows } = await pool.query(query, [
      accountDbId,
      recipientIgId,
      sourceIgId,
      actionType,
    ]);
    return parseInt(rows[0].count, 10);
  } catch (error) {
    console.error("Error counting logs:", error);
    return 999;
  }
}

async function hasSentLog(accountDbId, recipientIgId, sourceIgId, actionType) {
  if (!accountDbId || !recipientIgId || !sourceIgId || !actionType) return true;
  try {
    const query = `SELECT 1 FROM automation_logs WHERE account_id = $1 AND recipient_ig_id = $2 AND source_ig_id = $3 AND action_type = $4 LIMIT 1`;
    const { rows } = await pool.query(query, [
      accountDbId,
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

module.exports = {
  getWebhookController,
  postwebhookHandler,
};
