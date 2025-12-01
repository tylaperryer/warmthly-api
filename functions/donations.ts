// functions/donations.ts

// This is the Supabase client library.
import { createClient } from '@supabase/supabase-js';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // Or lock to 'https://www.warmthly.org'
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (context.request.method === 'OPTIONS' ) {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Connect to your Supabase database using the secrets.
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

    // Fetch all rows from your "Donations" table.
    const { data, error } = await supabase.from('Donations').select('*');

    if (error) {
      throw error;
    }

    // Send the data back to the frontend.
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};
