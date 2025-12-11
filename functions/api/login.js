import jwt from 'jsonwebtoken';

const allowedOrigins = [
  'https://www.warmthly.org',
  'https://mint.warmthly.org',
  'https://post.warmthly.org',
  'https://admin.warmthly.org',
];

function constantTimeCompare(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
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
    const body = await request.json();
    const { password } = body;

    if (!env.ADMIN_PASSWORD) {
      console.error('[login] ADMIN_PASSWORD is not configured');
      return new Response(
        JSON.stringify({ error: { message: 'Admin password not configured.' } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!env.JWT_SECRET) {
      console.error('[login] JWT_SECRET is not configured');
      return new Response(
        JSON.stringify({ error: { message: 'Authentication system not configured.' } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (constantTimeCompare(password || '', env.ADMIN_PASSWORD)) {
      const token = jwt.sign(
        { user: 'admin' },
        env.JWT_SECRET,
        { expiresIn: '8h' }
      );

      return new Response(
        JSON.stringify({ token }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ error: { message: 'Incorrect password' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('[login] Error:', error);
    return new Response(
      JSON.stringify({ error: { message: 'Internal Server Error' } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

