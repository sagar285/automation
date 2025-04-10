const controller = require("../controller/user");

const router = require("express").Router();

router.post("/email-signup",controller.email_signup);


router.post("/verify_otp",controller.verify_otp)

router.get("/auth/google/callback",controller.google_callback)

router.get("/auth/google", controller.google_auth);

// In your Express routes
router.get('/auth/instagram', (req, res) => {
    // Generate the Instagram OAuth URL
    const INSTAGRAM_APP_ID = "2901287790027729"
    const INSTAGRAM_REDIRECT_URI ="https://insta.fliqr.ai/auth/instagram/callback"
    const scope = [
        'instagram_business_basic',
        'instagram_business_manage_messages',
        'instagram_business_manage_comments',
        'instagram_business_content_publish'
      ].join(',');
      const instagramAuthUrl = `https://www.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}`;
    res.redirect(instagramAuthUrl);
  });
  
  router.get('/auth/instagram/callback', async (req, res) => {
    const { code } = req.query;

    console.log(code,"codeeddd");
    
    try {
      // Exchange code for access token
      // Save the Instagram account to the user's profile
      // Redirect back to the frontend
      res.redirect(`${process.env.FRONTEND_URL}/instagram/success`);
    } catch (error) {
      res.redirect(`${process.env.FRONTEND_URL}/instagram/error?message=${encodeURIComponent(error.message)}`);
    }
  });





  



module.exports = router;



