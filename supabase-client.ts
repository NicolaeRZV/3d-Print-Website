import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://tilfngrtldwevtiilxpq.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_A3fpQb9LjJb8XySpIJyJeg_gcjPOs3m';
export const STL_BUCKET = 'stl-files';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function getStlPublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/${STL_BUCKET}/${path.replace(/^\/+/, '')}`;
}
