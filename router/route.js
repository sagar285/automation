const controller = require("../controller/user");
const { pool } = require("../dbmanager");
const router = require("express").Router();
const axios = require("axios");
const authMiddleware = require("../middleware/auth");
const crypto = require("crypto");
const NodeCache = require("node-cache");
const authCache = new NodeCache({ stdTTL: 600 });
const jwt = require("jsonwebtoken");

router.post("/email-signup", controller.email_signup);

router.post("/verify_otp", controller.verify_otp);

router.get("/auth/google/callback", controller.google_callback);

router.get("/auth/google", controller.google_auth);

router.get("/deleteuser/:userId", controller.deleteUserById);

router.get("/getuserinfo", authMiddleware, controller.userProfile);
router.get(
  "/instagram/accounts",
  authMiddleware,
  controller.instagram_accounts
);

// In your Express routes
router.get("/auth/instagram/", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");

  const token = req.cookies.auth_token;
  console.log(token,"token");
 
  // Store user ID in cache with state as key

  // Generate the Instagram OAuth URL
  const clientId = "2901287790027729";
  const redirectUri = "https://insta.fliqr.ai/auth/instagram/callback";
  const scope = [
    "instagram_business_basic",
    "instagram_business_manage_messages",
    "instagram_business_manage_comments",
    "instagram_business_content_publish",
  ].join(",");
  const instagramAuthUrl = `https://www.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=${scope}&state=${token}`;
  res.redirect(instagramAuthUrl);
});

// router.get("/auth/instagram/callback", async (req, res) => {
//   const { code, state } = req.query;

//   console.log(state, "ooooooo");

//   const decoded = jwt.verify(state, process.env.JWT_SECRET);
//   console.log(decoded, "decorddddd");
//   const loginuserId = decoded.userId;
//   const tokenResponse = await axios.post(
//     "https://api.instagram.com/oauth/access_token",
//     new URLSearchParams({
//       client_id: process.env.INSTAGRAM_APP_ID,
//       client_secret: process.env.INSTAGRAM_APP_SECRET,
//       grant_type: "authorization_code",
//       redirect_uri: "https://insta.fliqr.ai/auth/instagram/callback",
//       code: code,
//     }),
//     {
//       headers: {
//         "Content-Type": "application/x-www-form-urlencoded",
//       },
//     }
//   );

//   const shortLivedToken = tokenResponse.data.access_token;
//   const userId = tokenResponse.data.user_id;

//   const longLivedResponse = await axios.get(
//     "https://graph.instagram.com/access_token",
//     {
//       params: {
//         grant_type: "ig_exchange_token",
//         client_secret: process.env.INSTAGRAM_APP_SECRET,
//         access_token: shortLivedToken,
//       },
//     }
//   );

//   const longLivedToken = longLivedResponse.data.access_token;
//   const expiresIn = longLivedResponse.data.expires_in;

//   const expirationDate = new Date();
//   expirationDate.setSeconds(expirationDate.getSeconds() + expiresIn);

//   await pool.query(
//     `INSERT INTO accounts
//     (user_id, instagram_id, access_token, token_expires_at)
//      VALUES ($1, $2, $3, $4)`,
//     [loginuserId, userId, longLivedToken, expirationDate]
//   );

//   try {
//     // Exchange code for access token
//     // Save the Instagram account to the user's profile
//     // Redirect back to the frontend

//     res.redirect(`${process.env.FRONTEND_URL}/createAutomation`);
//   } catch (error) {
//     res.redirect(
//       `${process.env.FRONTEND_URL}/instagram/error?message=${encodeURIComponent(
//         error.message
//       )}`
//     );
//   }
// });

router.get("/auth/instagram/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
   console.log(state)
   console.log(state,process.env.JWT_SECRET)
    // Decode state to get user ID
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    const loginUserId = decoded.userId;

    console.log("login user id",loginUserId,decoded);

    // Exchange code for short-lived token
    const tokenResponse = await axios.post(
      "https://api.instagram.com/oauth/access_token",
      new URLSearchParams({
        client_id: process.env.INSTAGRAM_APP_ID,
        client_secret: process.env.INSTAGRAM_APP_SECRET,
        grant_type: "authorization_code",
        redirect_uri: "https://insta.fliqr.ai/auth/instagram/callback",
        code: code,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const shortLivedToken = tokenResponse.data.access_token;
    const instagramId = tokenResponse.data.user_id;

    // Exchange for long-lived token
    const longLivedResponse = await axios.get(
      "https://graph.instagram.com/access_token",
      {
        params: {
          grant_type: "ig_exchange_token",
          client_secret: process.env.INSTAGRAM_APP_SECRET,
          access_token: shortLivedToken,
        },
      }
    );

    const longLivedToken = longLivedResponse.data.access_token;
    const expiresIn = longLivedResponse.data.expires_in;

    const expirationDate = new Date();
    expirationDate.setSeconds(expirationDate.getSeconds() + expiresIn);
    const tokenUpdatedAt = new Date();

    // First, check if account already exists
    const accountResult = await pool.query(
      "SELECT id FROM accounts WHERE instagram_id = $1",
      [instagramId]
    );

    let accountId;

    if (accountResult.rows.length > 0) {
      // Account exists, update it
      accountId = accountResult.rows[0].id;

      await pool.query(
        `UPDATE accounts 
         SET access_token = $1, 
             token_expires_at = $2, 
             token_updated_at = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [longLivedToken, expirationDate, tokenUpdatedAt, accountId]
      );
    } else {
      // Account doesn't exist, insert it
      const insertResult = await pool.query(
        `INSERT INTO accounts 
         (instagram_id, access_token, token_expires_at, token_updated_at)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [instagramId, longLivedToken, expirationDate, tokenUpdatedAt]
      );

      accountId = insertResult.rows[0].id;
    }

    // Check if admin relationship already exists
    const adminResult = await pool.query(
      "SELECT id FROM account_admins WHERE user_id = $1 AND account_id = $2",
      [loginUserId, accountId]
    );

    if (adminResult.rows.length === 0) {
      // Insert into account_admins
      await pool.query(
        `INSERT INTO account_admins 
         (user_id, account_id, role, added_at)
         VALUES ($1, $2, $3, NOW())`,
        [loginUserId, accountId, "admin"]
      );
    }

    // Redirect to frontend
    res.redirect(`${process.env.FRONTEND_URL}/createAutomation`);
  } catch (error) {
    console.error("Error in Instagram callback:", error);
    res.redirect(
      `${process.env.FRONTEND_URL}/instagram/error?message=${encodeURIComponent(
        error.message || "An unknown error occurred"
      )}`
    );
  }
});

module.exports = router;
