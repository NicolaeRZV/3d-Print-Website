// Supabase Edge Function: create Stripe Checkout Session for an order or custom print.
// Deploy: supabase functions deploy create-checkout
// Secrets: STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY (auto), SITE_URL

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import Stripe from 'https://esm.sh/stripe@14.25.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function num(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(v: unknown, fallback: boolean) {
  if (v === true || v === false) return v;
  return fallback;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY not set');

    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const kind = body.kind === 'custom' ? 'custom' : 'order';
    const recordId = String(body.id || '');
    if (!recordId) throw new Error('Missing id');

    const siteUrl = (Deno.env.get('SITE_URL') || body.siteUrl || '').replace(/\/$/, '');
    if (!siteUrl) throw new Error('SITE_URL not configured');

    const { data: settings } = await supabase.from('pricing_settings').select('*').eq('id', 1).maybeSingle();
    const shippingFlat = num(settings?.shipping_flat, 25);
    const shippingEasybox = num(settings?.shipping_easybox, 15);
    const freeOver = num(settings?.free_shipping_over, 250);
    const shippingFree = bool(settings?.shipping_free, false);

    let table = kind === 'custom' ? 'custom_prints' : 'orders';
    const { data: row, error } = await supabase.from(table).select('*').eq('id', recordId).single();
    if (error || !row) throw new Error('Order not found');

    if (row.payment_method !== 'card') {
      throw new Error('Not a card order');
    }
    if (row.payment_status === 'paid') {
      throw new Error('Already paid');
    }

    const goods = Number(kind === 'custom' ? (row.estimated_price ?? row.total ?? 0) : (row.subtotal ?? 0));
    const method = row.shipping_method === 'easybox' ? 'easybox' : 'home';
    const flat = method === 'easybox' ? shippingEasybox : shippingFlat;
    const shippingFee = shippingFree || goods >= freeOver ? 0 : flat;
    const codFee = 0;
    const total = Math.round((goods + shippingFee + codFee) * 100) / 100;
    if (total < 1) throw new Error('Total too small');

    await supabase.from(table).update({
      shipping_fee: shippingFee,
      cod_fee: codFee,
      total,
      payment_status: 'pending',
    }).eq('id', recordId);

    const label = kind === 'custom'
      ? `Print personalizat artblu (${recordId.slice(0, 8)})`
      : `Comandă artblu (${recordId.slice(0, 8)})`;

    const shipDesc = method === 'easybox' ? 'Easybox' : 'livrare acasă';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: row.customer_email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'ron',
            unit_amount: Math.round(total * 100),
            product_data: {
              name: label,
              description: shippingFee > 0
                ? `Produse ${goods.toFixed(2)} lei + ${shipDesc} ${shippingFee.toFixed(2)} lei`
                : `Produse ${goods.toFixed(2)} lei · livrare gratuită`,
            },
          },
        },
      ],
      metadata: {
        kind,
        record_id: recordId,
        shipping_method: method,
      },
      success_url: `${siteUrl}/checkout.html?checkout=success&kind=${kind}&id=${recordId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/checkout.html?checkout=cancel&kind=${kind}&id=${recordId}`,
    });

    await supabase.from(table).update({
      stripe_session_id: session.id,
    }).eq('id', recordId);

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id, total }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
