export interface Env {
    YOCO_SECRET_KEY: string;
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        // This is crucial to allow your main website to talk to this API
        const corsHeaders = {
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Origin': 'https://www.warmthly.org',
        };

        if (request.method === 'OPTIONS' ) {
            return new Response(null, { headers: corsHeaders });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
        }

        try {
            const { amount, currency } = await request.json();

            if (!amount || !currency) {
                return new Response('Missing amount or currency', { status: 400, headers: corsHeaders });
            }

            const yocoResponse = await fetch('https://online.yoco.com/v1/checkout/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${env.YOCO_SECRET_KEY}` // Using the secret key
                },
                body: JSON.stringify({
                    amount: amount,
                    currency: currency,
                    success_url: 'https://www.warmthly.org/payment-success',
                    cancel_url: 'https://www.warmthly.org/payment-cancelled'
                } ),
            });

            if (!yocoResponse.ok) {
                const errorBody = await yocoResponse.text();
                return new Response(`Yoco API error: ${errorBody}`, { status: yocoResponse.status, headers: corsHeaders });
            }

            const yocoData = await yocoResponse.json();

            return new Response(JSON.stringify({ id: yocoData.id }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });

        } catch (error) {
            return new Response('Internal Server Error', { status: 500, headers: corsHeaders });
        }
    },
};
