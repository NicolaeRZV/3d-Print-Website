(function (root) {
  const EFFECTS = [
    { id: 'glow', label: 'Glow in the dark' },
    { id: 'wood', label: 'Wood' },
    { id: 'silver', label: 'Silver / silk' },
    { id: 'matte', label: 'Matte' }
  ];

  const DEFAULT_COLORS_PLA = [
    { id: 'white', name: 'Alb', type: 'solid', hex: '#F2F1ED', effects: [] },
    { id: 'black', name: 'Negru', type: 'solid', hex: '#1C1C1E', effects: [] },
    { id: 'red', name: 'Roșu', type: 'solid', hex: '#D62839', effects: [] },
    { id: 'blue', name: 'Albastru', type: 'solid', hex: '#2553F2', effects: [] },
    { id: 'green', name: 'Verde', type: 'solid', hex: '#2E8B57', effects: [] },
    { id: 'glow-green', name: 'Verde fosforescent', type: 'solid', hex: '#B8F56A', effects: ['glow'] },
    { id: 'wood-brown', name: 'Wood filament', type: 'solid', hex: '#8B5A2B', effects: ['wood'] },
    { id: 'silk-silver', name: 'Silver silk', type: 'solid', hex: '#C0C0C0', effects: ['silver'] },
    { id: 'matte-black', name: 'Negru mat', type: 'solid', hex: '#2A2A2E', effects: ['matte'] },
    { id: 'rainbow', name: 'Rainbow', type: 'gradient', hex: '#FF6B6B', gradientStops: ['#FF6B6B', '#FFE66D', '#4ECDC4', '#556270'], gradientAngle: 120, effects: [] },
    { id: 'sunset-glow', name: 'Sunset glow', type: 'gradient', hex: '#FF7A1F', gradientStops: ['#FF7A1F', '#FF3D81', '#6B21A8'], gradientAngle: 135, effects: ['glow'] }
  ];

  const DEFAULT_CATALOG = {
    filaments: [
      { id: 'pla', name: 'PLA', label: 'PLA — versatil', enabled: true, priceMult: 1, sliceKey: 'PLA', sort: 0, colors: DEFAULT_COLORS_PLA.map(c => ({ ...c, effects: [...(c.effects || [])], gradientStops: c.gradientStops ? [...c.gradientStops] : undefined })) },
      { id: 'petg', name: 'PETG', label: 'PETG — rezistent', enabled: true, priceMult: 1.2, sliceKey: 'PETG', sort: 1, colors: [
        { id: 'black', name: 'Negru', type: 'solid', hex: '#1C1C1E', effects: [] },
        { id: 'grey', name: 'Gri', type: 'solid', hex: '#8A8F99', effects: [] },
        { id: 'blue', name: 'Albastru', type: 'solid', hex: '#2553F2', effects: [] }
      ]},
      { id: 'abs', name: 'ABS', label: 'ABS — durabil', enabled: true, priceMult: 1.3, sliceKey: 'ABS', sort: 2, colors: [
        { id: 'black', name: 'Negru', type: 'solid', hex: '#1C1C1E', effects: [] },
        { id: 'white', name: 'Alb', type: 'solid', hex: '#F2F1ED', effects: [] }
      ]},
      { id: 'tpu', name: 'TPU', label: 'TPU — flexibil', enabled: true, priceMult: 1.4, sliceKey: 'TPU', sort: 3, colors: [
        { id: 'black', name: 'Negru', type: 'solid', hex: '#1C1C1E', effects: [] },
        { id: 'red', name: 'Roșu', type: 'solid', hex: '#D62839', effects: [] }
      ]}
    ]
  };

  function slugId(str) {
    return String(str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'item';
  }

  function normalizeHex(h, fallback) {
    const s = String(h || fallback || '#CCCCCC').trim();
    return s.startsWith('#') ? s : ('#' + s);
  }

  function normalizeEffects(raw) {
    const allowed = EFFECTS.map(e => e.id);
    const list = Array.isArray(raw) ? raw : [];
    const out = [];
    list.forEach(e => {
      const id = String(e || '').trim();
      if (allowed.includes(id) && !out.includes(id)) out.push(id);
    });
    return out;
  }

  function normalizeGradientStops(c, hex) {
    if (Array.isArray(c.gradientStops) && c.gradientStops.length >= 2) {
      return c.gradientStops.map(h => normalizeHex(h, hex));
    }
    const from = normalizeHex(c.gradientFrom || c.from || hex, hex);
    const to = normalizeHex(c.gradientTo || c.to || hex, hex);
    return [from, to];
  }

  function normalizeColor(raw, idx) {
    const c = raw || {};
    const type = c.type === 'gradient' ? 'gradient' : 'solid';
    const hex = normalizeHex(c.hex, '#CCCCCC');
    const out = {
      id: String(c.id || slugId(c.name) || ('color-' + idx)),
      name: String(c.name || 'Culoare').trim(),
      type,
      hex,
      effects: normalizeEffects(c.effects)
    };
    if (type === 'gradient') {
      out.gradientStops = normalizeGradientStops(c, hex);
      out.gradientAngle = Number.isFinite(Number(c.gradientAngle)) ? Number(c.gradientAngle) : 135;
    }
    return out;
  }

  function normalizeFilament(raw, idx) {
    const f = raw || {};
    const colors = Array.isArray(f.colors) ? f.colors.map((c, i) => normalizeColor(c, i)) : [];
    return {
      id: String(f.id || slugId(f.name) || ('filament-' + idx)),
      name: String(f.name || 'Material').trim(),
      label: String(f.label || f.name || 'Material').trim(),
      enabled: f.enabled !== false,
      priceMult: Number.isFinite(Number(f.priceMult)) ? Number(f.priceMult) : 1,
      sliceKey: String(f.sliceKey || f.name || 'PLA').trim().toUpperCase(),
      sort: Number.isFinite(Number(f.sort)) ? Number(f.sort) : idx,
      colors
    };
  }

  function normalizeCatalog(raw) {
    if (!raw || !Array.isArray(raw.filaments) || !raw.filaments.length) {
      return JSON.parse(JSON.stringify(DEFAULT_CATALOG));
    }
    const filaments = raw.filaments.map((f, i) => normalizeFilament(f, i)).sort((a, b) => a.sort - b.sort);
    return { filaments };
  }

  function hasEffect(color, effectId) {
    return !!(color && Array.isArray(color.effects) && color.effects.includes(effectId));
  }

  function getGradientStops(color) {
    if (!color || color.type !== 'gradient') return [color?.hex || '#ccc', color?.hex || '#ccc'];
    if (Array.isArray(color.gradientStops) && color.gradientStops.length >= 2) return color.gradientStops;
    return [color.hex, color.hex];
  }

  function baseBackground(color) {
    if (!color) return '#ccc';
    if (color.type === 'gradient') {
      const stops = getGradientStops(color);
      const ang = color.gradientAngle != null ? color.gradientAngle : 135;
      const parts = stops.map((h, i) => {
        const pct = stops.length === 1 ? 0 : Math.round((i / (stops.length - 1)) * 100);
        return h + ' ' + pct + '%';
      }).join(', ');
      return 'linear-gradient(' + ang + 'deg, ' + parts + ')';
    }
    return color.hex || '#ccc';
  }

  function desaturateHex(hex, amount) {
    const c = parseHex(hex);
    const avg = Math.round((c[0] + c[1] + c[2]) / 3);
    const mix = Math.max(0, Math.min(1, amount));
    return '#' + c.map(v => Math.round(v + (avg - v) * mix)).map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
  }

  function swatchBackground(color) {
    if (!color) return 'background:#ccc';
    const layers = [];
    if (hasEffect(color, 'glow')) {
      layers.push('radial-gradient(circle at 28% 28%, rgba(200,255,140,0.75) 0%, rgba(120,220,80,0.35) 38%, transparent 62%)');
    }
    if (hasEffect(color, 'wood')) {
      layers.push('repeating-linear-gradient(88deg, rgba(62,38,18,0.28) 0 1px, transparent 1px 5px)');
      layers.push('repeating-linear-gradient(4deg, rgba(120,78,40,0.12) 0 3px, transparent 3px 9px)');
    }
    if (hasEffect(color, 'silver')) {
      layers.push('linear-gradient(125deg, rgba(255,255,255,0.65) 0%, transparent 32%, rgba(255,255,255,0.45) 52%, transparent 72%, rgba(220,228,240,0.5) 100%)');
    }
    layers.push(baseBackground(color));
    if (hasEffect(color, 'matte')) {
      layers.unshift('linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.2) 100%)');
    }
    return 'background:' + layers.join(', ');
  }

  function parseHex(h) {
    const x = String(h).replace('#', '');
    if (x.length === 3) return [parseInt(x[0] + x[0], 16), parseInt(x[1] + x[1], 16), parseInt(x[2] + x[2], 16)];
    return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
  }

  function blendHex(a, b) {
    const c1 = parseHex(a);
    const c2 = parseHex(b);
    const m = c1.map((v, i) => Math.round((v + c2[i]) / 2));
    return '#' + m.map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function averageHexList(list) {
    if (!list || !list.length) return '#CCCCCC';
    let r = 0;
    let g = 0;
    let b = 0;
    list.forEach(h => {
      const c = parseHex(h);
      r += c[0];
      g += c[1];
      b += c[2];
    });
    const n = list.length;
    return '#' + [r, g, b].map(v => Math.round(v / n).toString(16).padStart(2, '0')).join('');
  }

  function tintHex(hex, rDelta, gDelta, bDelta) {
    const c = parseHex(hex);
    return '#' + [c[0] + rDelta, c[1] + gDelta, c[2] + bDelta].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
  }

  function previewHex(color) {
    if (!color) return '#F2F1ED';
    let hex = color.type === 'gradient' ? averageHexList(getGradientStops(color)) : (color.hex || '#F2F1ED');
    if (hasEffect(color, 'glow')) hex = tintHex(hex, 40, 60, 10);
    if (hasEffect(color, 'wood')) hex = tintHex(hex, 25, 10, -20);
    if (hasEffect(color, 'silver')) hex = tintHex(hex, 35, 35, 40);
    if (hasEffect(color, 'matte')) {
      hex = desaturateHex(hex, 0.4);
      hex = tintHex(hex, -10, -10, -10);
    }
    return hex;
  }

  function formatColorLabel(color) {
    if (!color) return '—';
    const tags = [];
    if (color.type === 'gradient') {
      const n = getGradientStops(color).length;
      tags.push(n + '-color gradient');
    }
    EFFECTS.forEach(e => {
      if (hasEffect(color, e.id)) tags.push(e.label);
    });
    if (!tags.length) return color.name;
    return color.name + ' · ' + tags.join(' · ');
  }

  function colorStylePayload(color) {
    if (!color) return null;
    const base = {
      type: color.type,
      hex: color.hex,
      effects: [...(color.effects || [])],
      preview: previewHex(color)
    };
    if (color.type === 'gradient') {
      base.gradientStops = getGradientStops(color);
      base.gradientAngle = color.gradientAngle || 135;
    }
    return base;
  }

  function getEnabledFilaments(catalog) {
    return normalizeCatalog(catalog).filaments.filter(f => f.enabled);
  }

  function getFilamentById(catalog, id) {
    return normalizeCatalog(catalog).filaments.find(f => f.id === id) || null;
  }

  function getColorsForFilament(catalog, filamentId) {
    const f = getFilamentById(catalog, filamentId);
    if (!f) return [];
    return f.enabled ? f.colors : [];
  }

  function allColorsFlat(catalog) {
    const seen = new Set();
    const out = [];
    getEnabledFilaments(catalog).forEach(f => {
      f.colors.forEach(c => {
        const key = f.id + ':' + c.id;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ ...c, filamentId: f.id, filamentName: f.name });
      });
    });
    return out.length ? out : DEFAULT_COLORS_PLA.map(c => ({ ...c, effects: [...(c.effects || [])] }));
  }

  function newFilament(name) {
    const n = String(name || 'Material').trim();
    return {
      id: slugId(n) + '-' + Date.now().toString(36).slice(-4),
      name: n,
      label: n,
      enabled: true,
      priceMult: 1,
      sliceKey: n.toUpperCase().slice(0, 8),
      sort: 99,
      colors: [{ id: 'default', name: 'Alb', type: 'solid', hex: '#F2F1ED', effects: [] }]
    };
  }

  function newColor(name) {
    const n = String(name || 'Culoare').trim();
    return { id: slugId(n) + '-' + Date.now().toString(36).slice(-4), name: n, type: 'solid', hex: '#CCCCCC', effects: [] };
  }

  function setGradientStopCount(color, count) {
    const n = Math.max(2, Math.min(8, Number(count) || 2));
    const prev = getGradientStops(color);
    const next = [];
    for (let i = 0; i < n; i++) {
      if (prev[i]) next.push(prev[i]);
      else next.push(prev[prev.length - 1] || color.hex || '#CCCCCC');
    }
    color.gradientStops = next;
    return color;
  }

  root.FilamentCatalog = {
    EFFECTS,
    DEFAULT_CATALOG,
    normalizeCatalog,
    normalizeColor,
    getEnabledFilaments,
    getFilamentById,
    getColorsForFilament,
    allColorsFlat,
    hasEffect,
    getGradientStops,
    swatchBackground,
    previewHex,
    formatColorLabel,
    colorStylePayload,
    newFilament,
    newColor,
    setGradientStopCount,
    slugId
  };
})(typeof window !== 'undefined' ? window : globalThis);
