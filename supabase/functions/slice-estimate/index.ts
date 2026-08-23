// Supabase Edge Function: proxy STL slice requests to the home NAS (Tailscale Funnel).
// Browser → Supabase (public) → NAS slice API — avoids Private Network Access blocks.
// Deploy: supabase functions deploy slice-estimate
// Secrets: SLICE_API_URL, SLICE_API_KEY (same as slice-api/.env on OMV)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STL_BUCKET = 'stl-files';
const TEMP_PREFIX = 'slice-temp/';

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  let tempPath = '';

  try {
    const sliceUrl = (Deno.env.get('SLICE_API_URL') || '').replace(/\/$/, '');
    const sliceKey = Deno.env.get('SLICE_API_KEY') || '';
    if (!sliceUrl || !sliceKey || sliceKey === 'change-me') {
      throw new Error('SLICE_API_URL / SLICE_API_KEY not configured on Supabase');
    }

    const body = await req.json();
    tempPath = String(body.path || '').replace(/^\/+/, '');
    const material = String(body.material || 'PLA');
    const fileName = String(body.fileName || 'model.stl');

    if (!tempPath.startsWith(TEMP_PREFIX)) {
      throw new Error('Invalid storage path');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: blob, error: dlErr } = await supabase.storage.from(STL_BUCKET).download(tempPath);
    if (dlErr || !blob) {
      throw new Error(dlErr?.message || 'Could not read uploaded STL');
    }

    const form = new FormData();
    form.append('file', blob, fileName);
    form.append('material', material);

    const sliceRes = await fetch(`${sliceUrl}/estimate`, {
      method: 'POST',
      headers: { 'X-API-Key': sliceKey },
      body: form,
    });

    const sliceData = await sliceRes.json().catch(() => ({}));
    if (!sliceRes.ok) {
      const detail = sliceData.detail || sliceData.message || `Slice API ${sliceRes.status}`;
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }

    return json(200, sliceData);
  } catch (err) {
    let message = err instanceof Error ? err.message : String(err);
    if (/tls handshake|handshake eof|unexpected eof/i.test(message)) {
      message = 'Tailscale Funnel TLS failed from Supabase cloud. Set SLICE_API_URL to a Cloudflare Tunnel URL (slice.artblu.ro) — see slice-api/CLOUDFLARE-TUNNEL.md';
    }
    console.error('slice-estimate error:', message);
    return json(200, { error: message });
  } finally {
    if (tempPath.startsWith(TEMP_PREFIX)) {
      try {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        await supabase.storage.from(STL_BUCKET).remove([tempPath]);
      } catch (_) {
        /* ignore cleanup errors */
      }
    }
  }
});
