import { Resend } from 'resend';

const allowedOrigins = [
  'https://www.warmthly.org',
  'https://mint.warmthly.org',
  'https://post.warmthly.org',
  'https://admin.warmthly.org',
];

const MAX_SUBJECT_LENGTH = 200;

function isEmptyHTML(html) {
  if (!html || typeof html !== 'string') {
    return true;
  }
  
  const trimmed = html.trim();
  if (!trimmed) {
    return true;
  }
  
  const emptyPatterns = [
    /^<p>\s*<\/p>$/i,
    /^<p><br\s*\/?><\/p>$/i,
    /^<p>\s*<br\s*\/?>\s*<\/p>$/i,
    /^<p>&nbsp;<\/p>$/i,
    /^<p>\s*&nbsp;\s*<\/p>$/i,
  ];
  
  return emptyPatterns.some(pattern => pattern.test(trimmed));
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

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
    if (!env.RESEND_API_KEY) {
      console.error('[send-email] RESEND_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: { message: 'Email service is not configured. Please contact the administrator.' } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { to, subject, html } = body;

    if (!to || typeof to !== 'string') {
      return new Response(
        JSON.stringify({ error: { message: 'Recipient email address is required.' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isValidEmail(to)) {
      return new Response(
        JSON.stringify({ error: { message: 'Invalid email address format.' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return new Response(
        JSON.stringify({ error: { message: 'Email subject is required.' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (isEmptyHTML(html || '')) {
      return new Response(
        JSON.stringify({ error: { message: 'Email body cannot be empty.' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sanitizedSubject = subject.trim().substring(0, MAX_SUBJECT_LENGTH);

    const resend = new Resend(env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: 'The Warmthly Desk <desk@warmthly.org>',
      to: [to.trim()],
      subject: sanitizedSubject,
      html: html || '',
    });

    if (error) {
      console.error('[send-email] Resend API error:', error);
      return new Response(
        JSON.stringify({ error: { message: error.message || 'Failed to send email. Please try again.' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ message: 'Email sent successfully!', data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[send-email] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: { message: 'Internal Server Error. Please try again later.' } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

