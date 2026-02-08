// ============================================
// EVENT CHECK-IN PRO - BACKEND API (UPDATED)
// ============================================

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

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
console.log('SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? '✅ Set' : '❌ Missing');
console.log('MSG91_AUTH_KEY:', process.env.MSG91_AUTH_KEY ? '✅ Set' : '❌ Missing');
console.log('MSG91_SENDER_ID:', process.env.MSG91_SENDER_ID ? '✅ Set' : '❌ Missing');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const MSG91_SENDER_ID = process.env.MSG91_SENDER_ID;

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

// ============================================
// HELPER FUNCTIONS
// ============================================

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
// SMS SERVICE - MSG91
// ============================================
async function sendSMS(phone, guestName, eventName, eventDate, eventVenue, qrCodeURL) {
  console.log('📱 sendSMS called with:', { phone, guestName, eventName });
  
  if (!MSG91_AUTH_KEY || !MSG91_SENDER_ID) {
    console.error('⚠️ MSG91 not configured - skipping SMS');
    return { success: false, error: 'MSG91 not configured' };
  }

  const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID;
  if (!MSG91_TEMPLATE_ID) {
    console.error('⚠️ MSG91 Template ID not configured');
    return { success: false, error: 'MSG91 Template not configured' };
  }

  console.log('✅ MSG91 configured, Template ID:', MSG91_TEMPLATE_ID);

  try {
    // Clean phone number (remove non-digits)
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    
    // MSG91 template variables
    const payload = {
      template_id: MSG91_TEMPLATE_ID,
      short_url: '0',
      recipients: [
        {
          mobiles: cleanPhone,
          var1: guestName,
          var2: eventName,
          var3: eventDate,
          var4: eventVenue,
          var5: qrCodeURL
        }
      ]
    };

    console.log('📤 Sending to MSG91:', JSON.stringify(payload, null, 2));

    const response = await axios.post(
      'https://control.msg91.com/api/v5/flow/',
      payload,
      {
        headers: {
          'authkey': MSG91_AUTH_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ MSG91 response:', response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('❌ MSG91 Error:', error.response?.data || error.message);
    console.error('Full error:', JSON.stringify(error.response?.data, null, 2));
    return { success: false, error: error.message };
  }
}

// ============================================
// EMAIL TEMPLATE
// ============================================
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

// ============================================
// INVITE EMAIL TEMPLATE
// ============================================
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
    sendgrid: SENDGRID_API_KEY ? 'configured' : 'missing',
    msg91: MSG91_AUTH_KEY ? 'configured' : 'missing'
  });
});

// Auth routes
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name, phone, role, venue_id } = req.body;
    
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
    
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert([{
        id: authData.user.id,
        email,
        name,
        phone,
        role,
        venue_id: role === 'venue' ? venue_id : null,
        venue_name: role === 'venue' ? venue_name : null
      }])
      .select()
      .single();
    
    if (userError) throw userError;
    
    res.json({ success: true, user: userData });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

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
// EVENT ROUTES (UPDATED - NEW ENDPOINT ADDED)
// ============================================

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
        status: 'active',
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

