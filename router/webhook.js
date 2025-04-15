const express = require("express");
const router = require("express").Router();
const controller = require("../controller/webhook");


const rawBodySaver = (req, res, buf, encoding) => {
    if (buf && buf.length) {
      // Store the raw buffer or string on the request object
      // The 'verifyWebhookSignature' middleware will expect 'req.rawBody'
      req.rawBody = buf;
    }
  };

router.get("/webhook",controller.getWebhookController);


router.post(
    "/webhook",
    // 1. Use express.raw() to make the raw body available BEFORE JSON parsing
    //    Only apply to application/json content type
    // 3. If signature is valid, process the event (body should be parsed now if needed)
    controller.postwebhookHandler
);


module.exports =router;