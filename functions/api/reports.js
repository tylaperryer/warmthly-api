import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const allowedOrigins = [
  'https://www.warmthly.org',
  'https://mint.warmthly.org',
  'https://post.warmthly.org',
  'https://admin.warmthly.org',
];

const VALID_REPORT_TYPES = ['media', 'concern', 'admin', 'other'];
const MAX_MESSAGE_LENGTH = 5000;
const MAX_NAME_LENGTH = 200;

export async function onRequest(context) {
  const { request, env } = context;

  const origin = request.headers.get('Origin') || '';
  const isAllowedOrigin = allowedOrigins.includes(origin);

  const corsHeaders = {
    'Access-Control-Allow-Origin': isAllowedOrigin ? origin : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  if (!isAllowedOrigin) {
    return new Response('Forbidden: Invalid origin', { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, email, type, message } = body;

    // Validate name
    if (!name || typeof name !== 'string' || !name.trim()) {
      return new Response(
        JSON.stringify({ error: { message: 'Name is required.' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sanitizedName = name.trim().substring(0, MAX_NAME_LENGTH);
    if (sanitizedName.length === 0) {
      return new Response(
        JSON.stringify({ error: { message: 'Name cannot be empty.' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email
    if (!email || typeof email !== 'string') {
      return new Response(
        JSON.stringify({ error: { message: 'Email address is required.' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return new Response(
        JSON.stringify({ error: { message: 'Invalid email address format.' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate report type
    if (!type || typeof type !== 'string' || !VALID_REPORT_TYPES.includes(type)) {
      return new Response(
        JSON.stringify({ error: { message: `Invalid report type. Must be one of: ${VALID_REPORT_TYPES.join(', ')}.` } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate message
    if (!message || typeof message !== 'string' || !message.trim()) {
      return new Response(
        JSON.stringify({ error: { message: 'Message is required.' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sanitizedMessage = message.trim().substring(0, MAX_MESSAGE_LENGTH);
    if (sanitizedMessage.length === 0) {
      return new Response(
        JSON.stringify({ error: { message: 'Message cannot be empty.' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store report in Supabase
    if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
      try {
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
        await supabase.from('reports').insert({
          name: sanitizedName,
          email: email.trim(),
          type,
          message: sanitizedMessage,
        });
      } catch (dbError) {
        console.error('[reports] Failed to store report in Supabase:', dbError);
        // Continue even if DB storage fails
      }
    }

    // Send email notification if Resend is configured
    const adminEmail = env.ADMIN_EMAIL || 'desk@warmthly.org';
    const resendApiKey = env.RESEND_API_KEY;
    
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        const reportTypeLabels = {
          media: 'Media Inquiry',
          concern: 'Concern or Complaint',
          admin: 'Administrative Issue',
          other: 'Other',
        };
        const reportTypeLabel = reportTypeLabels[type] || type;
        const emailSubject = `[Warmthly Report] ${reportTypeLabel} from ${sanitizedName}`;
        const emailHtml = `
          <h2>New Report Submitted</h2>
          <p><strong>Type:</strong> ${reportTypeLabel}</p>
          <p><strong>From:</strong> ${sanitizedName} (${email.trim()})</p>
          <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
          <hr>
          <h3>Message:</h3>
          <p style="white-space: pre-wrap;">${sanitizedMessage.replace(/\n/g, '<br>')}</p>
        `;

        await resend.emails.send({
          from: 'The Warmthly Desk <desk@warmthly.org>',
          to: [adminEmail],
          subject: emailSubject,
          html: emailHtml,
          replyTo: email.trim(),
        });
      } catch (emailError) {
        console.error('[reports] Error sending email notification:', emailError);
        // Continue even if email fails
      }
    }

    return new Response(
      JSON.stringify({ message: 'Report submitted successfully. We will review it promptly.' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[reports] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: { message: 'Internal Server Error' } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

