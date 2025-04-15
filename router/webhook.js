const router = require("express").Router();
const controller = require("../controller/webhook");

router.get("/webhook",controller.getWebhookController);


router.post("/webhook",controller.postwebhookHandler);


module.exports =router;