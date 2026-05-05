import { createClient } from '@supabase/supabase-js';

function cleanEnvValue(value?: string) {
  if (!value) {
    return '';
  }

  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

const supabaseUrl = cleanEnvValue(process.env.SUPABASE_URL);
const supabaseServiceRoleKey = cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorios en el backend.');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
