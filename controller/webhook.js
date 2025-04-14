const { pool } = require("../dbmanager");

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
      req.body.entry[0].changes[0].value,
      req.body.entry[0].changes[0].value.from,
      req.body.entry[0].changes[0].value.media
    );

    const mediaId = req.body.entry[0].changes[0].value.media.id;
    const query = `
    SELECT a.*
    FROM automations a
    WHERE a.media_id = $1
    `;
    const { rows } = await pool.query(query, [mediaId]);
    console.log(rows, "pppppp");

    // Process the webhook event here
    res.sendStatus(200);
  } catch (error) {
    console.log(error, "uuuuuuuuuuuu");
  }
};

module.exports = {
  getWebhookController,
  postwebhookHandler,
};
