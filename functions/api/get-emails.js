import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const allowedOrigins = [
  'https://www.warmthly.org',
  'https://mint.warmthly.org',
  'https://post.warmthly.org',
  'https://admin.warmthly.org',
];

const MAX_EMAILS = 100;

export async function onRequest(context) {
  const { request, env } = context;

  const origin = request.headers.get('Origin') || '';
  const isAllowedOrigin = allowedOrigins.includes(origin);

  const corsHeaders = {
    'Access-Control-Allow-Origin': isAllowedOrigin ? origin : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  if (!isAllowedOrigin) {
    return new Response('Forbidden: Invalid origin', { status: 403 });
  }

  try {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: { message: 'Authentication required.' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.split(' ')[1];
    
    if (!env.JWT_SECRET) {
      console.error('[get-emails] JWT_SECRET is not configured');
      return new Response(
        JSON.stringify({ error: { message: 'Authentication system not configured.' } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    try {
      jwt.verify(token, env.JWT_SECRET);
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        console.error('[get-emails] JWT verification error:', error.message);
        return new Response(
          JSON.stringify({ error: { message: 'Invalid token.' } }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (error instanceof jwt.TokenExpiredError) {
        console.error('[get-emails] JWT expired:', error.message);
        return new Response(
          JSON.stringify({ error: { message: 'Token expired. Please log in again.' } }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw error;
    }

    // Get emails from Supabase
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      console.error('[get-emails] Supabase not configured');
      return new Response(
        JSON.stringify({ error: { message: 'Database not configured.' } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    
    const { data: emails, error: dbError } = await supabase
      .from('emails')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(MAX_EMAILS);

    if (dbError) {
      console.error('[get-emails] Supabase error:', dbError);
      return new Response(
        JSON.stringify({ error: { message: 'Failed to fetch emails.' } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(emails || []),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[get-emails] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: { message: 'Internal Server Error' } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

