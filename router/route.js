const controller = require("../controller/user");
const {pool} = require("../dbmanager")
const router = require("express").Router();
const axios = require("axios");
const authMiddleware = require("../middleware/auth");
const crypto = require("crypto");
const NodeCache = require('node-cache');
const authCache = new NodeCache({ stdTTL: 600 });
const jwt = require('jsonwebtoken');

router.post("/email-signup",controller.email_signup);


router.post("/verify_otp",controller.verify_otp)

router.get("/auth/google/callback",controller.google_callback)

router.get("/auth/google", controller.google_auth);


router.get("/deleteuser/:userId", controller.deleteUserById);

router.get("/getuserinfo",authMiddleware,controller.userProfile)

// In your Express routes
router.get('/auth/instagram/',(req, res) => {
 
  const state = crypto.randomBytes(16).toString('hex');

  const token =req.cookies.auth_token

   // Store user ID in cache with state as key

    // Generate the Instagram OAuth URL
    const clientId = "2901287790027729"
    const redirectUri ="https://insta.fliqr.ai/auth/instagram/callback"
    const scope = [
        'instagram_business_basic',
        'instagram_business_manage_messages',
        'instagram_business_manage_comments',
        'instagram_business_content_publish'
      ].join(',');
      const instagramAuthUrl = `https://www.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${token}`;
    res.redirect(instagramAuthUrl);
  });
  
  router.get('/auth/instagram/callback', async (req, res) => {
    const { code,state } = req.query;

     console.log(state,"ooooooo");

     const decoded = jwt.verify(state, process.env.JWT_SECRET);
    console.log(decoded,"decorddddd");
    //  const userId = req.user.userId;
    const tokenResponse = await axios.post('https://api.instagram.com/oauth/access_token', 
        new URLSearchParams({
          client_id: process.env.INSTAGRAM_APP_ID,
          client_secret: process.env.INSTAGRAM_APP_SECRET,
          grant_type: 'authorization_code',
          redirect_uri: 'https://insta.fliqr.ai/auth/instagram/callback',
          code: code
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      const shortLivedToken = tokenResponse.data.access_token;
      const userId = tokenResponse.data.user_id;

      const longLivedResponse = await axios.get('https://graph.instagram.com/access_token', {
        params: {
          grant_type: 'ig_exchange_token',
          client_secret: process.env.INSTAGRAM_APP_SECRET,
          access_token: shortLivedToken 
        }
      });
      
      const longLivedToken = longLivedResponse.data.access_token;
      const expiresIn = longLivedResponse.data.expires_in;

      const expirationDate = new Date();
      expirationDate.setSeconds(expirationDate.getSeconds() + expiresIn);

     


    
    try {
      // Exchange code for access token
      // Save the Instagram account to the user's profile
      // Redirect back to the frontend
      //  await pool.query(
      //   'INSERT INTO instagram_accounts (user_id, account_id, access_token, token_expires_at) VALUES ($1, $2, $3, $4)',
      //   [currentUserId, userId, longLivedToken, expirationDate]
      // );
      res.redirect(`${process.env.FRONTEND_URL}/createAutomation`)
    } catch (error) {
      res.redirect(`${process.env.FRONTEND_URL}/instagram/error?message=${encodeURIComponent(error.message)}`);
    }
  });





  



module.exports = router;



