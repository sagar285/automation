const controller = require("../controller/user");
const {pool} = require("../dbmanager")
const router = require("express").Router();
const axios = require("axios");
const authMiddleware = require("../middleware/auth");

router.post("/email-signup",controller.email_signup);


router.post("/verify_otp",controller.verify_otp)

router.get("/auth/google/callback",controller.google_callback)

router.get("/auth/google", controller.google_auth);


router.get("/deleteuser/:userId", controller.deleteUserById);


router.get("/getuserinfo",authMiddleware,controller.userProfile);

// In your Express routes
router.get('/auth/instagram/:id', (req, res) => {

  const currentUserId = req.params.id;
  const state = Buffer.from(JSON.stringify({ userId: currentUserId })).toString('base64');
    // Generate the Instagram OAuth URL
    const clientId = "2901287790027729"
    const redirectUri ="https://insta.fliqr.ai/auth/instagram/callback"
    const scope = [
        'instagram_business_basic',
        'instagram_business_manage_messages',
        'instagram_business_manage_comments',
        'instagram_business_content_publish'
      ].join(',');
      const instagramAuthUrl = `https://www.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}`;
    res.redirect(instagramAuthUrl);
  });
  
  router.get('/auth/instagram/callback', async (req, res) => {
    const { code,state } = req.query;

    console.log(code,"codeeddd");
    let decodedState = {};
    try {
      decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (e) {
      throw new Error('Invalid state parameter');
    }
    
    const currentuserid = decodedState.userId;
    if (!currentuserid) {
      throw new Error('User ID not found in state');
    }


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

      await pool.query(
        'INSERT INTO instagram_accounts (user_id, account_id, access_token, token_expires_at) VALUES ($1, $2, $3, $4)',
        [currentuserid, userId, longLivedToken, expirationDate]
      );


    
    try {
      // Exchange code for access token
      // Save the Instagram account to the user's profile
      // Redirect back to the frontend
      res.redirect(`${process.env.FRONTEND_URL}/createAutomation`)
    } catch (error) {
      res.redirect(`${process.env.FRONTEND_URL}/instagram/error?message=${encodeURIComponent(error.message)}`);
    }
  });





  



module.exports = router;



