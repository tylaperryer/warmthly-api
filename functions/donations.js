import { createClient } from '@supabase/supabase-js';

const allowedOrigins = [
  'https://www.warmthly.org',
  'https://mint.warmthly.org',
  'https://post.warmthly.org',
  'https://admin.warmthly.org',
];

export async function onRequest(context) {
  const { request, env } = context;

  const origin = request.headers.get('Origin') || '';
  const isAllowedOrigin = allowedOrigins.includes(origin);

  const corsHeaders = {
    'Access-Control-Allow-Origin': isAllowedOrigin ? origin : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method === 'GET') {
    try {
      if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
        console.error('[donations] Supabase not configured');
        return new Response(
          JSON.stringify({ error: { message: 'Database not configured.' } }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get('limit') || '1000', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      const category = url.searchParams.get('category');

      let query = supabase
        .from('donations')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + Math.min(limit, 1000) - 1);

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[donations] Supabase error:', error);
        return new Response(
          JSON.stringify({ error: { message: 'Failed to fetch donations from database.', code: 'DATABASE_ERROR' } }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Format response to match Airtable format for compatibility
      const records = (data || []).map((donation) => ({
        id: donation.transaction_id || donation.id,
        fields: {
          Amount: donation.amount,
          Currency: donation.currency,
          Donor: donation.donor,
          Purpose: donation.purpose,
          Category: donation.category,
          Date: donation.date || donation.created_at,
          'Transaction ID': donation.transaction_id || donation.id,
        },
        createdTime: donation.created_at || donation.date,
      }));

      return new Response(
        JSON.stringify({ records, offset }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (err) {
      console.error('[donations] Error:', err);
      return new Response(
        JSON.stringify({ error: { message: 'Failed to fetch donations.', code: 'DATABASE_ERROR' } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  if (request.method === 'POST') {
    try {
      if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
        console.error('[donations] Supabase not configured');
        return new Response(
          JSON.stringify({ error: { message: 'Database not configured.' } }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const body = await request.json();
      const { transactionId, amount, currency, donor, purpose, category, date } = body;

      if (!transactionId || !amount) {
        return new Response(
          JSON.stringify({ error: { message: 'transactionId and amount are required.', code: 'VALIDATION_ERROR' } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

      const { data, error } = await supabase
        .from('donations')
        .insert({
          transaction_id: transactionId,
          amount: parseFloat(String(amount)),
          currency: currency || 'ZAR',
          donor: donor || 'Anonymous',
          purpose: purpose || 'N/A',
          category: category || 'General',
          date: date ? new Date(date).toISOString() : new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') { // PostgreSQL unique violation
          return new Response(
            JSON.stringify({ error: { message: 'Donation with this transaction ID already exists.', code: 'DUPLICATE' } }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.error('[donations] Supabase error:', error);
        return new Response(
          JSON.stringify({ error: { message: 'Failed to create donation in database.', code: 'DATABASE_ERROR' } }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          id: data.transaction_id || data.id,
          fields: {
            Amount: data.amount,
            Currency: data.currency,
            Donor: data.donor,
            Purpose: data.purpose,
            Category: data.category,
            Date: data.date || data.created_at,
            'Transaction ID': data.transaction_id || data.id,
          },
          createdTime: data.created_at || data.date,
        }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (err) {
      console.error('[donations] Error creating donation:', err);
      return new Response(
        JSON.stringify({ error: { message: 'Failed to create donation.', code: 'DATABASE_ERROR' } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
}

