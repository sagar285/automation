// utils/email-sender.js
const nodemailer = require("nodemailer");
const dotenv = require("dotenv");

dotenv.config();

// Configure nodemailer with environment variables
const transporter = nodemailer.createTransport(
    {
        service:"gmail",
        port:587,
        secure:false,
        requireTLS:true,
        auth:{
            user:"gtest3681@gmail.com",
            pass:"jbiwkldgooalvtgj"
        }
    }
);

/**
 * Generate a random OTP code
 * @param {number} length - Length of OTP (default: 6)
 * @returns {string} - Generated OTP code
 */
function generateOTP(length = 6) {
  const digits = "0123456789";
  let OTP = "";

  for (let i = 0; i < length; i++) {
    OTP += digits[Math.floor(Math.random() * 10)];
  }

  return OTP;
}

/**
 * Send OTP verification email
 * @param {string} email - Recipient email address
 * @param {string} [otp=null] - Optional custom OTP (if not provided, one will be generated)
 * @returns {Promise<{success: boolean, otp: string, error: any}>} - Result with OTP or error
 */
async function sendOTPEmail(email, otp = null) {
  try {
    // Validate email
    if (!email || !email.includes("@")) {
      throw new Error("Invalid email address");
    }

    // Generate OTP if not provided
    const verificationCode = otp || generateOTP(6);

    // Email content
    const mailOptions = {
      from: `"Instagram Automation" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verify Your Email Address",
      text: `Your verification code is: ${verificationCode}\nThis code will expire in 1 hour.\n\nIf you didn't request this, please ignore this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #8e44ad;">Email Verification</h2>
          </div>
          <p style="font-size: 16px; margin-bottom: 30px;">Please use the following code to verify your email address:</p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="font-size: 24px; font-weight: bold; letter-spacing: 8px; padding: 15px; background-color: #f5f5f5; border-radius: 5px;">${verificationCode}</div>
          </div>
          <p style="font-size: 14px; color: #666; margin-bottom: 10px;">This code will expire in 1 hour.</p>
          <p style="font-size: 14px; color: #666;">If you didn't request this, please ignore this email.</p>
        </div>
      `,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Verification email sent to ${email}: ${info.messageId}`);

    return {
      success: true,
      otp: verificationCode,
      messageId: info.messageId,
      error:null,
    };
  } catch (error) {
    console.error(`❌ Error sending verification email to ${email}:`, error);
    return {
      success: false,
      error: error.message,
      otp: null,
    };
  }
}

/**
 * Verify if the provided OTP matches the expected OTP
 * @param {string} providedOTP - OTP provided by the user
 * @param {string} expectedOTP - Expected OTP stored in the system
 * @returns {boolean} - Whether the OTP is valid
 */
function verifyOTP(providedOTP, expectedOTP) {
  return providedOTP === expectedOTP;
}

module.exports = {
  sendOTPEmail,
  generateOTP,
  verifyOTP,
};
