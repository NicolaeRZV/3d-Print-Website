// Shipping / payment totals for artblu (RON).
// Defaults match payments.sql / checkout-shipping.sql.

(function (root) {
  const DEFAULTS = {
    shippingFlat: 25,
    shippingEasybox: 15,
    freeShippingOver: 250,
    codFee: 8,
    shippingFree: false
  };

  function num(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function bool(v, fallback) {
    if (v === true || v === false) return v;
    if (v === 'true' || v === 1 || v === '1') return true;
    if (v === 'false' || v === 0 || v === '0') return false;
    return fallback;
  }

  function shippingFromSettings(settings) {
    const s = settings || {};
    return {
      shippingFlat: num(s.shipping_flat ?? s.shippingFlat, DEFAULTS.shippingFlat),
      shippingEasybox: num(s.shipping_easybox ?? s.shippingEasybox, DEFAULTS.shippingEasybox),
      freeShippingOver: num(s.free_shipping_over ?? s.freeShippingOver, DEFAULTS.freeShippingOver),
      codFee: num(s.cod_fee ?? s.codFee, DEFAULTS.codFee),
      shippingFree: bool(s.shipping_free ?? s.shippingFree, DEFAULTS.shippingFree)
    };
  }

  function paymentsEnabledFromSettings(settings) {
    const s = settings || {};
    return bool(s.payments_enabled ?? s.paymentsEnabled, true);
  }

  function normalizeShippingMethod(method) {
    return method === 'easybox' ? 'easybox' : 'home';
  }

  function flatForMethod(cfg, shippingMethod) {
    return normalizeShippingMethod(shippingMethod) === 'easybox'
      ? cfg.shippingEasybox
      : cfg.shippingFlat;
  }

  /**
   * @param {number} subtotal print/products only
   * @param {'card'|'ramburs'} paymentMethod
   * @param {object} [settings] pricing_settings row
   * @param {'home'|'easybox'} [shippingMethod]
   */
  function calculateFulfillment(subtotal, paymentMethod, settings, shippingMethod) {
    const cfg = shippingFromSettings(settings);
    const method = normalizeShippingMethod(shippingMethod);
    const goods = Math.max(0, Number(subtotal) || 0);
    const flat = flatForMethod(cfg, method);
    const shippingFee = cfg.shippingFree || goods >= cfg.freeShippingOver ? 0 : flat;
    const codFee = paymentMethod === 'ramburs' ? cfg.codFee : 0;
    const total = +(goods + shippingFee + codFee).toFixed(2);
    return {
      subtotal: +goods.toFixed(2),
      shippingFee: +shippingFee.toFixed(2),
      codFee: +codFee.toFixed(2),
      total,
      freeShippingOver: cfg.freeShippingOver,
      shippingFlat: cfg.shippingFlat,
      shippingEasybox: cfg.shippingEasybox,
      shippingFree: cfg.shippingFree,
      shippingMethod: method,
      paymentMethod: paymentMethod === 'ramburs' ? 'ramburs' : 'card'
    };
  }

  function formatLei(n) {
    return Number(n || 0).toFixed(2).replace('.', ',') + ' lei';
  }

  function formatShippingLabel(settings, preferMethod) {
    const cfg = shippingFromSettings(settings);
    if (cfg.shippingFree) return 'Livrare gratuită';
    const method = normalizeShippingMethod(preferMethod || 'home');
    const flat = flatForMethod(cfg, method);
    const over = formatLei(cfg.freeShippingOver);
    if (method === 'easybox') {
      return `Easybox ${formatLei(flat)} (gratis peste ${over})`;
    }
    return `Livrare ${formatLei(flat)} (gratis peste ${over})`;
  }

  function composeEasyboxAddress(locker) {
    if (!locker) return 'Easybox';
    const bits = [locker.name, locker.address, locker.city, locker.county].filter(Boolean);
    return 'Easybox: ' + bits.join(', ');
  }

  root.ArtbluShipping = {
    DEFAULTS,
    shippingFromSettings,
    paymentsEnabledFromSettings,
    normalizeShippingMethod,
    flatForMethod,
    calculateFulfillment,
    formatLei,
    formatShippingLabel,
    composeEasyboxAddress
  };
})(typeof window !== 'undefined' ? window : globalThis);
