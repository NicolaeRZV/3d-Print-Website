import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const urlMatch = indexHtml.match(/const SLICE_API_URL = '([^']+)'/);
const keyMatch = indexHtml.match(/const SLICE_API_KEY = '([^']+)'/);
const SLICE_API_URL = urlMatch?.[1] || '';
const SLICE_API_KEY = keyMatch?.[1] || '';
const stlPath = path.join(__dirname, 'tmp-test-cube.stl');

if(!SLICE_API_URL || !SLICE_API_KEY || SLICE_API_KEY.includes('YOUR-')){
  console.error('FAIL: SLICE_API_URL / SLICE_API_KEY not set in index.html');
  process.exit(1);
}

async function checkHealth(){
  const res = await fetch(`${SLICE_API_URL.replace(/\/$/, '')}/health`);
  const data = await res.json();
  if(!res.ok || !data.ok) throw new Error('health check failed: ' + JSON.stringify(data));
  console.log('OK health:', data.printer, '| orca:', data.orca);
}

async function checkCors(){
  const res = await fetch(`${SLICE_API_URL.replace(/\/$/, '')}/estimate`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://artblu.ro',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'x-api-key'
    }
  });
  const acao = res.headers.get('access-control-allow-origin');
  if(!acao) throw new Error('CORS preflight missing Access-Control-Allow-Origin');
  console.log('OK CORS preflight: Allow-Origin =', acao);
}

async function checkEstimate(){
  const buf = fs.readFileSync(stlPath);
  const blob = new Blob([buf], { type: 'model/stl' });
  const body = new FormData();
  body.append('file', blob, 'tmp-test-cube.stl');
  body.append('material', 'PLA');
  const t0 = Date.now();
  const res = await fetch(`${SLICE_API_URL.replace(/\/$/, '')}/estimate`, {
    method: 'POST',
    headers: {
      'X-API-Key': SLICE_API_KEY,
      Origin: 'https://artblu.ro'
    },
    body
  });
  const data = await res.json().catch(() => ({}));
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  if(!res.ok) throw new Error(`estimate HTTP ${res.status}: ${JSON.stringify(data)}`);
  if(data.printHours == null && data.filamentGrams == null) throw new Error('estimate missing fields: ' + JSON.stringify(data));
  console.log(`OK estimate in ${sec}s:`, {
    printHours: data.printHours,
    filamentGrams: data.filamentGrams,
    material: data.material,
    printer: data.printer
  });
}

console.log('Testing direct browser path →', SLICE_API_URL);
console.log('Origin simulated: https://artblu.ro\n');
try{
  await checkHealth();
  await checkCors();
  console.log('Slicing tiny test STL (may take 1–3 min)…');
  await checkEstimate();
  console.log('\nAll checks passed — deploy index.html when ready.');
}catch(err){
  console.error('\nFAIL:', err.message || err);
  process.exit(1);
}
