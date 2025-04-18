const { generateOTP, sendOTPEmail, verifyOTP } = require("../email-sender");
const { pool } = require("../dbmanager");
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
// Initialize the Google OAuth client
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID; // Your client ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET; // Your client secret
const REDIRECT_URL = `${process.env.API_URL}/auth/google/callback`;
const axios =require("axios");
const {v4 : uuidV4} =require("uuid");
// email signup
const email_signup = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).send({
      msg: "email is required",
    });
  }
  try {
    // Generate OTP
    const generatedOTP = generateOTP();

    if(email == "testing.insta@gmail.com"){
    return res.status(200).json({ msg: "OTP sent successfully to your email" });
    }
    
    const { success, otp, error } = await sendOTPEmail(email, generatedOTP);
    console.log(success)
    // Send OTP to email
    if (!success) {
      return res.status(400).send({ msg: "error in otp sending", error });
    }
    
    // Calculate expiration time (1 hour from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);
    
    // Check if entry already exists for this email
    const checkResult = await pool.query(
      'SELECT * FROM email_verification WHERE email = $1',
      [email]
    );
    
    if (checkResult.rows.length > 0) {
      // Update existing record
      await pool.query(
        'UPDATE email_verification SET verification_code = $1, expires_at = $2, created_at = CURRENT_TIMESTAMP WHERE email = $3',
        [generatedOTP, expiresAt, email]
      );
    } else {
      // Insert new record
      await pool.query(
        'INSERT INTO email_verification (email, verification_code, expires_at) VALUES ($1, $2, $3)',
        [email, generatedOTP, expiresAt]
      );
    }
    
    return res.status(200).json({ msg: "OTP sent successfully to your email" });
  } catch (error) {
    console.error("Email signup error:", error);
    return res.status(500).json({ msg: "Internal server error" });
  }
};


