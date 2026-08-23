/* artblu checkout page — cart + custom print drafts */
(function () {
  const SUPABASE_URL = 'https://tilfngrtldwevtiilxpq.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_A3fpQb9LjJb8XySpIJyJeg_gcjPOs3m';
  const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1519356166361317468/Ilh0PQe-o14uePV9lorCGHEBM86kpYsM5TVmLuJ3gHSc5pZ1w3lcFKOkMeyeKIy18FV1';
  const CART_STORAGE_KEY = 'artblu_cart_v1';

  // Sameday Locker Plugin — fill after Sameday issues credentials (see supabase/SAMEDAY-SETUP.md)
  const SAMEDAY_CLIENT_ID = '';
  const SAMEDAY_API_USERNAME = '';
  const SAMEDAY_DEFAULT_CITY = 'Bucuresti';
  const SAMEDAY_DEFAULT_COUNTY = 'Bucuresti';

  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let pricingSettings = null;
  let selectedLocker = null;
  let lockerPluginReady = false;
  let checkoutKind = 'cart';
  let customDraft = null;
  let cartItems = [];

  function $(id) { return document.getElementById(id); }

  function fmt(n) {
    return (Number(n) || 0).toFixed(2).replace('.', ',') + ' lei';
  }

  function showToast(msg, isError) {
    const stack = $('toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'checkout-toast' + (isError ? ' error' : '');
    el.textContent = msg;
    stack.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 220);
    }, 2800);
  }

  function paymentsEnabled() {
    return window.ArtbluShipping
      ? window.ArtbluShipping.paymentsEnabledFromSettings(pricingSettings)
      : true;
  }

  function paymentsDisabledMessage() {
    return 'artblu este încă în lucru. Plățile nu sunt disponibile momentan. Contact: contact@artblu.ro';
  }

  function getShipMethod() {
    const el = document.querySelector('input[name="ship-method"]:checked');
    return el && el.value === 'easybox' ? 'easybox' : 'home';
  }

  function getPayMethod() {
    const el = document.querySelector('input[name="co-pay"]:checked');
    return el && el.value === 'ramburs' ? 'ramburs' : 'card';
  }

  function getSubtotal() {
    if (checkoutKind === 'custom' && customDraft) {
      return Number(customDraft.estimated_price) || 0;
    }
    return cartItems.reduce((s, it) => s + (Number(it.unitPrice) || 0) * (Number(it.qty) || 0), 0);
  }

  function fulfillment() {
    const shipApi = window.ArtbluShipping;
    const sub = getSubtotal();
    const pay = getPayMethod();
    const method = getShipMethod();
    if (!shipApi) {
      const flat = method === 'easybox' ? 15 : 25;
      const shippingFee = sub >= 250 ? 0 : flat;
      const codFee = pay === 'ramburs' ? 8 : 0;
      return { subtotal: sub, shippingFee, codFee, total: +(sub + shippingFee + codFee).toFixed(2), shippingMethod: method, paymentMethod: pay };
    }
    return shipApi.calculateFulfillment(sub, pay, pricingSettings, method);
  }

  function loadCartFromStorage() {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return [];
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return [];
      return Object.keys(obj).map(id => {
        const e = obj[id] || {};
        return {
          product_id: id,
          name: e.name || id,
          qty: Number(e.qty) || 1,
          unitPrice: Number(e.unitPrice) || 0,
          colorName: e.colorName || null,
          size: e.size || null
        };
      }).filter(it => it.qty > 0);
    } catch (_) {
      return [];
    }
  }

  function clearCartStorage() {
    localStorage.removeItem(CART_STORAGE_KEY);
  }

  function renderSummary() {
    const list = $('summary-items');
    const lines = $('summary-lines');
    if (!list || !lines) return;
    if (checkoutKind === 'custom' && customDraft) {
      const files = Array.isArray(customDraft.files) ? customDraft.files : [];
      const label = files.length > 1
        ? files.length + ' modele personalizate'
        : (customDraft.file_name || 'Print personalizat');
      list.innerHTML = `<li><div><span class="name">${escapeHtml(label)}</span><span class="meta">${escapeHtml(customDraft.material || '')}${customDraft.color_name ? ' · ' + escapeHtml(customDraft.color_name) : ''}</span></div><span>${fmt(customDraft.estimated_price)}</span></li>`;
    } else {
      list.innerHTML = cartItems.map(it => {
        const meta = [it.colorName, it.size].filter(Boolean).join(', ');
        return `<li><div><span class="name">${escapeHtml(it.name)}</span>${meta ? `<span class="meta">${escapeHtml(meta)} · ×${it.qty}</span>` : `<span class="meta">×${it.qty}</span>`}</div><span>${fmt(it.unitPrice * it.qty)}</span></li>`;
      }).join('');
    }
    const f = fulfillment();
    const shipLabel = f.shippingFee === 0
      ? 'Livrare (gratuită)'
      : (f.shippingMethod === 'easybox' ? 'Livrare Easybox' : 'Livrare acasă');
    lines.innerHTML = `
      <div class="summary-line"><span>Produse / print</span><span>${fmt(f.subtotal)}</span></div>
      <div class="summary-line"><span>${shipLabel}</span><span>${fmt(f.shippingFee)}</span></div>
      ${f.codFee > 0 ? `<div class="summary-line"><span>Taxă ramburs</span><span>${fmt(f.codFee)}</span></div>` : ''}
      <div class="summary-line total"><span>Total</span><span>${fmt(f.total)}</span></div>`;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function updateShipPanels() {
    const method = getShipMethod();
    const home = $('ship-home-fields');
    const easy = $('ship-easybox-fields');
    if (home) home.hidden = method !== 'home';
    if (easy) easy.hidden = method !== 'easybox';
    const addr = $('co-address');
    const city = $('co-city');
    const county = $('co-county');
    if (addr) addr.required = method === 'home';
    if (city) city.required = method === 'home';
    if (county) county.required = method === 'home';
    renderSummary();
  }

  function updateShipHints() {
    const cfg = window.ArtbluShipping
      ? window.ArtbluShipping.shippingFromSettings(pricingSettings)
      : { shippingFlat: 25, shippingEasybox: 15, shippingFree: false, freeShippingOver: 250 };
    const homeHint = $('ship-home-hint');
    const easyHint = $('ship-easybox-hint');
    if (cfg.shippingFree) {
      if (homeHint) homeHint.textContent = 'Livrare gratuită';
      if (easyHint) easyHint.textContent = 'Livrare gratuită · locker Sameday';
      return;
    }
    if (homeHint) homeHint.textContent = `Curier · ${fmt(cfg.shippingFlat)} (gratis peste ${fmt(cfg.freeShippingOver)})`;
    if (easyHint) easyHint.textContent = `Locker · ${fmt(cfg.shippingEasybox)} (gratis peste ${fmt(cfg.freeShippingOver)})`;
  }

  function applyPaymentsUi() {
    const enabled = paymentsEnabled();
    $('co-payments-wip')?.classList.toggle('visible', !enabled);
    $('co-pay-options')?.classList.toggle('is-disabled', !enabled);
    document.querySelectorAll('#co-pay-options input').forEach(inp => { inp.disabled = !enabled; });
    const btn = $('co-submit');
    if (btn) {
      btn.disabled = !enabled;
      btn.textContent = enabled ? 'Plasează comanda' : 'Plăți indisponibile';
    }
  }

  function samedayConfigured() {
    return !!(SAMEDAY_CLIENT_ID && SAMEDAY_API_USERNAME && window.LockerPlugin);
  }

  function initLockerPlugin() {
    if (!samedayConfigured()) return;
    try {
      window.LockerPlugin.init({
        clientId: SAMEDAY_CLIENT_ID,
        apiUsername: SAMEDAY_API_USERNAME,
        countryCode: 'RO',
        langCode: 'ro',
        city: SAMEDAY_DEFAULT_CITY,
        county: SAMEDAY_DEFAULT_COUNTY,
        theme: 'light',
        filters: [{ showLockers: true }, { showPudos: false }],
        initialMapCenter: 'City'
      });
      const plugin = window.LockerPlugin.getInstance();
      plugin.subscribe(msg => {
        if (!msg || !msg.lockerId) return;
        selectedLocker = {
          lockerId: String(msg.lockerId),
          name: msg.name || ('Easybox #' + msg.lockerId),
          address: msg.address || '',
          city: msg.city || '',
          county: msg.county || '',
          postalCode: msg.postalCode || ''
        };
        const box = $('locker-picked');
        if (box) box.hidden = false;
        if ($('locker-name')) $('locker-name').textContent = selectedLocker.name;
        if ($('locker-address')) {
          $('locker-address').textContent = [selectedLocker.address, selectedLocker.city, selectedLocker.county]
            .filter(Boolean).join(', ');
        }
        try { plugin.close(); } catch (_) {}
        showToast('Easybox selectat');
      });
      lockerPluginReady = true;
    } catch (err) {
      console.error('Locker plugin init failed', err);
      lockerPluginReady = false;
    }
  }

  function openLockerMap() {
    if (!samedayConfigured()) {
      showToast('Easybox: configurează SAMEDAY_CLIENT_ID + SAMEDAY_API_USERNAME în checkout.js (vezi SAMEDAY-SETUP.md).', true);
      return;
    }
    if (!lockerPluginReady) initLockerPlugin();
    try {
      const plugin = window.LockerPlugin.getInstance();
      const city = ($('co-city')?.value || '').trim() || SAMEDAY_DEFAULT_CITY;
      const county = ($('co-county')?.value || '').trim() || SAMEDAY_DEFAULT_COUNTY;
      if (typeof plugin.reinitializePlugin === 'function') {
        plugin.reinitializePlugin({
          clientId: SAMEDAY_CLIENT_ID,
          apiUsername: SAMEDAY_API_USERNAME,
          countryCode: 'RO',
          langCode: 'ro',
          city,
          county,
          theme: 'light',
          filters: [{ showLockers: true }, { showPudos: false }],
          initialMapCenter: 'City'
        });
      }
      plugin.open();
    } catch (err) {
      console.error(err);
      showToast('Nu am putut deschide harta Easybox.', true);
    }
  }

  async function loadPricing() {
    try {
      pricingSettings = await BambuPricing.loadSettingsFromDb(supabaseClient);
    } catch (_) {
      pricingSettings = { ...BambuPricing.DEFAULT_SETTINGS };
    }
    updateShipHints();
    applyPaymentsUi();
    renderSummary();
  }

  async function loadCustomDraft(id) {
    const { data, error } = await supabaseClient
      .from('custom_prints')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Comanda personalizată nu există.');
    const st = String(data.status || '').toLowerCase();
    if (st === 'completed' || st === 'done' || data.payment_status === 'paid') {
      throw new Error('Această comandă a fost deja finalizată.');
    }
    customDraft = data;
    if ($('co-name') && data.customer_name) $('co-name').value = data.customer_name;
    if ($('co-email') && data.customer_email) $('co-email').value = data.customer_email;
    if ($('co-phone') && data.customer_phone) $('co-phone').value = data.customer_phone;
    $('checkout-lead').textContent = 'Finalizează livrarea și plata pentru printul personalizat.';
    $('co-back').href = 'index.html#configure';
  }

  function buildHomeAddress() {
    const street = ($('co-address')?.value || '').trim();
    const city = ($('co-city')?.value || '').trim();
    const county = ($('co-county')?.value || '').trim();
    return [street, city, county].filter(Boolean).join(', ');
  }

  function shippingPayload() {
    const method = getShipMethod();
    if (method === 'easybox') {
      if (!selectedLocker) throw new Error('Alege un Easybox pe hartă.');
      const address = window.ArtbluShipping
        ? window.ArtbluShipping.composeEasyboxAddress(selectedLocker)
        : ('Easybox: ' + selectedLocker.name);
      return {
        shipping_method: 'easybox',
        customer_address: address,
        locker_id: selectedLocker.lockerId,
        locker_name: selectedLocker.name,
        locker_address: selectedLocker.address || null,
        locker_city: selectedLocker.city || null,
        locker_county: selectedLocker.county || null
      };
    }
    const address = buildHomeAddress();
    if (!address || address.length < 8) throw new Error('Completează adresa de livrare.');
    return {
      shipping_method: 'home',
      customer_address: address,
      locker_id: null,
      locker_name: null,
      locker_address: null,
      locker_city: null,
      locker_county: null
    };
  }

  async function startStripeCheckout(kind, id) {
    let base = window.location.origin;
    const path = window.location.pathname;
    if (path.endsWith('.html')) base += path.replace(/\/[^/]+$/, '');
    else if (path !== '/') base += path.replace(/\/$/, '');
    const { data, error } = await supabaseClient.functions.invoke('create-checkout', {
      body: { kind, id, siteUrl: base }
    });
    if (error) throw new Error(error.message || 'Nu am putut deschide plata Stripe');
    if (data?.error) throw new Error(data.error);
    if (!data?.url) throw new Error('Lipsește URL-ul Stripe Checkout');
    window.location.href = data.url;
  }

  function sendDiscord(payload) {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(DISCORD_WEBHOOK_URL, blob);
    } catch (_) {}
  }

  function discordOrderEmbed(order, orderId) {
    const ship = order.shipping_method === 'easybox'
      ? `Easybox · ${order.locker_name || order.locker_id || '—'}`
      : 'La adresă';
    const itemLines = (order.items || []).map(item => {
      const variantBits = [];
      if (item.color) variantBits.push(item.color);
      if (item.size) variantBits.push(item.size);
      const variant = variantBits.length ? ` (${variantBits.join(', ')})` : '';
      return `• ${item.qty}× ${item.name}${variant} — ${fmt(item.line_total)}`;
    });
    return {
      username: 'artblu Comenzi',
      embeds: [{
        title: 'Comandă nouă',
        color: 0xFF7A1F,
        fields: [
          { name: 'Client', value: order.customer_name, inline: true },
          { name: 'Email', value: order.customer_email, inline: true },
          { name: 'Telefon', value: order.customer_phone || '—', inline: true },
          { name: 'Livrare', value: ship, inline: true },
          { name: 'Adresă', value: order.customer_address },
          { name: 'Plată', value: `${order.payment_method} · ${order.payment_status}`, inline: true },
          { name: 'Produse', value: itemLines.join('\n') || '—' },
          { name: 'Total', value: fmt(order.total), inline: true },
          { name: 'ID', value: orderId, inline: true }
        ],
        timestamp: new Date().toISOString()
      }]
    };
  }

  function discordCustomEmbed(row) {
    const ship = row.shipping_method === 'easybox'
      ? `Easybox · ${row.locker_name || row.locker_id || '—'}`
      : 'La adresă';
    return {
      username: 'artblu Printuri',
      embeds: [{
        title: 'Print personalizat — checkout finalizat',
        color: 0x2553F2,
        fields: [
          { name: 'Client', value: row.customer_name, inline: true },
          { name: 'Email', value: row.customer_email, inline: true },
          { name: 'Telefon', value: row.customer_phone || '—', inline: true },
          { name: 'Livrare', value: ship, inline: true },
          { name: 'Adresă', value: row.customer_address || '—' },
          { name: 'Plată', value: `${row.payment_method} · ${row.payment_status}`, inline: true },
          { name: 'Total', value: fmt(row.total), inline: true },
          { name: 'ID', value: row.id, inline: true }
        ],
        timestamp: new Date().toISOString()
      }]
    };
  }

  async function placeCartOrder(customer, ship, paymentMethod) {
    const f = fulfillment();
    const orderId = crypto.randomUUID();
    const user = typeof getCurrentUser === 'function' ? await getCurrentUser() : null;
    const items = cartItems.map(it => ({
      product_id: it.product_id,
      name: it.name,
      qty: it.qty,
      unit_price: it.unitPrice,
      line_total: +(it.unitPrice * it.qty).toFixed(2),
      color: it.colorName || null,
      size: it.size || null
    }));
    const order = {
      id: orderId,
      user_id: user?.id || null,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone || null,
      customer_address: ship.customer_address,
      items,
      subtotal: f.subtotal,
      shipping_fee: f.shippingFee,
      cod_fee: f.codFee,
      total: f.total,
      payment_method: paymentMethod,
      payment_status: paymentMethod === 'ramburs' ? 'unpaid_cod' : 'pending',
      status: paymentMethod === 'ramburs' ? 'new' : 'pending_payment',
      shipping_method: ship.shipping_method,
      locker_id: ship.locker_id,
      locker_name: ship.locker_name,
      locker_address: ship.locker_address,
      locker_city: ship.locker_city,
      locker_county: ship.locker_county
    };
    const { error } = await supabaseClient.from('orders').insert(order);
    if (error) throw error;
    sendDiscord(discordOrderEmbed(order, orderId));
    if (paymentMethod === 'card') {
      await startStripeCheckout('order', orderId);
      return orderId;
    }
    clearCartStorage();
    return orderId;
  }

  async function completeCustomCheckout(customer, ship, paymentMethod) {
    const f = fulfillment();
    const patch = {
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone || null,
      customer_address: ship.customer_address,
      shipping_fee: f.shippingFee,
      cod_fee: f.codFee,
      total: f.total,
      payment_method: paymentMethod,
      payment_status: paymentMethod === 'ramburs' ? 'unpaid_cod' : 'pending',
      status: paymentMethod === 'card' ? 'pending_payment' : 'quoted',
      shipping_method: ship.shipping_method,
      locker_id: ship.locker_id,
      locker_name: ship.locker_name,
      locker_address: ship.locker_address,
      locker_city: ship.locker_city,
      locker_county: ship.locker_county
    };
    const { data, error } = await supabaseClient
      .from('custom_prints')
      .update(patch)
      .eq('id', customDraft.id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Nu am putut actualiza comanda. Rulează supabase/checkout-shipping.sql');
    sendDiscord(discordCustomEmbed(data));
    if (paymentMethod === 'card') {
      await startStripeCheckout('custom', customDraft.id);
      return customDraft.id;
    }
    return customDraft.id;
  }

  async function onSubmit(e) {
    e.preventDefault();
    const errEl = $('co-error');
    if (errEl) errEl.textContent = '';
    if (!paymentsEnabled()) {
      if (errEl) errEl.textContent = paymentsDisabledMessage();
      return;
    }
    const customer = {
      name: ($('co-name')?.value || '').trim(),
      email: ($('co-email')?.value || '').trim(),
      phone: ($('co-phone')?.value || '').trim()
    };
    if (!customer.name || !customer.email || !customer.phone) {
      if (errEl) errEl.textContent = 'Completează nume, email și telefon.';
      return;
    }
    let ship;
    try {
      ship = shippingPayload();
    } catch (err) {
      if (errEl) errEl.textContent = err.message;
      return;
    }
    const paymentMethod = getPayMethod();
    const btn = $('co-submit');
    if (btn) { btn.disabled = true; btn.textContent = paymentMethod === 'card' ? 'Mergem la plată…' : 'Se trimite…'; }
    try {
      await loadPricing();
      let id;
      if (checkoutKind === 'custom') {
        id = await completeCustomCheckout(customer, ship, paymentMethod);
      } else {
        if (!cartItems.length) throw new Error('Coșul este gol.');
        id = await placeCartOrder(customer, ship, paymentMethod);
      }
      if (paymentMethod === 'ramburs') {
        showToast('Comandă trimisă! ID: ' + String(id).slice(0, 8) + '…');
        setTimeout(() => { window.location.href = 'account.html'; }, 900);
      }
    } catch (err) {
      console.error(err);
      if (errEl) errEl.textContent = err.message || 'Nu am putut plasa comanda.';
      if (btn) { btn.disabled = false; btn.textContent = 'Plasează comanda'; }
    }
  }

  function handleReturnParams() {
    const params = new URLSearchParams(window.location.search);
    const state = params.get('checkout');
    if (!state) return;
    const kind = params.get('kind') || 'cart';
    const id = params.get('id');
    if (state === 'success') {
      clearCartStorage();
      showToast('Plata a reușit! Comanda ta este înregistrată.');
      window.history.replaceState({}, '', 'checkout.html');
      setTimeout(() => { window.location.href = 'account.html'; }, 700);
      return;
    }
    if (state === 'cancel') showToast('Plata a fost anulată. Poți încerca din nou.', true);
    let clean = 'checkout.html?kind=' + encodeURIComponent(kind);
    if (kind === 'custom' && id) clean += '&id=' + encodeURIComponent(id);
    window.history.replaceState({}, '', clean);
  }

  async function boot() {
    handleReturnParams();
    const params = new URLSearchParams(window.location.search);
    checkoutKind = params.get('kind') === 'custom' ? 'custom' : 'cart';
    await loadPricing();

    document.querySelectorAll('input[name="ship-method"]').forEach(el => {
      el.addEventListener('change', updateShipPanels);
    });
    document.querySelectorAll('input[name="co-pay"]').forEach(el => {
      el.addEventListener('change', renderSummary);
    });
    $('open-locker-btn')?.addEventListener('click', openLockerMap);
    $('checkout-page-form')?.addEventListener('submit', onSubmit);

    if (typeof getCurrentUser === 'function') {
      try {
        const user = await getCurrentUser();
        if (user) {
          if ($('co-name') && ! $('co-name').value && user.user_metadata?.full_name) {
            $('co-name').value = user.user_metadata.full_name;
          }
          if ($('co-email') && !$('co-email').value && user.email) {
            $('co-email').value = user.email;
          }
        }
      } catch (_) {}
    }

    try {
      if (checkoutKind === 'custom') {
        const id = params.get('id');
        if (!id) throw new Error('Lipsește ID-ul comenzii personalizate.');
        await loadCustomDraft(id);
      } else {
        cartItems = loadCartFromStorage();
        if (!cartItems.length) {
          showToast('Coșul este gol.', true);
          setTimeout(() => { window.location.href = 'index.html'; }, 800);
          return;
        }
        $('checkout-lead').textContent = 'Produse din coș · alege livrarea și plata.';
      }
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Checkout invalid.', true);
      setTimeout(() => { window.location.href = 'index.html'; }, 1000);
      return;
    }

    updateShipPanels();
    renderSummary();
    if (samedayConfigured()) initLockerPlugin();
  }

  boot();
})();
