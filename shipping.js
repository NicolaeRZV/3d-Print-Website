// Shipping / payment totals for artblu (RON).
// Defaults match payments.sql — safe if pricing_settings row is missing columns.

(function (root) {
  const DEFAULTS = {
    shippingFlat: 25,
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
      freeShippingOver: num(s.free_shipping_over ?? s.freeShippingOver, DEFAULTS.freeShippingOver),
      codFee: num(s.cod_fee ?? s.codFee, DEFAULTS.codFee),
      shippingFree: bool(s.shipping_free ?? s.shippingFree, DEFAULTS.shippingFree)
    };
  }

  function paymentsEnabledFromSettings(settings) {
    const s = settings || {};
    return bool(s.payments_enabled ?? s.paymentsEnabled, true);
  }

  /**
   * @param {number} subtotal print/products only
   * @param {'card'|'ramburs'} paymentMethod
   * @param {object} [settings] pricing_settings row
   */
  function calculateFulfillment(subtotal, paymentMethod, settings) {
    const cfg = shippingFromSettings(settings);
    const goods = Math.max(0, Number(subtotal) || 0);
    const shippingFee = cfg.shippingFree || goods >= cfg.freeShippingOver ? 0 : cfg.shippingFlat;
    const codFee = paymentMethod === 'ramburs' ? cfg.codFee : 0;
    const total = +(goods + shippingFee + codFee).toFixed(2);
    return {
      subtotal: +goods.toFixed(2),
      shippingFee: +shippingFee.toFixed(2),
      codFee: +codFee.toFixed(2),
      total,
      freeShippingOver: cfg.freeShippingOver,
      shippingFlat: cfg.shippingFlat,
      shippingFree: cfg.shippingFree,
      paymentMethod: paymentMethod === 'ramburs' ? 'ramburs' : 'card'
    };
  }

  function formatLei(n) {
    return Number(n || 0).toFixed(2).replace('.', ',') + ' lei';
  }

  root.ArtbluShipping = {
    DEFAULTS,
    shippingFromSettings,
    paymentsEnabledFromSettings,
    calculateFulfillment,
    formatLei
  };
})(typeof window !== 'undefined' ? window : globalThis);
