// This is the final, robust version of the donations.ts file.

// This import path is from the official Supabase documentation for Deno/Cloudflare.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// Define the structure for our environment variables
interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

// This is the main function that runs when your API is called.
export const onRequestGet: PagesFunction<Env> = async (context ) => {
  const { env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

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
    // Log the detailed error on the server for debugging
    console.error("Supabase fetch error:", error);
    
    // Send a generic error message to the client
    return new Response(JSON.stringify({ error: 'Failed to fetch data from the database.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

// Handle the OPTIONS pre-flight request separately
export const onRequestOptions: PagesFunction<Env> = async (context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  };
  return new Response(null, { headers: corsHeaders });
};
