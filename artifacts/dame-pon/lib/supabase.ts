import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { readSupabasePublicConfig } from './supabase-config';

const { url: supabaseUrl, publishableKey } = readSupabasePublicConfig();

export const supabase = createClient(supabaseUrl, publishableKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
