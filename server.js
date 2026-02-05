// ============================================
// EVENT CHECK-IN PRO - COMPLETE BACKEND API
// ============================================
// File: server.js
// This is your main backend server file

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
// ENVIRONMENT VARIABLES (Set these in Railway/Vercel)
// ============================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const MSG91_SENDER_ID = process.env.MSG91_SENDER_ID;
const INTERAKT_API_KEY = process.env.INTERAKT_API_KEY;

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// HELPER FUNCTIONS
// ============================================

// Generate unique QR code data
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

// Generate QR code image URL
function getQRCodeURL(qrData) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`;
}

// ============================================
// EMAIL SERVICE - SENDGRID
// ============================================
async function sendEmail(to, subject, htmlContent) {
  try {
    const response = await axios.post(
      'https://api.sendgrid.com/v3/mail/send',
      {
        personalizations: [{
          to: [{ email: to }],
          subject: subject
        }],
        from: {
          email: 'noreply@eventcheckin.com', // Change this to your verified sender
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
  try {
    // MSG91 API format
    const response = await axios.post(
      'https://api.msg91.com/api/v5/flow/',
      {
        sender: MSG91_SENDER_ID,
        route: '4', // Transactional route
        country: '91', // India - change if needed
        sms: [{
          message: message,
          to: [phone.replace('+', '').replace('-', '')]
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
// WHATSAPP SERVICE - INTERAKT
// ============================================
async function sendWhatsApp(phone, templateName, templateData, mediaUrl) {
  try {
    // Interakt API format
    const response = await axios.post(
      'https://api.interakt.ai/v1/public/message/',
      {
        countryCode: '+91', // Change based on your region
        phoneNumber: phone.replace('+', '').replace('-', ''),
        callbackData: 'event_invitation',
        type: 'Template',
        template: {
          name: templateName,
          languageCode: 'en',
          bodyValues: templateData,
          ...(mediaUrl && {
            headerValues: [mediaUrl]
          })
        }
      },
      {
        headers: {
          'Authorization': `Basic ${INTERAKT_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return { success: true };
  } catch (error) {
    console.error('Interakt Error:', error.response?.data || error.message);
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
  <title>Event Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">You're Invited!</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="font-size: 16px; color: #333; margin-bottom: 20px;">Hi <strong>${guest.name}</strong>,</p>
              
              <p style="font-size: 16px; color: #333; margin-bottom: 30px;">You're invited to:</p>
              
              <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin-bottom: 30px;">
                <h2 style="margin: 0 0 15px 0; color: #333; font-size: 24px;">${event.name}</h2>
                <p style="margin: 5px 0; color: #666;">📅 <strong>Date:</strong> ${event.date}</p>
                <p style="margin: 5px 0; color: #666;">🕐 <strong>Time:</strong> ${event.time_start} - ${event.time_end}</p>
                <p style="margin: 5px 0; color: #666;">📍 <strong>Venue:</strong> ${event.venue_name}</p>
                ${guest.category === 'VIP' ? '<p style="margin: 10px 0; color: #667eea; font-weight: bold;">⭐ VIP Access</p>' : ''}
                ${guest.plus_ones > 0 ? `<p style="margin: 5px 0; color: #666;">👥 <strong>Plus Ones:</strong> +${guest.plus_ones}</p>` : ''}
              </div>
              
              <!-- QR Code -->
              <div style="text-align: center; margin: 30px 0;">
                <p style="font-size: 16px; color: #333; margin-bottom: 15px;"><strong>Your Entry Pass:</strong></p>
                <img src="${qrCodeURL}" alt="QR Code" style="width: 250px; height: 250px; border: 3px solid #667eea; border-radius: 8px;" />
                <p style="font-size: 14px; color: #666; margin-top: 15px;">Show this QR code at the entrance</p>
              </div>
              
              <div style="background-color: #e8f5e9; border-radius: 6px; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; font-size: 14px; color: #2e7d32;">
                  ✓ Save this email<br>
                  ✓ Or take a screenshot of the QR code<br>
                  ✓ No need to print - show on your phone
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0; font-size: 12px; color: #999;">
                Powered by Event Check-In Pro<br>
                Questions? Reply to this email
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
  res.json({ status: 'OK', timestamp: new Date() });
});

