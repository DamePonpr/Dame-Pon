import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { readSupabasePublicConfig } from './supabase-config';

const FALLBACK_SUPABASE_URL = 'https://missing-supabase-config.invalid';
const FALLBACK_SUPABASE_KEY = 'sb_publishable_missing_config';

let supabaseConfigError: Error | null = null;
let supabaseUrl = FALLBACK_SUPABASE_URL;
let publishableKey = FALLBACK_SUPABASE_KEY;

try {
  const config = readSupabasePublicConfig();
  supabaseUrl = config.url;
  publishableKey = config.publishableKey;
} catch (error) {
  supabaseConfigError =
    error instanceof Error
      ? error
      : new Error('Supabase configuration is unavailable.');
}

export { supabaseConfigError };

export const supabase = createClient(supabaseUrl, publishableKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
