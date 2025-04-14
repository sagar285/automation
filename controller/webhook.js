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

// // Verification endpoint
// app.get('/webhook', (req, res) => {

// });

// // Webhook event handler
// app.post('/webhook', (req, res) => {

// });

// post webhook event handler

const postwebhookHandler = async (req, res) => {
  try {
    console.log(
      "Webhook event received:",
      req.body,
      req.body.entry,
      req.body.entry[0].changes,
    );

    const mediaId = req.body.entry[0].changes[0].value.media.id;
    const query = `
      SELECT a.*, acc.access_token
      FROM automations a
      INNER JOIN accounts acc ON a.account_id = acc.id
      WHERE a.media_id = $1
      `;
    const { rows } = await pool.query(query, [mediaId]);
    console.log(rows, "pppppp");

    if (rows.length > 0) {
      const automation = rows[0];
      const keywords = automation.keywords;
      const accessToken = automation.access_token;

      for (let word of keywords) {
        if (word === req.body.entry[0].changes[0].value.text) {
          // Your code here
          const postData = {
            recipient: {
                comment_id: req.body.entry[0].changes[0].value.id,
            },
            message: {
              text: `You commented this keyword: ${word}`,
            },
          };

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

            console.log("Message sent successfully:", response.data);
          } catch (axiosError) {
            console.error(
              "Error sending message:",
              axiosError.response?.data || axiosError.message
            );
          }
        }
      }
    } else {
      console.log("No matching automation found for this media ID");
    }

    // Process the webhook event here
    res.sendStatus(200);
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.sendStatus(500);
  }
};

module.exports = {
  getWebhookController,
  postwebhookHandler,
};