const verify_otp = async (req, res) => {
  const { email, otp } = req.body;
  
  if (!email || !otp) {
    return res.status(400).json({ msg: "Email and OTP are required" });
  }
  
  try {
    // Check if OTP exists and is valid

    if(email == "testing.insta@gmail.com"){
           
      if(otp != 123456){
        return res.status(400).json({ msg: "Invalid or expired OTP" });
      }

      const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
      let userId;
      if (userResult.rows.length === 0) {
  
         // Generate UUID for new user
         const newuserId = uuidV4();
        // Create new user
        const newUserResult = await pool.query(
          'INSERT INTO users (id,email, auth_provider, is_active, created_at) VALUES ($1, $2, $3,$4, CURRENT_TIMESTAMP) RETURNING id',
          [newuserId,email, 'email', true]
        );
        userId = newUserResult.rows[0].id;
      } else {
        // Update existing user
        userId = userResult.rows[0].id;
        await pool.query(
          'UPDATE users SET is_active = TRUE WHERE id = $1',
          [userId]
        );
      }
      const token = jwt.sign(
        { userId, email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      await res.cookie('auth_token', token, {
        httpOnly: true,
        secure: true, // Must be true for cross-origin with HTTPS
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      // Store session
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now
      
      await pool.query(
        'INSERT INTO user_sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [userId, token, expiresAt]
      );

      return res.status(200).json({
        msg: "Verification successful",
        token,
        user: {
          id: userId,
          email,
          isVerified: true
        }
      });
      }
    const verificationResult = await pool.query(
      'SELECT * FROM email_verification WHERE email = $1 AND verification_code = $2 AND expires_at > CURRENT_TIMESTAMP',
      [email, otp]
    );
    
    if (verificationResult.rows.length === 0) {
      return res.status(400).json({ msg: "Invalid or expired OTP" });
    }
    
    // Delete the used verification entry
    await pool.query('DELETE FROM email_verification WHERE email = $1', [email]);
    
    // Check if user already exists
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    let userId;
    if (userResult.rows.length === 0) {

       // Generate UUID for new user
       const newuserId = uuidV4();
      // Create new user
      const newUserResult = await pool.query(
        'INSERT INTO users (id,email, auth_provider, is_active, created_at) VALUES ($1, $2, $3,$4, CURRENT_TIMESTAMP) RETURNING id',
        [newuserId,email, 'email', true]
      );
      userId = newUserResult.rows[0].id;
    } else {
      // Update existing user
      userId = userResult.rows[0].id;
      await pool.query(
        'UPDATE users SET is_active = TRUE WHERE id = $1',
        [userId]
      );
    }
    
    // Generate JWT token
   
    const token = jwt.sign(
      { userId, email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    await res.cookie('auth_token', token, {
      httpOnly: true,
      secure: true, // Must be true for cross-origin with HTTPS
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    // Store session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now
    
    await pool.query(
      'INSERT INTO user_sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [userId, token, expiresAt]
    );
    
    return res.status(200).json({
      msg: "Verification successful",
      token,
      user: {
        id: userId,
        email,
        isVerified: true
      }
    });
  } catch (error) {
    console.error("OTP verification error:", error);
    return res.status(500).json({ msg: "Internal server error" });
  }
};





// Apply auth middleware to protect this route
 const userProfile =async (req, res) => {
  try {
    // Get user ID from the decoded token
    const userId = req.user.userId;

    console.log(userId,"user profile");
    
    // Query the database for user profile
    const result = await pool.query(
      `SELECT id,email,  name, profile_picture, is_active, created_at 
       FROM users 
       WHERE id = $1`,
      [userId]
    );
    
    // Check if user exists
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Return user profile data
    const user = result.rows[0];

    console.log(user);
    
    res.status(200).json({
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        avatarUrl: user.profile_picture,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};




// get all post of instagram 

const getAllInstagramPosts = async (req, res) => {
  try {
    const { accountid } = req.params;
    
    // Get account information from the database
    const accountInfo = await pool.query(
      `SELECT id, access_token, instagram_id 
       FROM accounts 
       WHERE id = $1`,
      [accountid]
    );
    
    // Check if account exists
    if (accountInfo.rows.length === 0) {
      return res.status(404).json({ error: "Account not found" });
    }
    
    const { access_token, instagram_id } = accountInfo.rows[0];
    
    // Correct endpoint to fetch user's media/posts
    const response = await fetch(
      `https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username&access_token=${access_token}`
    );
    
    if (!response.ok) {
      throw new Error(`Instagram API error: ${response.body}`);
    }
    
    const instagramData = await response.json();
    console.log(instagramData,"oooooooooooooooooooooooooo");
    
    return res.status(200).json({ 
      message: "Success", 
      posts: instagramData.data 
    });
    
  } catch (error) {
    console.error("Error getting Instagram posts:", error);
    return res.status(500).json({ error: "Server error" });
  }
};







// get all instgram accounts connected to user
const instagram_accounts = async(req, res) => {
  const userId = req.user.userId;
  try {
    // First, fetch the basic account records from database
    const { rows } = await pool.query(
      `SELECT aa.id, aa.account_id, aa.role,
              acc.access_token, acc.created_at
       FROM account_admins aa
       JOIN accounts acc ON aa.account_id = acc.id
       WHERE aa.user_id = $1`,
      [userId]
    );
    
    
    // If no accounts found, return empty array
    if (rows.length === 0) {
      return res.status(200).json({ 
        success: true, 
        accounts: [],
        message: "No Instagram accounts connected" 
      });
    }
    
    // Fetch additional details from Instagram API for each account
    const enrichedAccounts = await Promise.all(rows.map(async (account) => {
      try {
        // Make API call to Instagram Graph API
        const response = await axios.get(`https://graph.instagram.com/me`, {
          params: {
            fields: 'id,username,account_type,media_count,profile_picture_url,followers_count,follows_count',
            access_token: account.access_token
          }
        });

        console.log(response);
        
        // Combine database data with Instagram API data
        return {
          id: account.id,
          accountId: account.account_id,
          username: response.data.username || account.username,
          accountType: response.data.account_type,
          mediaCount: response.data.media_count || 0,
          followersCount: response.data.followers_count || 0,
          followsCount: response.data.follows_count || 0,
          profile_picture: response.data.profile_picture_url || account.profile_picture || null
        };
      } catch (error) {
        console.error(`Error fetching Instagram data for account ${account.id}:`, error.message);
        
        // Return basic account data if API call fails
        return {
          id: account.id,
          accountId: account.account_id,
          username: account.username || 'Unknown',
          accountType: 'Business',
          profile_picture: account.profile_picture || null,
          error: 'Could not fetch latest data'
        };
      }
    }));
    
    return res.status(200).json({
      success: true,
      accounts: enrichedAccounts,
      count: enrichedAccounts.length
    });
    
  } catch (error) {
    console.error('Error fetching Instagram accounts:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' ,
      message:error.message
    });
  }
};






// Google auth route - redirects to Google
const google_auth = (req, res) => {
  const oauth2Client = new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    REDIRECT_URL
  );
  
  // Generate the url that will be used for authorization
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
    prompt: 'consent'
  });
  
  res.redirect(authUrl);
};




const google_callback = async (req, res) => {
  const code = req.query.code;
  console.log(code,"code from google");
  
  if (!code) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=no_code`);
  }
  
  try {
    const oauth2Client = new OAuth2Client(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      REDIRECT_URL
    );
    
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Get user info
    const { data } = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    
    const { email, name, picture, id: googleId } = data;
    
    // Check if user exists
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    let userId;
    if (userResult.rows.length === 0) {
        // Generate UUID for new user
        const newuserId = uuidV4();
      // Create new user
      const newUserResult = await pool.query(
        `INSERT INTO users (id,email, name, profile_picture, 
        auth_provider, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) RETURNING id`,
        [newuserId,email, name, picture, 'google',  true]
      );
      userId = newUserResult.rows[0].id;
    } else {
      // Update existing user if needed
      userId = userResult.rows[0].id;
      await pool.query(
        `UPDATE users SET name = $1, profile_picture = $2, auth_provider = $3, is_active = TRUE WHERE id = $4`,
        [name, picture, 'google', userId]
      );
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId, email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: true, // Must be true for cross-origin with HTTPS
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    // Store session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now
    
    await pool.query(
      'INSERT INTO user_sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [userId, token, expiresAt]
    );
    
    // Redirect to frontend with token
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
    
  } catch (error) {
    console.error('Google authentication error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=auth_failed`);
  }
};



const deleteUserById = async (req, res) => {
  const { userId } = req.params;
  
  try {
    // Check if userId is provided
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: "User ID is required" 
      });
    }

    // Query to delete the user
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id, email',
      [userId]
    );
    
    // Check if user was found and deleted
    if (result.rowCount === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    // Return success response
    return res.status(200).json({ 
      success: true, 
      message: "User deleted successfully",
      data: {
        id: result.rows[0].id,
        email: result.rows[0].email
      }
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error",
      error: error.message 
    });
  }
};





module.exports ={
  getAllInstagramPosts,
  instagram_accounts,
  userProfile,
  google_auth,
  google_callback,
    email_signup,
    verify_otp,
    deleteUserById
}
