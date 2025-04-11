const { generateOTP, sendOTPEmail, verifyOTP } = require("../email-sender");
const { pool } = require("../dbmanager");
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
// Initialize the Google OAuth client
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID; // Your client ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET; // Your client secret
const REDIRECT_URL = `${process.env.API_URL}/auth/google/callback`;
const axios =require("axios");
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
    
    // Send OTP to email
    const { success, otp, error } = await sendOTPEmail(email, generatedOTP);
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
      // Create new user
      const newUserResult = await pool.query(
        'INSERT INTO users (email, provider, is_verified, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING id',
        [email, 'email', true]
      );
      userId = newUserResult.rows[0].id;
    } else {
      // Update existing user
      userId = userResult.rows[0].id;
      await pool.query(
        'UPDATE users SET is_verified = TRUE, last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [userId]
      );
    }
    
    // Generate JWT token
   
    const token = jwt.sign(
      { userId, email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );
    
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
      // Create new user
      const newUserResult = await pool.query(
        'INSERT INTO users (email, full_name, profile_picture, provider, provider_user_id, is_verified, created_at) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) RETURNING id',
        [email, name, picture, 'google', googleId, true]
      );
      userId = newUserResult.rows[0].id;
    } else {
      // Update existing user if needed
      userId = userResult.rows[0].id;
      await pool.query(
        'UPDATE users SET full_name = $1, profile_picture = $2, provider = $3, provider_user_id = $4, is_verified = TRUE, last_login = CURRENT_TIMESTAMP WHERE id = $5',
        [name, picture, 'google', googleId, userId]
      );
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId, email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );
    
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
  google_auth,
  google_callback,
    email_signup,
    verify_otp,
    deleteUserById
}
