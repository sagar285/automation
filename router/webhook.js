const router = require("express").Router();
const controller = require("../controller/webhook");
const authMiddleware = require("../middleware/auth");

router.get("/webhook",controller.getWebhookController);


router.post("/webhook",authMiddleware,controller.postwebhookHandler);


module.exports =router;