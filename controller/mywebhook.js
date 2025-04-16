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

const postwebhookHandler = async (req, res) => {
  console.log("Webhook event received:", JSON.stringify(req.body, null, 2));

  // --- SECURITY WARNING ---
  // This handler is MISSING webhook signature verification (X-Hub-Signature).
  // You MUST implement this before production to ensure requests are from Instagram.
  // See previous examples for 'verifyWebhookSignature' middleware.
  // --- END WARNING ---

  try {
    var accessToken;
    var entryId = req.body.entry[0].id
    const accountQuery = `
    SELECT id as account_db_id, access_token
    FROM accounts
    WHERE user_insta_business_id = $1 AND is_active = TRUE
    LIMIT 1`;
     const { rows } = await pool.query(accountQuery, [entryId]);
     if (rows.length === 0) {
      console.log(`No active account found for business ID ${recipientIgId}. Webhook ignored for this entry.`);
      // We still send 200 OK later, just don't process this entry further.
      // Skip to the next entry
  }
  accessToken =rows[0].access_token


    // Check if the event is for comments ('changes' field)
    if (req.body.entry && req.body.entry[0] && req.body.entry[0].changes) {
      for (const change of req.body.entry[0].changes) {
        if (change.field === "comments") {
          const commentData = change.value;
          const mediaId = commentData.media?.id;
          const commentId = commentData.id;
          const commentText = commentData.text?.toLowerCase() || ""; // Normalize text

          if (!mediaId || !commentId || !commentText) {
            console.log(
              "Incomplete comment data in change, skipping this change."
            );
            continue; // Move to the next change if essential data is missing
          }

          console.log(
            `Processing comment ${commentId} on media ${mediaId} with text: "${commentData.text}"`
          );

          // Query for automations matching ONLY this specific media_id
          // WARNING: This ignores account context and universal automations.
          const query = `
                        SELECT a.*, acc.access_token
                        FROM automations a
                        INNER JOIN accounts acc ON a.account_id = acc.id
                        WHERE a.media_id = $1 AND a.is_active = TRUE
                        LIMIT 1; -- Assuming only one specific automation per media ID
                    `;
          const { rows } = await pool.query(query, [mediaId]);

          if (rows.length > 0) {
            const automation = rows[0];
            const keywords = automation.keywords || []; // Default to empty array
            accessToken = automation.access_token;
            const dmMessageToSend =
              automation.dm_message || "Thanks for your comment!"; // Use stored message or default

            console.log(
              `Found automation ${automation.id} for media ${mediaId}. Checking keywords:`,
              keywords
            );

            let keywordMatched = false;
            for (const keyword of keywords) {
              // Using case-insensitive 'includes' check
              if (commentText.includes(keyword.toLowerCase())) {
                console.log(`Keyword "${keyword}" matched in comment text.`);
                keywordMatched = true;
                break; // Stop checking once a keyword matches
              }
            }

            if (keywordMatched) {
              // Keyword matched, proceed to send DM and auto replies

              try {
                const response = await axios.post(
                  `https://graph.instagram.com/v22.0/${commentId}/replies`, // Use /me context
                  { message: "bake samosa kaeo" },
                  {
                    headers: {
                      Authorization: `Bearer ${accessToken}`,
                      "Content-Type": "application/json",
                    },
                  }
                );
              } catch (error) {
                console.log(error, "error in quick replies");
              }

              const postData = {
                recipient: {
                  comment_id: commentId, // Target the specific comment
                },
                message: {
                  text: dmMessageToSend, // Use the message from the automation record
                },
              };

              console.log("Attempting to send DM:", JSON.stringify(postData));

              try {
                const response = await axios.post(
                  "https://graph.instagram.com/v22.0/me/messages", // Use /me context
                  postData,
                  {
                    headers: {
                      Authorization: `Bearer ${accessToken}`,
                      "Content-Type": "application/json",
                    },
                  }
                );
                console.log("DM sent successfully:", response.data);
                // OPTIONAL: Log this action to your automation_logs table if you implement it
                // await logAction(automation.id, automation.account_id, commentData.from?.id, commentId, mediaId, 'dm_sent');
              } catch (axiosError) {
                console.error(
                  "Error sending DM:",
                  axiosError.response?.data || axiosError.message
                );
                // Handle specific errors if needed (e.g., token expired, permissions)
              }
            } else {
              console.log("No keywords matched for this comment.");
            }
          } else {
            console.log(
              `No active automation found specifically for media ID: ${mediaId}`
            );
          }
        } // End if change.field === 'comments'
      } // End for loop changes
    } else {
      console.log(
        "Webhook received, but no 'changes' field found in entry[0]. Ignoring (Might be DM or other event)."
      );
      if (req.body.entry[0].messaging) {
        const senderId = req.body.entry[0].messaging[0].sender.id;
        try {
          const response = await axios.get(
            `https://graph.instagram.com/v21.0/${senderId}`,
            {
              params: {
                fields:
                  "name,profile_pic,username,follower_count,is_business_follow_user,is_user_follow_business,is_verified_user",
                access_token: accessToken,
              },
            }
          );

          console.log("User info retrieved successfully:", response.data);
          if (response.data.is_user_follow_business) {
            try {
              const postData = {
                recipient: {
                  id: senderId, // Target the specific user
                },
                message: {
                  text: dmMessageToSend, // Use the message from the automation record
                },
              };
              const response = await axios.post(
                "https://graph.instagram.com/v22.0/me/messages", // Use /me context
                postData,
                {
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                  },
                }
              );
            } catch (error) {
              console.log(error, "error in sending messages replies");
            }
          } else {
            try {
              const postData = {
                recipient: {
                  id: senderId, // Target the specific user
                },
                message: {
                  attachment: {
                    type: "template",
                    payload: {
                      template_type: "button",
                      text: "You're not following ur,once you follow then only i will send you the link!",
                      buttons: [
                        {
                          type: "web_url",
                          url: "https://www.google.com",
                          title: "googlelink",
                        },
                        {
                          type: "postback",
                          PAYLOAD: "",
                          title: "Yes i followed",
                        },
                      ],
                    },
                  },
                },
              };
              const response = await axios.post(
                "https://graph.instagram.com/v22.0/me/messages", // Use /me context
                postData,
                {
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                  },
                }
              );
            } catch (error) {
              console.log(error, "error in sending messages replies");
            }
          }
        } catch (error) {
          console.error(
            "Error retrieving Instagram user info:",
            error.response?.data || error.message
          );
          throw error;
        }
      }

      // Add logic here later to handle 'messaging' events if needed
    }

    // Always acknowledge the webhook quickly
    res.sendStatus(200);
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.sendStatus(500); // Internal Server Error
  }
};

module.exports = {
  getWebhookController,
  postwebhookHandler,
};
