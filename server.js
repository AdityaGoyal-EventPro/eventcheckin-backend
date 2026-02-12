// ============================================
// EVENT CHECK-IN PRO - BACKEND API (WITH HOST APPROVAL + FORGOT PASSWORD + EVENT LIFECYCLE)
// ============================================

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
// QR codes are now generated on the frontend from check_in_token

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// ============================================
// ENVIRONMENT VARIABLES WITH VALIDATION
// ============================================

console.log('🔍 Checking environment variables...');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing');
console.log('SUPABASE_KEY:', process.env.SUPABASE_KEY ? '✅ Set' : '❌ Missing');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing');
console.log('SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? '✅ Set' : '❌ Missing');
console.log('MSG91_AUTH_KEY:', process.env.MSG91_AUTH_KEY ? '✅ Set' : '❌ Missing');
console.log('MSG91_SENDER_ID:', process.env.MSG91_SENDER_ID ? '✅ Set' : '❌ Missing');
console.log('MSG91_TEMPLATE_ID:', process.env.MSG91_TEMPLATE_ID ? '✅ Set' : '❌ Missing');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

// Validate required variables
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ ERROR: SUPABASE_URL and SUPABASE_KEY are required!');
  console.error('Please set these environment variables in Railway.');
  process.exit(1);
}

// Initialize Supabase
let supabase;
try {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('✅ Supabase client initialized');
} catch (error) {
  console.error('❌ Failed to initialize Supabase:', error.message);
  process.exit(1);
}

// ✅ ADDED: Initialize Supabase Admin Client (for password reset)
let supabaseAdmin;
try {
  supabaseAdmin = createClient(
    SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
  console.log('✅ Supabase admin client initialized');
} catch (error) {
  console.error('⚠️ Failed to initialize Supabase admin client:', error.message);
  // Don't exit - will fall back to regular client
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// ✅ UPDATED: Generate simple check-in token
function generateCheckInToken() {
  return 'GC-' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

// ✅ QR codes are now generated on the frontend using check_in_token
// No server-side QR image generation needed!

// ⚠️ DEPRECATED: Old QR generation (kept for backward compatibility)
function generateQRCode(guest, event) {
  return JSON.stringify({
    guest_id: guest.id,
    event_id: event.id,
    venue_id: event.venue_id,
    guest_name: guest.name,
    event_name: event.name,
    timestamp: Date.now()
  });
}

function getQRCodeURL(qrData) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`;
}

// ============================================
// EMAIL SERVICE - SENDGRID
// ============================================
async function sendEmail(to, subject, htmlContent) {
  console.log('📧 sendEmail called with:', { to, subject, from: process.env.SENDGRID_FROM_EMAIL });
  
  if (!SENDGRID_API_KEY) {
    console.error('⚠️ SendGrid not configured - skipping email');
    return { success: false, error: 'SendGrid not configured' };
  }

  console.log('✅ SendGrid API key found');

  try {
    const emailPayload = {
      personalizations: [{
        to: [{ email: to }],
        subject: subject
      }],
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@eventcheckin.com',
        name: 'Event Check-In Pro'
      },
      content: [{
        type: 'text/html',
        value: htmlContent
      }]
    };
    
    console.log('📤 Sending to SendGrid API:', JSON.stringify(emailPayload, null, 2));
    
    const response = await axios.post(
      'https://api.sendgrid.com/v3/mail/send',
      emailPayload,
      {
        headers: {
          'Authorization': `Bearer ${SENDGRID_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ SendGrid response:', response.status, response.statusText);
    return { success: true };
  } catch (error) {
    console.error('❌ SendGrid Error:', error.response?.data || error.message);
    console.error('Full error:', JSON.stringify(error.response?.data, null, 2));
    return { success: false, error: error.message };
  }
}

// ============================================
// SMS SERVICE - MSG91 (FIXED VERSION!)
// ============================================
async function sendSMSInvitation(guest, event) {
  console.log(`\n📱 === Starting SMS Send Process ===`);
  console.log(`📱 Guest: ${guest.name}`);
  console.log(`📱 Phone: ${guest.phone}`);
  console.log(`📱 Event: ${event.name}`);
  
  // ✅ FIX: Check process.env DIRECTLY, not constants!
  console.log(`\n🔍 Checking MSG91 Configuration...`);
  console.log(`MSG91_AUTH_KEY in env: ${!!process.env.MSG91_AUTH_KEY}`);
  console.log(`MSG91_TEMPLATE_ID in env: ${!!process.env.MSG91_TEMPLATE_ID}`);
  
  if (process.env.MSG91_AUTH_KEY) {
    console.log(`✅ AUTH_KEY found: ${process.env.MSG91_AUTH_KEY.substring(0, 10)}...`);
  } else {
    console.error(`❌ MSG91_AUTH_KEY is missing from environment`);
  }
  
  if (process.env.MSG91_TEMPLATE_ID) {
    console.log(`✅ TEMPLATE_ID found: ${process.env.MSG91_TEMPLATE_ID}`);
  } else {
    console.error(`❌ MSG91_TEMPLATE_ID is missing from environment`);
  }
  
  // Check if MSG91 is configured - use process.env directly!
  if (!process.env.MSG91_AUTH_KEY || !process.env.MSG91_TEMPLATE_ID) {
    console.error('⚠️ MSG91 not configured');
    throw new Error('MSG91 not configured');
  }
  
  console.log('✅ MSG91 is configured!');
  
  try {
    // Format phone number - add country code if missing
    let cleanPhone = guest.phone.replace(/[\s\-\+]/g, '');
    if (!cleanPhone.startsWith('91')) {
      cleanPhone = '91' + cleanPhone;
    }
    console.log(`📱 Formatted phone: ${cleanPhone}`);
    
    // Generate QR code URL from check-in token
    const qrCodeURL = getQRCodeURL(guest.check_in_token || guest.qr_code || '');
    
    // Format date
    const eventDate = new Date(event.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    
    // MSG91 payload - use process.env directly!
    const msg91Payload = {
      template_id: process.env.MSG91_TEMPLATE_ID,
      short_url: '0',
      recipients: [{
        mobiles: cleanPhone,
        var1: guest.name,
        var2: event.name,
        var3: eventDate,
        var4: qrCodeURL
      }]
    };
    
    // Add DLT Template ID if available
    if (process.env.MSG91_DLT_TEMPLATE_ID) {
      msg91Payload.DLT_TE_ID = process.env.MSG91_DLT_TEMPLATE_ID;
    }
    
    console.log('\n📤 MSG91 Payload:', JSON.stringify(msg91Payload, null, 2));
    
    // Call MSG91 API - use process.env directly!
    console.log('📱 Calling MSG91 API...');
    const response = await axios.post(
      'https://control.msg91.com/api/v5/flow/',
      msg91Payload,
      {
        headers: {
          'authkey': process.env.MSG91_AUTH_KEY,
          'content-type': 'application/json'
        }
      }
    );
    
    const result = response.data;
    console.log('\n📱 MSG91 Response Status:', response.status);
    console.log('📱 MSG91 Response:', JSON.stringify(result, null, 2));
    
    if (result.type === 'error') {
      console.error('❌ MSG91 returned error:', result);
      throw new Error(result.message || 'MSG91 API error');
    }
    
    console.log(`✅ SMS sent successfully to ${guest.phone}`);
    console.log(`📱 === SMS Send Complete ===\n`);
    
    return { success: true, data: result };
    
  } catch (error) {
    console.error(`❌ SMS failed for ${guest.phone}:`, error.response?.data || error.message);
    throw error;
  }
}

// ============================================
// EMAIL TEMPLATES
// ============================================

function getGuestInvitationEmailHTML(guest, event, inviteUrl) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🎉 You're Invited!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="font-size: 16px; color: #333;">Hi <strong>${guest.name}</strong>,</p>
              <p style="font-size: 16px; color: #333;">You're invited to:</p>
              
              <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0;">
                <h2 style="margin: 0 0 15px 0; color: #333;">${event.name}</h2>
                <p style="margin: 5px 0; color: #666;">📅 ${event.date}</p>
                <p style="margin: 5px 0; color: #666;">🕐 ${event.time_start} - ${event.time_end}</p>
                <p style="margin: 5px 0; color: #666;">📍 ${event.venue_name}</p>
                ${guest.category ? `<p style="margin: 5px 0; color: #666;">🎫 ${guest.category}</p>` : ''}
                ${guest.plus_ones > 0 ? `<p style="margin: 5px 0; color: #666;">👥 +${guest.plus_ones} guests</p>` : ''}
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteUrl}" 
                   style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                  View Your Invitation
                </a>
              </div>
              
              <p style="font-size: 14px; color: #666; text-align: center; margin-top: 30px;">
                Your invitation includes a QR code for easy check-in at the event.
              </p>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
              
              <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                If the button doesn't work, copy and paste this link:<br>
                <a href="${inviteUrl}" style="color: #667eea; word-break: break-all;">${inviteUrl}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function getInvitationEmailHTML(guest, event, qrCodeURL) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">You're Invited!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="font-size: 16px; color: #333;">Hi <strong>${guest.name}</strong>,</p>
              <p style="font-size: 16px; color: #333;">You're invited to:</p>
              <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0;">
                <h2 style="margin: 0 0 15px 0; color: #333;">${event.name}</h2>
                <p style="margin: 5px 0; color: #666;">📅 ${event.date}</p>
                <p style="margin: 5px 0; color: #666;">🕐 ${event.time_start} - ${event.time_end}</p>
                <p style="margin: 5px 0; color: #666;">📍 ${event.venue_name}</p>
              </div>
              <div style="text-align: center; margin: 30px 0;">
                <img src="${qrCodeURL}" alt="QR Code" style="width: 250px; height: 250px; border: 3px solid #667eea; border-radius: 8px;" />
                <p style="font-size: 14px; color: #666; margin-top: 15px;">Show this QR code at the entrance</p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function getInviteEmailHTML(name, inviteUrl, role, venueId) {
  const roleText = role === 'venue' ? 'Venue Staff' : role === 'admin' ? 'Administrator' : 'Event Host';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🎉 You're Invited!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="font-size: 16px; color: #333;">Hi <strong>${name}</strong>,</p>
              <p style="font-size: 16px; color: #333;">
                You've been invited to join <strong>Event Check-In Pro</strong> as a <strong>${roleText}</strong>.
              </p>
              <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0;">
                <p style="margin: 0; color: #666; font-size: 14px;">
                  Event Check-In Pro is a modern guest list management and check-in system that makes event management effortless.
                </p>
              </div>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                  Accept Invitation
                </a>
              </div>
              <p style="font-size: 14px; color: #666; margin-top: 30px;">
                This invitation will expire in <strong>48 hours</strong>.
              </p>
              <p style="font-size: 12px; color: #999; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// ============================================
// API ROUTES
// ============================================

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date(),
    supabase: SUPABASE_URL ? 'configured' : 'missing',
    supabase_admin: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'configured' : 'missing',
    sendgrid: SENDGRID_API_KEY ? 'configured' : 'missing',
    msg91: process.env.MSG91_AUTH_KEY ? 'configured' : 'missing',
    msg91_template: process.env.MSG91_TEMPLATE_ID ? 'configured' : 'missing'
  });
});

