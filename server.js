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
  if (!SENDGRID_API_KEY) {
    console.error('⚠️ SendGrid not configured - skipping email');
    return { success: false, error: 'SendGrid not configured' };
  }

  try {
    const response = await axios.post(
      'https://api.sendgrid.com/v3/mail/send',
      {
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
      },
      {
        headers: {
          'Authorization': `Bearer ${SENDGRID_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return { success: true };
  } catch (error) {
    console.error('SendGrid Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

// ============================================
// SMS SERVICE - MSG91
// ============================================
async function sendSMS(phone, message) {
  if (!MSG91_AUTH_KEY || !MSG91_SENDER_ID) {
    console.error('⚠️ MSG91 not configured - skipping SMS');
    return { success: false, error: 'MSG91 not configured' };
  }

  try {
    const response = await axios.post(
      'https://api.msg91.com/api/v5/flow/',
      {
        sender: MSG91_SENDER_ID,
        route: '4',
        country: '91',
        sms: [{
          message: message,
          to: [phone.replace(/[^0-9]/g, '')]
        }]
      },
      {
        headers: {
          'authkey': MSG91_AUTH_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    return { success: true };
  } catch (error) {
    console.error('MSG91 Error:', error.response?.data || error.message);
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
    const { email, password, name, phone, role, venue_name } = req.body;
    
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password
    });
    
    if (authError) throw authError;
    
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert([{
        id: authData.user.id,
        email,
        name,
        phone,
        role,
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
    const { name, date, time_start, time_end, venue_name, venue_id, host_id, expected_guests } = req.body;
    
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
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('host_id', req.params.hostId)
      .order('date', { ascending: false });
    
    if (error) throw error;
    
    res.json({ events: data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/events/venue/:venueId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('venue_id', req.params.venueId)
      .order('date', { ascending: false });
    
    if (error) throw error;
    
    res.json({ events: data });
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
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ Supabase: ${SUPABASE_URL ? 'Configured' : 'Missing'}`);
  console.log(`✅ SendGrid: ${SENDGRID_API_KEY ? 'Configured' : 'Missing'}`);
  console.log(`✅ MSG91: ${MSG91_AUTH_KEY ? 'Configured' : 'Missing'}`);
});
