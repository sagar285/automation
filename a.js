const crypto = require('crypto');
const axios = require('axios');
const { Pool, types } = require('pg'); // Import Pool from pg
const dotenv = require('dotenv');

// --- Database Configuration ---
dotenv.config();
types.setTypeParser(types.builtins.INT8, (val) => val);
types.setTypeParser(types.builtins.NUMERIC, (val) => val);
const pool = new Pool({ /* ... connection details ... */ });
pool.connect() /* ... connection test ... */ ;
// --- End Database Configuration ---


// --- Middleware for Webhook Verification ---
const verifyWebhookSignature = (req, res, next) => {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
        console.warn('Webhook signature missing!');
        return res.sendStatus(400); // Bad Request
    }
    // Ensure rawBody is available (requires express.raw() or similar in router setup)
    if (!req.rawBody) {
        console.error("Raw request body is required for signature verification.");
        return res.sendStatus(500); // Server configuration error
    }

    try {
        const expectedSignature = 'sha256=' + crypto
            .createHmac('sha256', process.env.INSTAGRAM_APP_SECRET)
            .update(req.rawBody, 'utf-8') // Use the raw body buffer/string
            .digest('hex');

        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
            console.warn('Invalid webhook signature.');
            return res.sendStatus(403); // Forbidden - signature mismatch
        }

        // Signature is valid, proceed to the next middleware (which should be express.json())
        console.log("Webhook signature verified successfully.");
        next();

    } catch (error) {
        console.error('Error during signature verification:', error);
        // Send 200 OK even on internal error to prevent webhook disabling, but log it.
        res.sendStatus(200);
    }
};

// --- GET Handler for Subscription ---
const getWebhookController = async (req, res) => {
    // (Implementation remains the same)
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

// --- POST Handler for Incoming Webhook Events ---
const postwebhookHandler = async (req, res) => {
    // Now we expect req.body to be a parsed object thanks to express.json() in the route
    console.log("Webhook POST received (Parsed Body):", JSON.stringify(req.body, null, 2));
    try {
        // Check if body is an object and has the entry array
        if (typeof req.body !== 'object' || req.body === null || !Array.isArray(req.body.entry)) {
             console.warn("Webhook body missing 'entry' array or not an object after parsing.");
             return res.sendStatus(200); // Acknowledge, but invalid format
        }

        for (const entry of req.body.entry) {
            const recipientIgId = entry.id; // IGSID of *your* page/account that received event

            if (!recipientIgId) {
                console.warn("Webhook entry missing recipient ID (entry.id). Skipping entry.");
                continue;
            }

            // Process Comments if 'changes' field exists
            if (entry.changes && Array.isArray(entry.changes)) {
                for (const change of entry.changes) {
                    if (change.field === 'comments' && change.value) {
                        await processCommentEvent(change.value, recipientIgId);
                    }
                    // Add handlers for other 'changes' like mentions if needed
                }
            }

            // Process Direct Messages if 'messaging' field exists
            if (entry.messaging && Array.isArray(entry.messaging)) {
                for (const messageEvent of entry.messaging) {
                     if (messageEvent.message && !messageEvent.message.is_echo) {
                        await processDirectMessageEvent(messageEvent, recipientIgId);
                    }
                     // Add handlers for postbacks, quick_reply taps, etc.
                     else if (messageEvent.postback) {
                         await processPostbackEvent(messageEvent, recipientIgId);
                     }
                }
            }
        } // End for entry loop
        res.sendStatus(200); // Acknowledge receipt

    } catch (error) {
        console.error("Error processing webhook:", error);
        res.sendStatus(200); // Still send 200 OK to prevent webhook disabling
    }
};

// ===========================================
// Event Processors & Utility Functions
// (Implementations for processCommentEvent, processDirectMessageEvent, processPostbackEvent,
// checkKeywords, checkFollowerStatus, handlePublicReply, sendDirectMessage,
// logAction, countRecentLogs, hasSentLog, constructFollowPrompt, constructDmContent
// remain the same as the previous complete example)
// ===========================================

// --- Export Handlers ---
module.exports = {
    getWebhookController,
    postwebhookHandler,
    verifyWebhookSignature
    // Export other functions if needed elsewhere, otherwise keep them internal
};
