const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

function stop(message) {
  console.error(`\nSupabase configuration error: ${message}`);
  console.error(
    'Update the value in Replit Secrets and restart the Dame Pon workflow. Never paste a Supabase key into chat.\n',
  );
  process.exit(1);
}

if (!url) {
  stop('EXPO_PUBLIC_SUPABASE_URL is missing.');
}

if (!publishableKey) {
  stop(
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing. Use the Publishable key (sb_publishable_...) shown by Supabase.',
  );
}

if (publishableKey.startsWith('eyJ')) {
  stop(
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY contains a legacy JWT anon key. Replace it with the current sb_publishable_... key.',
  );
}

if (publishableKey.startsWith('sb_secret_')) {
  stop(
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY contains a secret key. Secret keys must never be exposed to a mobile app.',
  );
}

if (!publishableKey.startsWith('sb_publishable_')) {
  stop(
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must contain a Supabase key beginning with sb_publishable_.',
  );
}

let parsedUrl;
try {
  parsedUrl = new URL(url);
} catch {
  stop('EXPO_PUBLIC_SUPABASE_URL is not a valid URL.');
}

if (parsedUrl.protocol !== 'https:') {
  stop('EXPO_PUBLIC_SUPABASE_URL must use https://.');
}

console.log('Supabase public configuration is valid.');