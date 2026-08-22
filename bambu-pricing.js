(function () {
  const MATERIALS = ['PLA', 'PETG', 'TPU', 'ABS'];

  const DEFAULT_SETTINGS = {
    ratePerHour: 8,
    ratePerGramPla: 0.12,
    ratePerGramPetg: 0.15,
    ratePerGramTpu: 0.22,
    ratePerGramAbs: 0.18,
    dryingFee: 12,
    baseFee: 15,
    markupPercent: 25,
    minPrice: 19.99,
    roundUpTo: 0.99
  };

  function normalizeMaterial(material) {
    const key = String(material || 'PLA').trim().toUpperCase();
    if (key.includes('PETG')) return 'PETG';
    if (key.includes('TPU')) return 'TPU';
    if (key.includes('ABS')) return 'ABS';
    return 'PLA';
  }

  function getMaterialRate(settings, material) {
    const mat = normalizeMaterial(material);
    const cfg = { ...DEFAULT_SETTINGS, ...settings };
    if (mat === 'PETG') return cfg.ratePerGramPetg;
    if (mat === 'TPU') return cfg.ratePerGramTpu;
    if (mat === 'ABS') return cfg.ratePerGramAbs;
    return cfg.ratePerGramPla;
  }

  function mapRowToSettings(row) {
    if (!row) return { ...DEFAULT_SETTINGS };
    return {
      ratePerHour: Number(row.rate_per_hour),
      ratePerGramPla: Number(row.rate_per_gram_pla),
      ratePerGramPetg: Number(row.rate_per_gram_petg),
      ratePerGramTpu: Number(row.rate_per_gram_tpu),
      ratePerGramAbs: Number(row.rate_per_gram_abs),
      dryingFee: Number(row.drying_fee),
      baseFee: Number(row.base_fee),
      markupPercent: Number(row.markup_percent),
      minPrice: Number(row.min_price),
      roundUpTo: Number(row.round_up_to),
      shipping_flat: row.shipping_flat != null ? Number(row.shipping_flat) : undefined,
      free_shipping_over: row.free_shipping_over != null ? Number(row.free_shipping_over) : undefined,
      cod_fee: row.cod_fee != null ? Number(row.cod_fee) : undefined,
      shipping_free: row.shipping_free === true,
      payments_enabled: row.payments_enabled !== false,
      filamentCatalog: row.filament_catalog || null
    };
  }

  function mapSettingsToRow(settings) {
    const cfg = { ...DEFAULT_SETTINGS, ...settings };
    const row = {
      id: 1,
      rate_per_hour: cfg.ratePerHour,
      rate_per_gram_pla: cfg.ratePerGramPla,
      rate_per_gram_petg: cfg.ratePerGramPetg,
      rate_per_gram_tpu: cfg.ratePerGramTpu,
      rate_per_gram_abs: cfg.ratePerGramAbs,
      drying_fee: cfg.dryingFee,
      base_fee: cfg.baseFee,
      markup_percent: cfg.markupPercent,
      min_price: cfg.minPrice,
      round_up_to: cfg.roundUpTo,
      shipping_free: !!(cfg.shipping_free ?? cfg.shippingFree),
      payments_enabled: (cfg.payments_enabled ?? cfg.paymentsEnabled) !== false,
      shipping_flat: Number(cfg.shipping_flat ?? cfg.shippingFlat ?? 25),
      free_shipping_over: Number(cfg.free_shipping_over ?? cfg.freeShippingOver ?? 250),
      cod_fee: Number(cfg.cod_fee ?? cfg.codFee ?? 8),
      updated_at: new Date().toISOString()
    };
    if (cfg.filamentCatalog != null) row.filament_catalog = cfg.filamentCatalog;
    return row;
  }

  async function loadSettingsFromDb(client) {
    const { data, error } = await client
      .from('pricing_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    return mapRowToSettings(data);
  }

  async function saveSettingsToDb(client, settings) {
    const row = mapSettingsToRow(settings);
    const { error } = await client
      .from('pricing_settings')
      .upsert(row, { onConflict: 'id' });
    if (error) throw error;
    return mapRowToSettings(row);
  }

  function detectMaterialFromText(text) {
    if (!text) return null;
    const patterns = [
      /type="(PLA|PETG|TPU|ABS)[^"]*"/i,
      /filament_type[^=\n]*=\s*(PLA|PETG|TPU|ABS)/i,
      /;\s*filament_type\s*=\s*(PLA|PETG|TPU|ABS)/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return normalizeMaterial(match[1]);
    }
    return null;
  }

  function parseDurationToHours(text) {
    if (!text) return null;
    const normalized = String(text).trim().toLowerCase();
    if (!normalized) return null;

    const colonMatch = normalized.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
    if (colonMatch) {
      const h = Number(colonMatch[1]);
      const m = Number(colonMatch[2]);
      const s = Number(colonMatch[3] || 0);
      return h + m / 60 + s / 3600;
    }

    let seconds = 0;
    const day = normalized.match(/(\d+)\s*d\b/);
    const hour = normalized.match(/(\d+)\s*h\b/);
    const min = normalized.match(/(\d+)\s*m\b/);
    const sec = normalized.match(/(\d+)\s*s\b/);
    if (day) seconds += Number(day[1]) * 86400;
    if (hour) seconds += Number(hour[1]) * 3600;
    if (min) seconds += Number(min[1]) * 60;
    if (sec) seconds += Number(sec[1]);
    if (!seconds) return null;
    return seconds / 3600;
  }

  function sumFilamentGrams(text) {
    const patterns = [
      /total filament weight\s*\[g\]\s*[:=]\s*([\d.]+)/gi,
      /total filament used\s*\[g\]\s*[:=]\s*([\d.]+)/gi,
      /filament used\s*\[g\]\s*[:=]\s*([\d.]+)/gi
    ];
    let total = 0;
    let found = false;
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        total += Number(match[1]);
        found = true;
      }
    }
    return found ? total : null;
  }

  function parseGcodeMetadata(text) {
    const header = text.slice(0, 120000);
    let printHours = null;
    let filamentGrams = sumFilamentGrams(header);
    const detectedMaterial = detectMaterialFromText(header);

    const timePatterns = [
      /total estimated time:\s*([^;\n]+)/i,
      /estimated printing time\s*\([^)]+\)\s*=\s*([^\n]+)/i,
      /model printing time:\s*([^;\n]+)/i
    ];

    for (const pattern of timePatterns) {
      const match = header.match(pattern);
      if (!match) continue;
      const hours = parseDurationToHours(match[1].trim());
      if (hours != null) {
        printHours = hours;
        break;
      }
    }

    if (filamentGrams == null) {
      const usedGAttrs = [...header.matchAll(/used_g="([\d.]+)"/gi)];
      if (usedGAttrs.length) {
        filamentGrams = usedGAttrs.reduce((sum, m) => sum + Number(m[1]), 0);
      }
    }

    return {
      printHours,
      filamentGrams,
      detectedMaterial,
      source: 'gcode'
    };
  }

  function parseSliceInfoConfig(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) return null;

    let totalSeconds = 0;
    let totalGrams = 0;
    let hasTime = false;
    let hasWeight = false;
    let detectedMaterial = detectMaterialFromText(xmlText);

    doc.querySelectorAll('plate').forEach(plate => {
      let plateSeconds = null;
      let plateWeight = null;

      plate.querySelectorAll('metadata').forEach(meta => {
        const key = meta.getAttribute('key');
        const value = meta.getAttribute('value');
        if (key === 'prediction' && value) plateSeconds = Number(value);
        if (key === 'weight' && value) plateWeight = Number(value);
      });

      if (plateSeconds != null && !Number.isNaN(plateSeconds)) {
        totalSeconds += plateSeconds;
        hasTime = true;
      }

      if (plateWeight != null && !Number.isNaN(plateWeight)) {
        totalGrams += plateWeight;
        hasWeight = true;
      } else {
        plate.querySelectorAll('filament').forEach(filament => {
          const usedG = Number(filament.getAttribute('used_g'));
          if (!Number.isNaN(usedG) && usedG > 0) {
            totalGrams += usedG;
            hasWeight = true;
          }
          if (!detectedMaterial) {
            detectedMaterial = normalizeMaterial(filament.getAttribute('type'));
          }
        });
      }
    });

    return {
      printHours: hasTime ? totalSeconds / 3600 : null,
      filamentGrams: hasWeight ? totalGrams : null,
      detectedMaterial,
      source: 'slice_info.config'
    };
  }

  async function extractGcodeFrom3mf(arrayBuffer) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip nu este disponibil pentru fișiere 3MF.');
    }
    const zip = await JSZip.loadAsync(arrayBuffer);
    const sliceInfoFile = zip.file(/Metadata\/slice_info\.config$/i)[0];
    if (sliceInfoFile) {
      const xmlText = await sliceInfoFile.async('string');
      const parsed = parseSliceInfoConfig(xmlText);
      if (parsed && (parsed.printHours != null || parsed.filamentGrams != null)) {
        return parsed;
      }
    }

    const gcodeFiles = zip.file(/Metadata\/plate_\d+\.gcode$/i);
    if (!gcodeFiles.length) {
      throw new Error('Nu am găsit slice_info.config sau G-code în fișierul 3MF.');
    }

    let printHours = null;
    let filamentGrams = null;
    let detectedMaterial = null;
    for (const file of gcodeFiles) {
      const text = await file.async('string');
      const parsed = parseGcodeMetadata(text);
      if (parsed.printHours != null) printHours = (printHours || 0) + parsed.printHours;
      if (parsed.filamentGrams != null) filamentGrams = (filamentGrams || 0) + parsed.filamentGrams;
      if (!detectedMaterial && parsed.detectedMaterial) detectedMaterial = parsed.detectedMaterial;
    }

    return {
      printHours,
      filamentGrams,
      detectedMaterial,
      source: '3mf-gcode'
    };
  }

  async function parseBambuFile(file) {
    const name = file.name.toLowerCase();

    if (name.endsWith('.gcode')) {
      const text = await file.text();
      const parsed = parseGcodeMetadata(text);
      if (parsed.printHours == null && parsed.filamentGrams == null) {
        throw new Error('Nu am găsit timp sau filament în G-code. Exportă din Bambu Studio după slice.');
      }
      return parsed;
    }

    if (name.endsWith('.3mf')) {
      const buffer = await file.arrayBuffer();
      const parsed = await extractGcodeFrom3mf(buffer);
      if (parsed.printHours == null && parsed.filamentGrams == null) {
        throw new Error('3MF-ul nu pare fișat (sliced). Slice în Bambu Studio înainte de export.');
      }
      return parsed;
    }

    throw new Error('Format nesuportat. Folosește .gcode sau .3mf exportat din Bambu Studio.');
  }

  function roundPrice(value, step) {
    if (!step || step <= 0) return Math.round(value * 100) / 100;
    return Math.ceil(value / step) * step;
  }

  function calculatePrice(printHours, filamentGrams, settings, material) {
    const cfg = { ...DEFAULT_SETTINGS, ...settings };
    const mat = normalizeMaterial(material);
    const hours = Number(printHours) || 0;
    const grams = Number(filamentGrams) || 0;
    const ratePerGram = getMaterialRate(cfg, mat);

    const timeCost = hours * cfg.ratePerHour;
    const filamentCost = grams * ratePerGram;
    const dryingFee = mat === 'PLA' ? 0 : cfg.dryingFee;
    const subtotal = cfg.baseFee + timeCost + filamentCost + dryingFee;
    const markupAmount = subtotal * (cfg.markupPercent / 100);
    let total = subtotal + markupAmount;
    if (cfg.minPrice > 0) total = Math.max(total, cfg.minPrice);
    total = roundPrice(total, cfg.roundUpTo);

    return {
      material: mat,
      printHours: hours,
      filamentGrams: grams,
      ratePerGram,
      timeCost,
      filamentCost,
      dryingFee,
      baseFee: cfg.baseFee,
      subtotal,
      markupPercent: cfg.markupPercent,
      markupAmount,
      total
    };
  }

  function formatHours(hours) {
    if (!hours) return '0 h';
    const totalMin = Math.round(hours * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h && m) return `${h} h ${m} min`;
    if (h) return `${h} h`;
    return `${m} min`;
  }

  function formatLei(value) {
    return Number(value).toFixed(2).replace('.', ',') + ' lei';
  }

  const BAMBU_BED_MM = { x: 256, y: 256, z: 256 };

  function parseStlBoundingBoxMm(arrayBuffer) {
    if (!arrayBuffer || !arrayBuffer.byteLength) return null;
    const view = new DataView(arrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);
    const header = String.fromCharCode(bytes[0] || 0, bytes[1] || 0, bytes[2] || 0, bytes[3] || 0, bytes[4] || 0);
    const isAscii = header.toLowerCase() === 'solid';

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    let found = false;

    function includeVertex(x, y, z) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
      found = true;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }

    if (isAscii) {
      const text = new TextDecoder().decode(arrayBuffer);
      const vertexPattern = /vertex\s+([-+eE\d.]+)\s+([-+eE\d.]+)\s+([-+eE\d.]+)/g;
      let match;
      while ((match = vertexPattern.exec(text)) !== null) {
        includeVertex(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
      }
    } else if (arrayBuffer.byteLength >= 84) {
      const triCount = view.getUint32(80, true);
      let offset = 84;
      for (let i = 0; i < triCount; i++) {
        if (offset + 50 > arrayBuffer.byteLength) break;
        offset += 12;
        for (let v = 0; v < 3; v++) {
          includeVertex(
            view.getFloat32(offset, true),
            view.getFloat32(offset + 4, true),
            view.getFloat32(offset + 8, true)
          );
          offset += 12;
        }
        offset += 2;
      }
    }

    if (!found) return null;
    const widthMm = maxX - minX;
    const depthMm = maxY - minY;
    const heightMm = maxZ - minZ;
    return {
      widthMm,
      depthMm,
      heightMm,
      dimsCm: [widthMm / 10, depthMm / 10, heightMm / 10]
    };
  }

  function validateFitsPrintBed(bbox) {
    if (!bbox) {
      return { fits: false, message: 'Nu am putut citi dimensiunile fișierului STL.' };
    }
    const model = [bbox.widthMm, bbox.depthMm, bbox.heightMm].sort((a, b) => b - a);
    const bed = [BAMBU_BED_MM.x, BAMBU_BED_MM.y, BAMBU_BED_MM.z].sort((a, b) => b - a);
    const fits = model[0] <= bed[0] && model[1] <= bed[1] && model[2] <= bed[2];
    const dimsText = `${(bbox.widthMm / 10).toFixed(1)} × ${(bbox.depthMm / 10).toFixed(1)} × ${(bbox.heightMm / 10).toFixed(1)} cm`;
    return {
      fits,
      dimsText,
      message: fits
        ? `Dimensiuni: ${dimsText} — încape pe platforma Bambu Lab 256×256×256 mm.`
        : `Model prea mare (${dimsText}). Maxim 25,6 × 25,6 × 25,6 cm pe platforma de printare.`
    };
  }

  async function readStlBoundingBox(file) {
    const buffer = await file.arrayBuffer();
    return parseStlBoundingBoxMm(buffer);
  }

  function renderBreakdownRows(breakdown) {
    const dryingRow = breakdown.dryingFee > 0
      ? `<div class="estimate-row"><span>Uscare ${breakdown.material}</span><strong>${formatLei(breakdown.dryingFee)}</strong></div>`
      : '';
    return `
      <div class="estimate-row"><span>Material</span><strong>${breakdown.material}</strong></div>
      <div class="estimate-row"><span>Timp print</span><strong>${formatHours(breakdown.printHours)}</strong></div>
      <div class="estimate-row"><span>Filament</span><strong>${breakdown.filamentGrams.toFixed(1)} g × ${breakdown.ratePerGram.toFixed(3)} lei/g</strong></div>
      <div class="estimate-row"><span>Timp × tarif</span><strong>${formatLei(breakdown.timeCost)}</strong></div>
      <div class="estimate-row"><span>Filament</span><strong>${formatLei(breakdown.filamentCost)}</strong></div>
      ${dryingRow}
      <div class="estimate-row"><span>Taxă fixă</span><strong>${formatLei(breakdown.baseFee)}</strong></div>
      <div class="estimate-row"><span>Subtotal</span><strong>${formatLei(breakdown.subtotal)}</strong></div>
      <div class="estimate-row"><span>Adaos ${breakdown.markupPercent}%</span><strong>+ ${formatLei(breakdown.markupAmount)}</strong></div>
      <div class="estimate-row total"><span>Preț final</span><strong>${formatLei(breakdown.total)}</strong></div>
    `;
  }

  window.BambuPricing = {
    MATERIALS,
    DEFAULT_SETTINGS,
    BAMBU_BED_MM,
    normalizeMaterial,
    getMaterialRate,
    loadSettingsFromDb,
    saveSettingsToDb,
    mapRowToSettings,
    parseBambuFile,
    parseStlBoundingBoxMm,
    readStlBoundingBox,
    validateFitsPrintBed,
    calculatePrice,
    renderBreakdownRows,
    formatHours,
    formatLei
  };
})();