// 🆕 NEW: Get all events (for venue dashboard)
app.get('/api/events', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('date', { ascending: false });
    
    if (error) throw error;
    
    res.json({ events: data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/events/host/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;
    
    // CRITICAL VALIDATION: Prevent loading all events
    if (!hostId || hostId === 'undefined' || hostId === 'null') {
      console.log('Invalid host ID received:', hostId);
      return res.json({ events: [] });
    }
    
    console.log('Loading events for host:', hostId);
    
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .eq('host_id', hostId)
      .is('deleted_by', null)
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

app.get('/api/events/venue/:venueId', async (req, res) => {
  try {
    const { venueId } = req.params;
    
    // CRITICAL VALIDATION: Prevent loading all events
    if (!venueId || venueId === 'undefined' || venueId === 'null') {
      console.log('Invalid venue ID received:', venueId);
      return res.json({ events: [] });
    }
    
    console.log('Loading events for venue:', venueId);
    
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .eq('venue_id', venueId)
      .is('deleted_by', null)
      .order('date', { ascending: false });
    
    if (error) throw error;
    
    console.log(`Found ${events?.length || 0} events for venue ${venueId}`);
    
    // Get guest counts for each event
    const eventsWithStats = await Promise.all(events.map(async (event) => {
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
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (!user || user.role !== 'admin') {
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
    
    const { data: event } = await supabase
      .from('events')
      .select('*')
      .eq('id', event_id)
      .single();
    
    // First create the guest WITHOUT qr_code
    const { data: guestData, error: insertError } = await supabase
      .from('guests')
      .insert([{
        event_id,
        name,
        email,
        phone,
        category: category || 'General',
        plus_ones: plus_ones || 0,
        is_walkin: is_walkin || false,
        qr_code: '', // Temporary empty
        checked_in: false
      }])
      .select()
      .single();
    
    if (insertError) throw insertError;
    
    // Now generate QR code with the ACTUAL guest ID
    const qrData = generateQRCode({ name, id: guestData.id }, event);
    
    // Update guest with proper QR code
    const { data, error } = await supabase
      .from('guests')
      .update({ qr_code: qrData })
      .eq('id', guestData.id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, guest: data });
  } catch (error) {
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
// INVITATION ROUTES
// ============================================

app.post('/api/invitations/send', async (req, res) => {
  try {
    const { event_id, channels } = req.body;
    
    const { data: event } = await supabase
      .from('events')
      .select('*')
      .eq('id', event_id)
      .single();
    
    const { data: guests } = await supabase
      .from('guests')
      .select('*')
      .eq('event_id', event_id);
    
    const results = {
      email: { sent: 0, failed: 0 },
      sms: { sent: 0, failed: 0 }
    };
    
    for (const guest of guests) {
      const qrCodeURL = getQRCodeURL(guest.qr_code);
      
      if (channels.email && guest.email) {
        const emailHTML = getInvitationEmailHTML(guest, event, qrCodeURL);
        const emailResult = await sendEmail(
          guest.email,
          `You're invited to ${event.name}`,
          emailHTML
        );
        if (emailResult.success) results.email.sent++;
        else results.email.failed++;
      }
      
      if (channels.sms && guest.phone) {
        const smsMessage = `You're invited to ${event.name} on ${event.date}! View your QR code: ${qrCodeURL}`;
        const smsResult = await sendSMS(guest.phone, smsMessage);
        if (smsResult.success) results.sms.sent++;
        else results.sms.failed++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    res.json({ success: true, results });
  } catch (error) {
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
// DELETE EVENT ENDPOINTS
// ============================================

// Soft delete event
app.patch('/api/events/:id/delete', async (req, res) => {
  try {
    const { deleted_by } = req.body;
    
    const { data, error } = await supabase
      .from('events')
      .update({ 
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

// Hard delete event
app.delete('/api/events/:id', async (req, res) => {
  try {
    // First delete all guests
    await supabase
      .from('guests')
      .delete()
      .eq('event_id', req.params.id);
    
    // Then delete event
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', req.params.id);
    
    if (error) throw error;
    
    res.json({ success: true });
  } catch (error) {
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
// TEST EMAIL ENDPOINT - FOR DEBUGGING
// ============================================
app.get('/api/test-email', async (req, res) => {
  console.log('\n🔍 EMAIL TEST STARTED');
  console.log('='.repeat(50));
  
  // Check environment variables
  console.log('Environment Check:');
  console.log('  SENDGRID_API_KEY:', SENDGRID_API_KEY ? '✅ SET (' + SENDGRID_API_KEY.substring(0, 10) + '...)' : '❌ MISSING');
  console.log('  SENDGRID_FROM_EMAIL:', process.env.SENDGRID_FROM_EMAIL || '❌ MISSING');
  
  if (!SENDGRID_API_KEY) {
    return res.json({
      success: false,
      error: 'SENDGRID_API_KEY not set in Railway environment variables',
      help: 'Go to Railway → Variables → Add SENDGRID_API_KEY'
    });
  }

  if (!process.env.SENDGRID_FROM_EMAIL) {
    return res.json({
      success: false,
      error: 'SENDGRID_FROM_EMAIL not set',
      help: 'Go to Railway → Variables → Add SENDGRID_FROM_EMAIL (e.g., noreply@yourdomain.com)'
    });
  }

  console.log('\n📧 Attempting to send test email...');
  
  try {
    const testEmail = req.query.to || 'test@example.com';
    console.log('  To:', testEmail);
    console.log('  From:', process.env.SENDGRID_FROM_EMAIL);
    
    const result = await sendEmail(
      testEmail,
      'Test Email from Event Check-In Pro',
      '<h1>🎉 Success!</h1><p>If you\'re reading this, SendGrid is working correctly!</p><p>Event Check-In Pro email system is operational.</p>'
    );
    
    console.log('\n✅ Test Result:', result);
    console.log('='.repeat(50));
    
    return res.json({
      success: result.success,
      message: result.success 
        ? 'Test email sent successfully! Check your inbox.' 
        : 'Failed to send email. Check logs above.',
      details: result,
      instructions: result.success 
        ? 'Email should arrive in 1-2 minutes. Check spam folder if not in inbox.'
        : 'Check Railway logs for detailed error message.'
    });
    
  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
    console.log('='.repeat(50));
    
    return res.json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ Supabase: ${SUPABASE_URL ? 'Configured' : 'Missing'}`);
  console.log(`✅ SendGrid: ${SENDGRID_API_KEY ? 'Configured' : 'Missing'}`);
  console.log(`✅ MSG91: ${MSG91_AUTH_KEY ? 'Configured' : 'Missing'}`);
});