// ============================================
// AUTH ROUTES - UPDATED WITH HOST APPROVAL + FORGOT PASSWORD!
// ============================================

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name, phone, role, venue_id } = req.body;
    
    // Validation for venue users
    if (role === 'venue' && !venue_id) {
      return res.status(400).json({ error: 'Venue users must select a venue' });
    }
    
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password
    });
    
    if (authError) throw authError;
    
    // Fetch venue name if venue_id provided
    let venue_name = null;
    if (venue_id && role === 'venue') {
      const { data: venueData } = await supabase
        .from('venues')
        .select('name')
        .eq('id', venue_id)
        .single();
      
      venue_name = venueData?.name || null;
    }
    
    // ✅ Hosts auto-approved, venue staff still needs admin approval
    const status = (role === 'venue') ? 'pending' : 'active';
    
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert([{
        id: authData.user.id,
        email,
        name,
        phone,
        role,
        venue_id: role === 'venue' ? venue_id : null,
        venue_name: role === 'venue' ? venue_name : null,
        status: status
      }])
      .select()
      .single();
    
    if (userError) throw userError;
    
    // ✅ CHANGED: Only venue users get pending approval email
    if (role === 'venue' && process.env.SENDGRID_API_KEY) {
      const accountType = 'Venue Manager';
      
      const emailHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .info-box { background: white; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; }
            .status { display: inline-block; padding: 8px 16px; background: #ffa500; color: white; border-radius: 20px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⏳ Account Pending Approval</h1>
            </div>
            <div class="content">
              <p>Hi <strong>${name}</strong>,</p>
              <p>Thank you for registering with Event Check-In Pro!</p>
              
              <div class="info-box">
                <p><strong>Account Type:</strong> ${accountType}</p>
                ${role === 'venue' ? `<p><strong>Venue:</strong> ${venue_name}</p>` : ''}
                <p><strong>Status:</strong> <span class="status">Pending Approval</span></p>
              </div>
              
              <p>Your account has been created and is currently pending admin approval. This is a security measure to ensure the quality of our platform.</p>
              
              <p><strong>What happens next?</strong></p>
              <ul>
                <li>Our admin team will review your account</li>
                <li>You'll receive an email notification once approved (usually within 24-48 hours)</li>
                <li>After approval, you can login and start managing events</li>
              </ul>
              
              <p>If you have any questions, please contact our support team.</p>
              
              <p>Thank you for your patience!<br>
              <strong>Event Check-In Pro Team</strong></p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      await sendEmail(
        email,
        'Account Pending Approval - Event Check-In Pro',
        emailHTML
      );
    }
    
    res.json({ 
      success: true, 
      user: userData,
      message: role === 'venue' 
        ? 'Account created! Pending admin approval. Check your email for details.' 
        : 'Account created successfully!'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ✅ UPDATED: Login now checks if user is approved
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) throw error;
    
    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();
    
    // ✅ CHANGED: Check if account is approved
    if (userData && userData.status === 'pending') {
      return res.status(403).json({ 
        error: 'Account pending approval',
        message: 'Your account is awaiting admin approval. You will receive an email once approved.',
        status: 'pending'
      });
    }
    
    if (userData && userData.status === 'rejected') {
      return res.status(403).json({ 
        error: 'Account rejected',
        message: 'Your account registration was not approved. Please contact support for more information.',
        status: 'rejected'
      });
    }
    
    res.json({ 
      success: true, 
      user: userData,
      session: data.session 
    });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// ============================================
// 🔐 FORGOT PASSWORD ENDPOINTS - NEW!
// ============================================

// Forgot password - send reset link
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    console.log('🔐 Forgot password request for:', email);
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('email', email)
      .single();

    // Always return success even if user doesn't exist (security best practice)
    if (userError || !user) {
      console.log('User not found, but returning success for security');
      return res.json({ 
        success: true, 
        message: 'If an account exists with that email, a password reset link has been sent.' 
      });
    }

    // Generate reset token (valid for 1 hour)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    // Store reset token in database
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        reset_token: resetToken,
        reset_token_expiry: resetExpiry.toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error storing reset token:', updateError);
      throw updateError;
    }

    // Create reset link
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    // Send email with SendGrid
    if (SENDGRID_API_KEY) {
      const emailHTML = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Event Check-In Pro</h1>
          </div>
          
          <div style="padding: 40px 20px; background: #f9fafb;">
            <h2 style="color: #1f2937; margin-top: 0;">Password Reset Request</h2>
            
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
              Hi ${user.name},
            </p>
            
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
              We received a request to reset your password for your Event Check-In Pro account.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" 
                 style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                Reset Password
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
              This link will expire in 1 hour for security reasons.
            </p>
            
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
              If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #9ca3af; font-size: 12px;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${resetLink}" style="color: #667eea; word-break: break-all;">${resetLink}</a>
            </p>
          </div>
          
          <div style="padding: 20px; text-align: center; background: #1f2937; color: #9ca3af; font-size: 12px;">
            <p>© ${new Date().getFullYear()} Event Check-In Pro. All rights reserved.</p>
          </div>
        </div>
      `;

      await sendEmail(
        user.email,
        'Password Reset Request - Event Check-In Pro',
        emailHTML
      );
      
      console.log('✅ Password reset email sent to:', user.email);
    }

    res.json({ 
      success: true, 
      message: 'Password reset link has been sent to your email.' 
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ 
      error: 'Failed to process password reset request. Please try again.' 
    });
  }
});

// ✅ FIXED: Reset password with token (using admin client)
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    console.log('🔐 Reset password request with token');
    
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Find user with valid token
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, reset_token_expiry')
      .eq('reset_token', token)
      .single();

    if (userError || !user) {
      console.log('❌ Token not found or invalid');
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Check if token is expired
    const expiryDate = new Date(user.reset_token_expiry);
    if (expiryDate < new Date()) {
      console.log('❌ Token expired:', expiryDate, 'Current:', new Date());
      return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
    }

    console.log('✅ Token valid for user:', user.email);

    // ✅ FIXED: Use admin client to update password in Supabase Auth
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (authError) {
      console.error('❌ Error updating auth password:', authError);
      throw authError;
    }

    console.log('✅ Supabase Auth password updated');

    // Clear reset token
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        reset_token: null,
        reset_token_expiry: null
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('⚠️ Error clearing token (password was updated):', updateError);
      // Don't throw - password was already updated successfully
    }

    console.log('✅ Password reset successful for:', user.email);

    res.json({ 
      success: true, 
      message: 'Password has been reset successfully. You can now login with your new password.' 
    });

  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.status(500).json({ 
      error: 'Failed to reset password. Please try again or request a new reset link.' 
    });
  }
});

// ============================================
// EVENT ROUTES (WITH LIFECYCLE)
// ============================================

// ✅ UPDATED: Create event with status 'created'
app.post('/api/events', async (req, res) => {
  try {
    const { name, date, time_start, time_end, venue_id, host_id, expected_guests } = req.body;
    
    // Fetch venue name from venues table
    let venue_name = null;
    if (venue_id) {
      const { data: venueData } = await supabase
        .from('venues')
        .select('name')
        .eq('id', venue_id)
        .single();
      
      venue_name = venueData?.name || null;
    }
    
    const { data, error } = await supabase
      .from('events')
      .insert([{
        name,
        date,
        time_start,
        time_end,
        venue_name,
        venue_id,
        host_id,
        expected_guests,
        status: 'created',
        color: 'purple'
      }])
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, event: data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all events (for venue dashboard)
app.get('/api/events', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .in('status', ['created', 'completed'])
      .order('date', { ascending: false });
    
    if (error) throw error;
    
    res.json({ events: data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ✅ UPDATED: Get events for host (excludes archived)
app.get('/api/events/host/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;
    
    // CRITICAL VALIDATION: Prevent loading all events
    if (!hostId || hostId === 'undefined' || hostId === 'null') {
      console.log('Invalid host ID received:', hostId);
      return res.json({ events: [] });
    }
    
    console.log('Loading events for host:', hostId);
    
    // Only return non-archived events
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .eq('host_id', hostId)
      .in('status', ['created', 'completed'])
      .order('date', { ascending: false });
    
    if (error) throw error;
    
    console.log(`Found ${events?.length || 0} events for host ${hostId}`);
    
    // Get guest counts for each event
    const eventsWithStats = await Promise.all((events || []).map(async (event) => {
      const { data: guests } = await supabase
        .from('guests')
        .select('id, checked_in')
        .eq('event_id', event.id);
      
      const totalGuests = guests?.length || 0;
      const checkedInCount = guests?.filter(g => g.checked_in).length || 0;
      
      return {
        ...event,
        total_guests: totalGuests,
        checked_in_count: checkedInCount
      };
    }));
    
    res.json({ events: eventsWithStats });
  } catch (error) {
    console.error('Error in getByHost:', error);
    res.status(400).json({ error: error.message });
  }
});

// ✅ UPDATED: Get events for venue (includes 48hr cancelled events)
app.get('/api/events/venue/:venueId', async (req, res) => {
  try {
    const { venueId } = req.params;
    
    // CRITICAL VALIDATION: Prevent loading all events
    if (!venueId || venueId === 'undefined' || venueId === 'null') {
      console.log('Invalid venue ID received:', venueId);
      return res.json({ events: [] });
    }
    
    console.log('Loading events for venue:', venueId);
    
    // Get non-archived events
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .eq('venue_id', venueId)
      .in('status', ['created', 'completed'])
      .order('date', { ascending: false });
    
    if (error) throw error;
    
    // Also get recently cancelled events (cancelled before event, within 48hrs)
    const fortyEightHoursAgo = new Date();
    fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);
    
    const { data: cancelledEvents } = await supabase
      .from('events')
      .select('*')
      .eq('venue_id', venueId)
      .eq('status', 'archived')
      .eq('cancelled_before_event', true)
      .gte('deleted_at', fortyEightHoursAgo.toISOString());
    
    // Combine both lists
    const allEvents = [...(events || []), ...(cancelledEvents || [])];
    
    console.log(`Found ${allEvents.length} events for venue ${venueId} (${cancelledEvents?.length || 0} recently cancelled)`);
    
    // Get guest counts for each event
    const eventsWithStats = await Promise.all(allEvents.map(async (event) => {
      const { data: guests } = await supabase
        .from('guests')
        .select('id, checked_in')
        .eq('event_id', event.id);
      
      const totalGuests = guests?.length || 0;
      const checkedInCount = guests?.filter(g => g.checked_in).length || 0;
      
      return {
        ...event,
        total_guests: totalGuests,
        checked_in_count: checkedInCount
      };
    }));
    
    res.json({ events: eventsWithStats });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ✅ NEW: Get archived events (Host)
app.get('/api/events/host/:hostId/archived', async (req, res) => {
  try {
    const { hostId } = req.params;
    if (!hostId || hostId === 'undefined') return res.json({ events: [] });
    
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .eq('host_id', hostId)
      .eq('status', 'archived')
      .order('deleted_at', { ascending: false });
    
    if (error) throw error;
    
    // Add guest counts
    const eventsWithStats = await Promise.all((events || []).map(async (event) => {
      const { data: guests } = await supabase
        .from('guests')
        .select('id, checked_in')
        .eq('event_id', event.id);
      
      return {
        ...event,
        total_guests: guests?.length || 0,
        checked_in_count: guests?.filter(g => g.checked_in).length || 0
      };
    }));
    
    res.json({ events: eventsWithStats });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ✅ NEW: Get archived events (Venue)
app.get('/api/events/venue/:venueId/archived', async (req, res) => {
  try {
    const { venueId } = req.params;
    if (!venueId || venueId === 'undefined') return res.json({ events: [] });
    
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .eq('venue_id', venueId)
      .eq('status', 'archived')
      .order('deleted_at', { ascending: false });
    
    if (error) throw error;
    
    const eventsWithStats = await Promise.all((events || []).map(async (event) => {
      const { data: guests } = await supabase
        .from('guests')
        .select('id, checked_in')
        .eq('event_id', event.id);
      
      return {
        ...event,
        total_guests: guests?.length || 0,
        checked_in_count: guests?.filter(g => g.checked_in).length || 0
      };
    }));
    
    res.json({ events: eventsWithStats });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ✅ NEW: Get venue events by specific date
app.get('/api/events/venue/:venueId/by-date/:date', async (req, res) => {
  try {
    const { venueId, date } = req.params;
    if (!venueId || venueId === 'undefined') return res.json({ events: [] });
    
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .eq('venue_id', venueId)
      .eq('date', date)
      .in('status', ['created', 'completed'])
      .order('time_start', { ascending: true });
    
    if (error) throw error;
    
    const eventsWithStats = await Promise.all((events || []).map(async (event) => {
      const { data: guests } = await supabase
        .from('guests')
        .select('id, checked_in')
        .eq('event_id', event.id);
      
      return {
        ...event,
        total_guests: guests?.length || 0,
        checked_in_count: guests?.filter(g => g.checked_in).length || 0
      };
    }));
    
    res.json({ events: eventsWithStats });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// VENUE ROUTES
// ============================================

// Get all active venues
app.get('/api/venues', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('venues')
      .select('*')
      .eq('status', 'active')
      .order('name', { ascending: true });
    
    if (error) throw error;
    
    res.json({ venues: data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get venue by ID
app.get('/api/venues/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('venues')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error) throw error;
    
    res.json({ venue: data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Request new venue
app.post('/api/venues/request', async (req, res) => {
  try {
    const { 
      venue_name, 
      address, 
      city, 
      state, 
      contact_name, 
      contact_email, 
      contact_phone,
      requested_by_user_id,
      requested_by_name,
      requested_by_email
    } = req.body;
    
    const { data, error } = await supabase
      .from('venue_requests')
      .insert([{
        venue_name,
        address,
        city,
        state,
        contact_name,
        contact_email,
        contact_phone,
        requested_by_user_id,
        requested_by_name,
        requested_by_email,
        status: 'pending'
      }])
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, request: data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// INVITE ROUTES (Admin Only)
// ============================================

// Middleware to check if user is admin
const requireAdmin = async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: user } = await supabase
      .from('users')
      .select('role, status')
      .eq('id', userId)
      .single();

    if (!user || user.role !== 'admin' || user.status !== 'active') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create invite
app.post('/api/invites/create', async (req, res) => {
  try {
    const { email, name, role, venue_id, invited_by_user_id, invited_by_name } = req.body;

    // Generate secure token
    const { data: tokenData } = await supabase.rpc('generate_invite_token');
    const token = tokenData;

    // Set expiry (48 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    // Create invite
    const { data, error } = await supabase
      .from('invites')
      .insert([{
        token,
        email,
        name,
        role,
        venue_id,
        invited_by_user_id,
        invited_by_name,
        expires_at: expiresAt.toISOString(),
        status: 'pending'
      }])
      .select()
      .single();

    if (error) throw error;

    // Generate invite URL
    const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invite/${token}`;

    // Send invite email
    if (process.env.SENDGRID_API_KEY) {
      const emailHTML = getInviteEmailHTML(name, inviteUrl, role, venue_id);
      await sendEmail(
        email,
        `You're invited to Event Check-In Pro`,
        emailHTML
      );
    }

    res.json({ 
      success: true, 
      invite: data,
      inviteUrl 
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all invites (admin only)
app.get('/api/invites', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pending_invites')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ invites: data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Verify invite token
app.get('/api/invites/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const { data, error } = await supabase
      .from('invites')
      .select('*, venues(name, city)')
      .eq('token', token)
      .eq('status', 'pending')
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Invalid or expired invite' });
    }

    // Check if expired
    if (new Date(data.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invite has expired' });
    }

    res.json({ invite: data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Accept invite and create account
app.post('/api/invites/accept', async (req, res) => {
  try {
    const { token, password } = req.body;

    // Verify invite
    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .single();

    if (inviteError || !invite) {
      return res.status(404).json({ error: 'Invalid or expired invite' });
    }

    // Check expiry
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invite has expired' });
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: invite.email,
      password: password
    });

    if (authError) throw authError;

    // Fetch venue name if venue_id exists
    let venue_name = null;
    if (invite.venue_id) {
      const { data: venueData } = await supabase
        .from('venues')
        .select('name')
        .eq('id', invite.venue_id)
        .single();
      venue_name = venueData?.name;
    }

    // Create user in users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert([{
        id: authData.user.id,
        email: invite.email,
        name: invite.name,
        role: invite.role,
        venue_id: invite.venue_id,
        venue_name: venue_name,
        status: 'active'
      }])
      .select()
      .single();

    if (userError) throw userError;

    // Mark invite as accepted
    await supabase
      .from('invites')
      .update({ 
        status: 'accepted',
        accepted_at: new Date().toISOString()
      })
      .eq('token', token);

    res.json({ success: true, user: userData });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Revoke invite (admin only)
app.post('/api/invites/revoke/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('invites')
      .update({ status: 'revoked' })
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// GUEST ROUTES
// ============================================

app.post('/api/guests', async (req, res) => {
  try {
    const { event_id, name, email, phone, category, plus_ones, is_walkin } = req.body;
    
    console.log('Creating guest:', { name, email, phone });

    // ✅ GENERATE SIMPLE CHECK-IN TOKEN (no QR image stored!)
    const checkInToken = generateCheckInToken();

    // Generate invite token for email invitations
    const inviteToken = crypto.randomBytes(32).toString('hex');
    
    // Create guest - NO qr_code image stored (frontend generates QR from token)
    const { data, error } = await supabase
      .from('guests')
      .insert([{
        event_id,
        name,
        email: email || '',
        phone: phone || '',
        category: category || 'General',
        plus_ones: plus_ones || 0,
        is_walkin: is_walkin || false,
        check_in_token: checkInToken,
        invite_token: inviteToken,
        checked_in: false
      }])
      .select()
      .single();
    
    if (error) throw error;
    
    console.log('✅ Guest created with check-in token:', checkInToken);
    res.json({ success: true, guest: data });
    
  } catch (error) {
    console.error('❌ Error creating guest:', error);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/guests/event/:eventId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('guests')
      .select('*')
      .eq('event_id', req.params.eventId)
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    
    res.json({ guests: data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/guests/:guestId/checkin', async (req, res) => {
  try {
    const { scanner_name } = req.body;
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    
    const { data, error } = await supabase
      .from('guests')
      .update({
        checked_in: true,
        checked_in_time: time,
        checked_in_by: scanner_name || 'Scanner 1'
      })
      .eq('id', req.params.guestId)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, guest: data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ✅ NEW: Token-based check-in (from QR code scan)
app.post('/api/checkin/token', async (req, res) => {
  try {
    const { token } = req.body;
    
    console.log('📱 Token check-in attempt:', token);
    
    // Validate token
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Invalid token format' });
    }

    // Clean and uppercase token
    const cleanToken = token.trim().toUpperCase();

    // Find guest by check_in_token
    const { data: guest, error: findError } = await supabase
      .from('guests')
      .select('*')
      .eq('check_in_token', cleanToken)
      .single();

    if (findError || !guest) {
      console.log('❌ Guest not found for token:', cleanToken);
      return res.status(404).json({ 
        error: 'Invalid QR code. Guest not found.' 
      });
    }

    console.log('✅ Guest found:', guest.name, '(ID:', guest.id, ')');

    // Check if already checked in
    if (guest.checked_in) {
      console.log('⚠️ Guest already checked in:', guest.name);
      return res.status(200).json({ 
        success: true,
        guest,
        message: `${guest.name} is already checked in`,
        already_checked_in: true
      });
    }

    // Perform check-in
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    const { data: updatedGuest, error: updateError } = await supabase
      .from('guests')
      .update({
        checked_in: true,
        checked_in_time: time,
        checked_in_by: 'QR Scanner'
      })
      .eq('id', guest.id)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error updating guest:', updateError);
      throw updateError;
    }

    console.log('🎉 Check-in successful:', updatedGuest.name);

    res.json({ 
      success: true, 
      guest: updatedGuest,
      message: `${updatedGuest.name} checked in successfully!`
    });

  } catch (error) {
    console.error('❌ Token check-in error:', error);
    res.status(500).json({ 
      error: 'Check-in failed. Please try again.' 
    });
  }
});

// ============================================
// WRISTBAND & QR REGENERATION ROUTES
// ============================================

// Get wristband colors
app.get('/api/wristband-colors', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('wristband_colors')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });
    
    if (error) throw error;
    
    res.json({ colors: data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update event wristband color
app.patch('/api/events/:eventId/wristband', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { wristband_color } = req.body;
    
    const { data, error } = await supabase
      .from('events')
      .update({ wristband_color })
      .eq('id', eventId)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, event: data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Regenerate QR code for single guest
app.post('/api/guests/:guestId/regenerate-qr', async (req, res) => {
  try {
    const { guestId } = req.params;
    
    // Get guest with event data
    const { data: guests, error: guestError } = await supabase
      .from('guests')
      .select('*, events(*)')
      .eq('id', guestId);
    
    if (guestError || !guests || guests.length === 0) {
      throw new Error('Guest not found');
    }
    
    const guest = guests[0];
    
    // Generate new QR with correct ID
    const qrData = generateQRCode(
      { name: guest.name, id: guest.id }, 
      guest.events
    );
    
    // Update guest
    const { data, error } = await supabase
      .from('guests')
      .update({ qr_code: qrData })
      .eq('id', guestId)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, guest: data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Regenerate QR codes for all guests in an event
app.post('/api/events/:eventId/regenerate-all-qr', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    // Get event
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();
    
    if (eventError) throw eventError;
    
    // Get all guests
    const { data: guests, error: guestsError } = await supabase
      .from('guests')
      .select('*')
      .eq('event_id', eventId);
    
    if (guestsError) throw guestsError;
    
    let updated = 0;
    let failed = 0;
    
    // Regenerate QR for each guest
    for (const guest of guests) {
      try {
        const qrData = generateQRCode(
          { name: guest.name, id: guest.id },
          event
        );
        
        await supabase
          .from('guests')
          .update({ qr_code: qrData })
          .eq('id', guest.id);
        
        updated++;
      } catch (err) {
        console.error(`Failed to update guest ${guest.id}:`, err);
        failed++;
      }
    }
    
    res.json({ 
      success: true, 
      updated,
      failed,
      total: guests.length
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// INVITATION ROUTES (FIXED WITH SMS!)
// ============================================

// Get guest invitation by token (PUBLIC - no auth required)
app.get('/api/invites/guest/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    console.log('📨 Fetching invitation for token:', token);
    
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Find guest by invite token
    const { data: guest, error: guestError } = await supabase
      .from('guests')
      .select('*')
      .eq('invite_token', token)
      .single();

    if (guestError || !guest) {
      console.log('❌ Guest not found for token:', token);
      return res.status(404).json({ 
        error: 'Invalid or expired invitation link' 
      });
    }

    console.log('✅ Guest found:', guest.name);

    // Get event details
    const { data: event, error: eventError} = await supabase
      .from('events')
      .select('*')
      .eq('id', guest.event_id)
      .single();

    if (eventError || !event) {
      console.log('❌ Event not found:', guest.event_id);
      return res.status(404).json({ 
        error: 'Event not found' 
      });
    }

    console.log('✅ Event found:', event.name);

    // ✅ TRACK INVITATION OPENED
    const openCount = guest.invitation_open_count || 0;
    await supabase.from('guests').update({
      invitation_opened: true,
      invitation_opened_at: new Date().toISOString(),
      invitation_open_count: openCount + 1
    }).eq('id', guest.id);

    console.log(`✅ Tracked invitation opened (count: ${openCount + 1})`);

    // Return invitation data
    res.json({
      guest: {
        id: guest.id,
        name: guest.name,
        email: guest.email,
        phone: guest.phone,
        category: guest.category,
        plus_ones: guest.plus_ones,
        check_in_token: guest.check_in_token,  // ✅ Frontend generates QR from this
        checked_in: guest.checked_in,
        checked_in_time: guest.checked_in_time
      },
      event: {
        id: event.id,
        name: event.name,
        date: event.date,
        time_start: event.time_start,
        time_end: event.time_end,
        venue_name: event.venue_name,
        venue_id: event.venue_id,
        host_id: event.host_id
      }
    });

  } catch (error) {
    console.error('❌ Error fetching invitation:', error);
    res.status(500).json({ 
      error: 'Failed to load invitation' 
    });
  }
});

app.post('/api/invitations/send', async (req, res) => {
  try {
    const { event_id, channels, filter = 'all', guest_ids = [] } = req.body;
    
    console.log('\n📧 ============================================');
    console.log('📧 BULK INVITATIONS REQUEST');
    console.log('📧 ============================================');
    console.log('📧 Event ID:', event_id);
    console.log('📧 Channels:', channels);
    console.log('📧 Filter:', filter);
    
    // Get event details
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', event_id)
      .single();
    
    if (eventError) throw eventError;
    
    console.log('📧 Event:', event.name);
    
    // ✅ GET GUESTS BASED ON FILTER
    let guests;
    let query = supabase.from('guests').select('*').eq('event_id', event_id);
    
    switch (filter) {
      case 'not_invited':
        query = query.or('invitation_sent.is.null,invitation_sent.eq.false');
        break;
      
      case 'not_checked_in':
        query = query.eq('checked_in', false);
        break;
      
      case 'vip':
        query = query.eq('category', 'VIP');
        break;
      
      case 'general':
        query = query.eq('category', 'General');
        break;
      
      case 'custom':
        if (guest_ids.length === 0) {
          return res.status(400).json({ error: 'No guests selected' });
        }
        query = query.in('id', guest_ids);
        break;
      
      case 'all':
      default:
        // No additional filter
        break;
    }
    
    const { data: filteredGuests, error: guestsError } = await query;
    
    if (guestsError) throw guestsError;
    
    guests = filteredGuests;
    
    console.log(`📧 Found ${guests.length} guests matching filter: ${filter}`);
    
    const results = {
      email: { sent: 0, failed: 0 },
      sms: { sent: 0, failed: 0 }
    };
    
    // Send invitations to each guest
    for (const guest of guests) {
      console.log(`\n📧 Processing guest: ${guest.name}`);
      
      // ✅ GENERATE INVITE TOKEN if not exists
      let inviteToken = guest.invite_token;
      if (!inviteToken) {
        inviteToken = crypto.randomBytes(16).toString('hex');
        
        // Update guest with token
        const { error: updateError } = await supabase
          .from('guests')
          .update({ 
            invite_token: inviteToken,
            invite_sent_at: new Date().toISOString()
          })
          .eq('id', guest.id);
        
        if (updateError) {
          console.error('❌ Error saving invite token:', updateError);
          continue;
        }
        
        console.log('✅ Generated invite token:', inviteToken);
      }
      
      // ✅ CREATE INVITE URL
      const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invite/${inviteToken}`;
      console.log('📨 Invite URL:', inviteUrl);
      
      const qrCodeURL = getQRCodeURL(guest.check_in_token || guest.qr_code || '');
      
      // SEND EMAIL (if selected and guest has email)
      if (channels.email && guest.email) {
        try {
          console.log(`📧 Sending email to: ${guest.email}`);
          const emailHTML = getGuestInvitationEmailHTML(guest, event, inviteUrl);
          const emailResult = await sendEmail(
            guest.email,
            `You're invited to ${event.name}`,
            emailHTML
          );
          
          if (emailResult.success) {
            results.email.sent++;
            console.log(`✅ Email sent to ${guest.email}`);
          } else {
            results.email.failed++;
            console.error(`❌ Email failed for ${guest.email}`);
          }
        } catch (error) {
          results.email.failed++;
          console.error(`❌ Email error for ${guest.email}:`, error.message);
        }
      }
      
      // SEND SMS (if selected and guest has phone) ✅ FIXED!
      if (channels.sms && guest.phone) {
        try {
          console.log(`📱 Sending SMS to: ${guest.phone}`);
          await sendSMSInvitation(guest, event);
          results.sms.sent++;
          console.log(`✅ SMS sent to ${guest.phone}`);
        } catch (error) {
          results.sms.failed++;
          console.error(`❌ SMS failed for ${guest.phone}:`, error.message);
        }
      }
      
      // ✅ TRACK INVITATION SENT (if at least one channel succeeded)
      const emailSent = channels.email && guest.email;
      const smsSent = channels.sms && guest.phone;
      
      if (emailSent || smsSent) {
        const sentVia = emailSent && smsSent ? 'both' : 
                       emailSent ? 'email' : 'sms';
        
        await supabase.from('guests').update({
          invitation_sent: true,
          invitation_sent_at: new Date().toISOString(),
          invitation_sent_via: sentVia
        }).eq('id', guest.id);
        
        console.log(`✅ Tracked invitation sent via ${sentVia}`);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n📊 Final Results:', results);
    console.log('📧 ============================================\n');
    
    res.json({ success: true, results });
  } catch (error) {
    console.error('❌ Send invitations error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// SINGLE EVENT DETAILS (with host info)
// NO JOIN - Fetches separately to avoid relationship errors
// ============================================
app.get('/api/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Getting event by ID:', id);

    // Get event without join
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single();

    if (eventError) {
      console.error('Error fetching event:', eventError);
      return res.status(404).json({ error: 'Event not found' });
    }

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Get host info separately
    let hostInfo = null;
    if (event.host_id) {
      const { data: host } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', event.host_id)
        .single();
      
      if (host) {
        hostInfo = host;
      }
    }

    // Get venue info separately if needed
    let venueInfo = null;
    if (event.venue_id) {
      const { data: venue } = await supabase
        .from('venues')
        .select('name, city')
        .eq('id', event.venue_id)
        .single();
      
      if (venue) {
        venueInfo = venue;
      }
    }

    // Combine all data
    const eventWithDetails = {
      ...event,
      host_name: hostInfo?.name || 'Unknown',
      host_email: hostInfo?.email || '',
      venue_name: venueInfo?.name || event.venue_name || 'Unknown',
      venue_city: venueInfo?.city || ''
    };

    console.log('Event loaded successfully:', eventWithDetails.name);
    res.json({ event: eventWithDetails });

  } catch (error) {
    console.error('Error in GET /api/events/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// EVENT LIFECYCLE: SMART DELETE, RESTORE, PURGE
// ============================================

// ✅ NEW: Smart delete — handles all 3 scenarios
app.post('/api/events/:id/smart-delete', async (req, res) => {
  try {
    const { deleted_by } = req.body;  // 'host' or 'venue'
    const eventId = req.params.id;
    
    if (!['host', 'venue'].includes(deleted_by)) {
      return res.status(400).json({ error: 'deleted_by must be "host" or "venue"' });
    }

    // Get event details
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();
    
    if (eventError) throw eventError;

    // Get guest stats
    const { data: guests } = await supabase
      .from('guests')
      .select('id, checked_in')
      .eq('event_id', eventId);
    
    const guestCount = guests?.length || 0;
    const checkedInCount = guests?.filter(g => g.checked_in).length || 0;

    // ── Scenario 1: 0 guests → instant permanent delete ──
    if (guestCount === 0) {
      await supabase.from('events').delete().eq('id', eventId);
      console.log(`🗑️ Event instantly deleted (0 guests): ${event.name}`);
      return res.json({ 
        action: 'deleted',
        message: 'Event permanently deleted (no guest data to preserve)'
      });
    }

    // ── Check if event is in the future (pre-event cancellation) ──
    const eventDate = new Date(`${event.date}T${event.time_end || '23:59'}`);
    const isPastEvent = eventDate < new Date();
    const cancelledBeforeEvent = !isPastEvent;

    // ── Scenario 2 & 3: Has guests → archive ──
    const { data: updated, error: updateError } = await supabase
      .from('events')
      .update({
        status: 'archived',
        deleted_by,
        deleted_at: new Date().toISOString(),
        cancelled_before_event: cancelledBeforeEvent
      })
      .eq('id', eventId)
      .select()
      .single();
    
    if (updateError) throw updateError;

    console.log(`📦 Event archived by ${deleted_by}: ${event.name} (${guestCount} guests, ${checkedInCount} checked in, cancelled_before: ${cancelledBeforeEvent})`);
    
    res.json({ 
      action: 'archived',
      message: cancelledBeforeEvent 
        ? 'Event cancelled and archived. Venue will be notified.'
        : 'Event archived. You can restore it within 30 days.',
      cancelled_before_event: cancelledBeforeEvent,
      guest_count: guestCount,
      checked_in_count: checkedInCount
    });
  } catch (error) {
    console.error('Smart delete error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ✅ KEEP: Legacy soft delete route for backward compatibility
app.patch('/api/events/:id/delete', async (req, res) => {
  try {
    const { deleted_by } = req.body;
    
    const { data, error } = await supabase
      .from('events')
      .update({ 
        status: 'archived',
        deleted_by,
        deleted_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ event: data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ✅ NEW: Restore from archive
app.patch('/api/events/:id/restore', async (req, res) => {
  try {
    // Get the event to determine what status to restore to
    const { data: event, error: findError } = await supabase
      .from('events')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (findError) throw findError;

    // Determine restore status based on event date
    const eventEndTime = new Date(`${event.date}T${event.time_end || '23:59'}`);
    const now = new Date();
    const restoreStatus = eventEndTime < now ? 'completed' : 'created';

    const { data, error } = await supabase
      .from('events')
      .update({ 
        status: restoreStatus,
        deleted_by: null,
        deleted_at: null,
        cancelled_before_event: false
      })
      .eq('id', req.params.id)
      .select()
      .single();
    
    if (error) throw error;
    
    console.log(`♻️ Event restored to '${restoreStatus}': ${data.name}`);
    res.json({ event: data, restored_status: restoreStatus });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ✅ UPDATED: Hard delete event (keeps guest data — just detaches)
app.delete('/api/events/:id', async (req, res) => {
  try {
    // Detach guests (keep their records, just unlink from event)
    await supabase
      .from('guests')
      .update({ event_id: null })
      .eq('event_id', req.params.id);
    
    // Delete the event record
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', req.params.id);
    
    if (error) throw error;
    
    console.log(`🗑️ Event permanently deleted: ${req.params.id}`);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ✅ NEW: Auto-update event statuses (complete → archive → purge)
app.post('/api/events/auto-update-status', async (req, res) => {
  try {
    const now = new Date();
    
    // 1. Auto-complete: events where end time has passed and status is still 'created'
    const { data: createdEvents } = await supabase
      .from('events')
      .select('id, name, date, time_end')
      .eq('status', 'created');
    
    let completedCount = 0;
    for (const event of (createdEvents || [])) {
      const endTime = new Date(`${event.date}T${event.time_end || '23:59'}`);
      if (endTime < now) {
        await supabase
          .from('events')
          .update({ status: 'completed' })
          .eq('id', event.id);
        console.log(`✅ Auto-completed: ${event.name}`);
        completedCount++;
      }
    }
    
    // 2. Auto-archive: completed events older than 15 days
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    
    const { data: completedEvents } = await supabase
      .from('events')
      .select('id, name, date')
      .eq('status', 'completed');
    
    let archivedCount = 0;
    for (const event of (completedEvents || [])) {
      const eventDate = new Date(event.date);
      if (eventDate < fifteenDaysAgo) {
        await supabase
          .from('events')
          .update({ 
            status: 'archived',
            deleted_at: new Date().toISOString(),
            deleted_by: 'system'
          })
          .eq('id', event.id);
        console.log(`📦 Auto-archived: ${event.name}`);
        archivedCount++;
      }
    }
    
    // 3. Auto-purge: archived events older than 30 days
    const { data: archivedEvents } = await supabase
      .from('events')
      .select('id, name, deleted_at')
      .eq('status', 'archived')
      .not('deleted_at', 'is', null);
    
    let purgedCount = 0;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    for (const event of (archivedEvents || [])) {
      if (new Date(event.deleted_at) < thirtyDaysAgo) {
        // Keep guest data, just detach
        await supabase
          .from('guests')
          .update({ event_id: null })
          .eq('event_id', event.id);
        
        await supabase
          .from('events')
          .delete()
          .eq('id', event.id);
        
        console.log(`🔥 Auto-purged: ${event.name}`);
        purgedCount++;
      }
    }
    
    res.json({ 
      completed: completedCount, 
      archived: archivedCount, 
      purged: purgedCount,
      message: `Completed: ${completedCount}, Archived: ${archivedCount}, Purged: ${purgedCount}`
    });
  } catch (error) {
    console.error('Auto-update error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// GUEST MANAGEMENT ENDPOINTS
// ============================================

// Update guest
app.patch('/api/guests/:id', async (req, res) => {
  try {
    const { name, email, phone, category, plus_ones } = req.body;
    
    const { data, error } = await supabase
      .from('guests')
      .update({ 
        name, 
        email, 
        phone, 
        category, 
        plus_ones: parseInt(plus_ones) || 0
      })
      .eq('id', req.params.id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ guest: data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete guest
app.delete('/api/guests/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('guests')
      .delete()
      .eq('id', req.params.id);
    
    if (error) throw error;
    
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// ADMIN DASHBOARD ENDPOINTS
// ============================================

// Get system statistics
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    // Get user counts
    const { data: users } = await supabase
      .from('users')
      .select('role, status');
    
    const totalUsers = users?.filter(u => u.status === 'active').length || 0;
    const totalHosts = users?.filter(u => u.role === 'host' && u.status === 'active').length || 0;
    const totalVenues = users?.filter(u => u.role === 'venue' && u.status === 'active').length || 0;
    
    // Get venue locations count
    const { data: venues } = await supabase
      .from('venues')
      .select('id');
    const totalVenueLocations = venues?.length || 0;
    
    // Get events count
    const { data: events } = await supabase
      .from('events')
      .select('id, date');
    const totalEvents = events?.length || 0;
    const upcomingEvents = events?.filter(e => new Date(e.date) >= new Date()).length || 0;
    
    // Get check-ins count
    const { data: guests } = await supabase
      .from('guests')
      .select('checked_in');
    const totalCheckins = guests?.filter(g => g.checked_in).length || 0;
    
    res.json({
      stats: {
        totalUsers,
        totalHosts,
        totalVenues,
        totalVenueLocations,
        totalEvents,
        upcomingEvents,
        totalCheckins
      }
    });
  } catch (error) {
    console.error('Error loading admin stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get recent activity
app.get('/api/admin/activity', requireAdmin, async (req, res) => {
  try {
    const { data: logs } = await supabase
      .from('admin_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    const activity = (logs || []).map(log => ({
      message: formatLogMessage(log),
      timestamp: new Date(log.created_at).toLocaleString()
    }));
    
    res.json({ activity });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all users
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ users: users || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user
app.put('/api/admin/users/:userId', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, role, venue_id } = req.body;
    const adminId = req.headers['x-user-id'];
    
    const updateData = {};
    if (status) updateData.status = status;
    if (role) updateData.role = role;
    if (venue_id !== undefined) updateData.venue_id = venue_id;
    
    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();
    
    if (error) throw error;
    
    // Log the action
    await supabase.from('admin_logs').insert({
      admin_id: adminId,
      action: 'USER_UPDATED',
      target_type: 'user',
      target_id: userId,
      details: updateData
    });
    
    res.json({ success: true, user: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve user (special endpoint with email notification)
app.post('/api/admin/users/:userId/approve', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.headers['x-user-id'];
    
    // Update status to active
    const { data: user, error } = await supabase
      .from('users')
      .update({ status: 'active' })
      .eq('id', userId)
      .select()
      .single();
    
    if (error) throw error;
    
    // Determine account type for email
    const accountType = user.role === 'host' ? 'Event Host' : 'Venue Manager';
    
    // Send approval email
    if (process.env.SENDGRID_API_KEY && user.email) {
      const emailHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .info-box { background: white; border-left: 4px solid #4caf50; padding: 15px; margin: 20px 0; }
            .status { display: inline-block; padding: 8px 16px; background: #4caf50; color: white; border-radius: 20px; font-weight: bold; }
            .button { display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Account Approved!</h1>
            </div>
            <div class="content">
              <p>Hi <strong>${user.name}</strong>,</p>
              <p>Great news! Your account has been approved and is now active.</p>
              
              <div class="info-box">
                <p><strong>Account Type:</strong> ${accountType}</p>
                ${user.role === 'venue' ? `<p><strong>Venue:</strong> ${user.venue_name || 'N/A'}</p>` : ''}
                <p><strong>Status:</strong> <span class="status">Active ✅</span></p>
              </div>
              
              <p><strong>What you can do now:</strong></p>
              <ul>
                <li>Login to your dashboard</li>
                <li>${user.role === 'host' ? 'Create and manage events' : 'View events at your venue'}</li>
                <li>Manage guest lists</li>
                <li>Send invitations</li>
                <li>Track check-ins in real-time</li>
              </ul>
              
              <div style="text-align: center;">
                <a href="${process.env.FRONTEND_URL || 'https://your-app.vercel.app'}/login" class="button">
                  Login to Dashboard
                </a>
              </div>
              
              <p style="margin-top: 30px;">If you have any questions, please don't hesitate to contact us.</p>
              
              <p>Welcome to Event Check-In Pro!<br>
              <strong>The Team</strong></p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      await sendEmail(
        user.email,
        '✅ Account Approved - Event Check-In Pro',
        emailHTML
      );
    }
    
    // Log the action
    await supabase.from('admin_logs').insert({
      admin_id: adminId,
      action: 'USER_APPROVED',
      target_type: 'user',
      target_id: userId,
      details: { name: user.name, email: user.email, role: user.role }
    });
    
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reject user
app.post('/api/admin/users/:userId/reject', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const adminId = req.headers['x-user-id'];
    
    // Get user details before deleting
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Send rejection email
    if (process.env.SENDGRID_API_KEY && user.email) {
      const emailHTML = `
        <h2>Account Application Update</h2>
        <p>Hi ${user.name},</p>
        <p>Thank you for your interest in Event Check-In Pro.</p>
        <p>Unfortunately, we're unable to approve your account application at this time.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        <p>If you believe this is an error or have questions, please contact support.</p>
        <p>Thank you,<br>Event Check-In Pro Team</p>
      `;
      
      await sendEmail(
        user.email,
        'Account Application Update - Event Check-In Pro',
        emailHTML
      );
    }
    
    // Delete the user and auth record
    await supabase.from('users').delete().eq('id', userId);
    
    // Try to delete from auth (may fail if service role key not available)
    try {
      await supabaseAdmin.auth.admin.deleteUser(userId);
    } catch (authError) {
      console.error('⚠️ Could not delete auth user (service role key may be missing):', authError);
    }
    
    // Log the action
    await supabase.from('admin_logs').insert({
      admin_id: adminId,
      action: 'USER_REJECTED',
      target_type: 'user',
      target_id: userId,
      details: { name: user.name, email: user.email, reason }
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all venues (admin)
app.get('/api/admin/venues', requireAdmin, async (req, res) => {
  try {
    const { data: venues, error } = await supabase
      .from('venues')
      .select('*')
      .order('name', { ascending: true });
    
    if (error) throw error;
    
    res.json({ venues: venues || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create venue (admin)
app.post('/api/admin/venues', requireAdmin, async (req, res) => {
  try {
    const { name, city, address, capacity } = req.body;
    const adminId = req.headers['x-user-id'];
    
    if (!name || !city) {
      return res.status(400).json({ error: 'Name and city are required' });
    }
    
    const { data, error } = await supabase
      .from('venues')
      .insert([{ name, city, address, capacity }])
      .select()
      .single();
    
    if (error) throw error;
    
    // Log the action
    await supabase.from('admin_logs').insert({
      admin_id: adminId,
      action: 'VENUE_CREATED',
      target_type: 'venue',
      target_id: data.id.toString(),
      details: { name, city }
    });
    
    res.json({ success: true, venue: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update venue (admin)
app.put('/api/admin/venues/:venueId', requireAdmin, async (req, res) => {
  try {
    const { venueId } = req.params;
    const { name, city, address, capacity } = req.body;
    const adminId = req.headers['x-user-id'];
    
    const { data, error } = await supabase
      .from('venues')
      .update({ name, city, address, capacity })
      .eq('id', venueId)
      .select()
      .single();
    
    if (error) throw error;
    
    // Log the action
    await supabase.from('admin_logs').insert({
      admin_id: adminId,
      action: 'VENUE_UPDATED',
      target_type: 'venue',
      target_id: venueId,
      details: { name, city }
    });
    
    res.json({ success: true, venue: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete venue (admin)
app.delete('/api/admin/venues/:venueId', requireAdmin, async (req, res) => {
  try {
    const { venueId } = req.params;
    const adminId = req.headers['x-user-id'];
    
    const { error } = await supabase
      .from('venues')
      .delete()
      .eq('id', venueId);
    
    if (error) throw error;
    
    // Log the action
    await supabase.from('admin_logs').insert({
      admin_id: adminId,
      action: 'VENUE_DELETED',
      target_type: 'venue',
      target_id: venueId
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to format log messages
function formatLogMessage(log) {
  const actions = {
    'USER_UPDATED': `User ${log.target_id} was updated`,
    'USER_APPROVED': `User "${log.details?.name}" was approved`,
    'USER_REJECTED': `User "${log.details?.name}" was rejected`,
    'VENUE_CREATED': `New venue "${log.details?.name}" was created`,
    'VENUE_UPDATED': `Venue "${log.details?.name}" was updated`,
    'VENUE_DELETED': `Venue was deleted`,
    'ADMIN_CREATED': `New admin user was created`
  };
  
  return actions[log.action] || log.action;
}

// ============================================
// DEBUG ENDPOINT - CHECK MSG91 CONFIG
// ============================================
app.get('/api/debug/msg91', (req, res) => {
  res.json({
    status: (process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID) ? 
      '✅ MSG91 Configured' : 
      '❌ MSG91 Not Configured',
    MSG91_AUTH_KEY: process.env.MSG91_AUTH_KEY ? 
      `✅ Set: ${process.env.MSG91_AUTH_KEY.substring(0, 10)}...` : 
      '❌ MISSING',
    MSG91_TEMPLATE_ID: process.env.MSG91_TEMPLATE_ID ? 
      `✅ Set: ${process.env.MSG91_TEMPLATE_ID}` : 
      '❌ MISSING',
    MSG91_SENDER_ID: process.env.MSG91_SENDER_ID || 'Not set (optional)',
    MSG91_ROUTE: process.env.MSG91_ROUTE || 'Not set (optional)',
    MSG91_DLT_TEMPLATE_ID: process.env.MSG91_DLT_TEMPLATE_ID || 'Not set (optional)'
  });
});

// ============================================
// ADMIN UTILITY - REGENERATE TOKENS
// ============================================

// ✅ ADMIN: Regenerate simple tokens for all existing guests (run once)
app.post('/api/admin/regenerate-tokens', async (req, res) => {
  try {
    console.log('🔄 Starting token regeneration for all guests...');

    // Get all guests
    const { data: guests, error } = await supabase
      .from('guests')
      .select('id, name');

    if (error) throw error;

    console.log(`📋 Found ${guests.length} total guests`);

    let updated = 0;
    let failed = 0;

    for (const guest of guests) {
      try {
        // Generate new simple token (no QR image needed)
        const checkInToken = generateCheckInToken();

        // Update guest with new token only
        const { error: updateError } = await supabase
          .from('guests')
          .update({
            check_in_token: checkInToken
          })
          .eq('id', guest.id);

        if (updateError) throw updateError;

        updated++;
        
        // Log progress every 50 guests
        if (updated % 50 === 0) {
          console.log(`✅ Progress: ${updated}/${guests.length} guests updated...`);
        }
      } catch (err) {
        console.error(`❌ Failed to update guest ${guest.name}:`, err.message);
        failed++;
      }
    }

    console.log(`🎉 Token regeneration complete!`);
    console.log(`✅ Successfully updated: ${updated} guests`);
    console.log(`❌ Failed: ${failed} guests`);

    res.json({ 
      success: true, 
      total: guests.length,
      updated,
      failed,
      message: `Regenerated tokens for ${updated} guests`
    });

  } catch (error) {
    console.error('❌ Token regeneration error:', error);
    res.status(500).json({ 
      error: 'Token regeneration failed',
      details: error.message 
    });
  }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`✅ Supabase: ${SUPABASE_URL ? 'Configured' : 'Missing'}`);
  console.log(`✅ Supabase Admin: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Configured' : 'Missing'}`);
  console.log(`✅ SendGrid: ${SENDGRID_API_KEY ? 'Configured' : 'Missing'}`);
  console.log(`✅ MSG91: ${process.env.MSG91_AUTH_KEY ? 'Configured' : 'Missing'}`);
  console.log(`✅ MSG91 Template: ${process.env.MSG91_TEMPLATE_ID ? 'Configured' : 'Missing'}`);
  console.log(`\n📱 Debug endpoint: GET /api/debug/msg91`);
  console.log(`🔐 Forgot Password: POST /api/auth/forgot-password`);
  console.log(`🔐 Reset Password: POST /api/auth/reset-password`);
  console.log(`🔄 Event Lifecycle: POST /api/events/auto-update-status`);
  console.log(`\n⚠️  HOST APPROVAL: Hosts now require admin approval before login\n`);
});
