const router = require("express").Router();
const controller = require("../controller/mywebhook");
const authMiddleware = require("../middleware/auth");

router.get("/webhook",controller.getWebhookController);


router.post("/webhook",controller.postwebhookHandler);


module.exports =router;