// ============================================
// AUTH ROUTES
// ============================================

// Sign up
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name, phone, role, venue_name } = req.body;
    
    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password
    });
    
    if (authError) throw authError;
    
    // Create user profile
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

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) throw error;
    
    // Get user profile
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
// EVENT ROUTES
// ============================================

// Create event
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

// Get events for host
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

// Get events for venue
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

// Add guest to event
app.post('/api/guests', async (req, res) => {
  try {
    const { event_id, name, email, phone, category, plus_ones, is_walkin } = req.body;
    
    // Get event details
    const { data: event } = await supabase
      .from('events')
      .select('*')
      .eq('id', event_id)
      .single();
    
    // Generate QR code data
    const qrData = generateQRCode({ name, id: crypto.randomUUID() }, event);
    
    const { data, error } = await supabase
      .from('guests')
      .insert([{
        event_id,
        name,
        email,
        phone,
        category: category || 'General',
        plus_ones: plus_ones || 0,
        is_walkin: is_walkin || false,
        qr_code: qrData,
        checked_in: false
      }])
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, guest: data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get guests for event
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

// Check in guest
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

// Send invitations to all guests
app.post('/api/invitations/send', async (req, res) => {
  try {
    const { event_id, channels } = req.body; // channels: { email: true, sms: true, whatsapp: true }
    
    // Get event and guests
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
      sms: { sent: 0, failed: 0 },
      whatsapp: { sent: 0, failed: 0 }
    };
    
    // Send to each guest
    for (const guest of guests) {
      const qrCodeURL = getQRCodeURL(guest.qr_code);
      
      // Send Email
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
      
      // Send SMS
      if (channels.sms && guest.phone) {
        const smsMessage = `You're invited to ${event.name} on ${event.date}! View your QR code: ${qrCodeURL}`;
        const smsResult = await sendSMS(guest.phone, smsMessage);
        if (smsResult.success) results.sms.sent++;
        else results.sms.failed++;
      }
      
      // Send WhatsApp
      if (channels.whatsapp && guest.phone) {
        // Note: You need to create a template in Interakt dashboard first
        const whatsappResult = await sendWhatsApp(
          guest.phone,
          'event_invitation', // Template name - create this in Interakt
          [guest.name, event.name, event.date, event.time_start], // Template variables
          qrCodeURL // Header image
        );
        if (whatsappResult.success) results.whatsapp.sent++;
        else results.whatsapp.failed++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    res.json({ success: true, results });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Resend invitation to single guest
app.post('/api/invitations/resend/:guestId', async (req, res) => {
  try {
    const { channels } = req.body;
    
    // Get guest and event
    const { data: guest } = await supabase
      .from('guests')
      .select('*, events(*)')
      .eq('id', req.params.guestId)
      .single();
    
    const qrCodeURL = getQRCodeURL(guest.qr_code);
    const event = guest.events;
    
    const results = {};
    
    if (channels.email && guest.email) {
      const emailHTML = getInvitationEmailHTML(guest, event, qrCodeURL);
      results.email = await sendEmail(guest.email, `You're invited to ${event.name}`, emailHTML);
    }
    
    if (channels.sms && guest.phone) {
      const smsMessage = `You're invited to ${event.name} on ${event.date}! View your QR code: ${qrCodeURL}`;
      results.sms = await sendSMS(guest.phone, smsMessage);
    }
    
    if (channels.whatsapp && guest.phone) {
      results.whatsapp = await sendWhatsApp(
        guest.phone,
        'event_invitation',
        [guest.name, event.name, event.date, event.time_start],
        qrCodeURL
      );
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
  console.log(`✅ SendGrid: ${SENDGRID_API_KEY ? 'Configured' : 'Missing'}`);
  console.log(`✅ MSG91: ${MSG91_AUTH_KEY ? 'Configured' : 'Missing'}`);
  console.log(`✅ Interakt: ${INTERAKT_API_KEY ? 'Configured' : 'Missing'}`);
});
