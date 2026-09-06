const PUBLISHABLE_KEY_PREFIX = 'sb_publishable_';

export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

export function readSupabasePublicConfig(
  environment: Record<string, string | undefined> = process.env,
): SupabasePublicConfig {
  const url = environment.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = environment.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url) {
    throw new Error(
      'Supabase configuration is missing EXPO_PUBLIC_SUPABASE_URL. Add it in Replit Secrets; do not paste it into chat.',
    );
  }

  if (!publishableKey) {
    throw new Error(
      'Supabase configuration is missing EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy the Publishable key (sb_publishable_...) from Supabase into Replit Secrets; do not paste it into chat.',
    );
  }

  if (!publishableKey.startsWith(PUBLISHABLE_KEY_PREFIX)) {
    const guidance = publishableKey.startsWith('eyJ')
      ? 'The configured value is a legacy JWT anon key.'
      : publishableKey.startsWith('sb_secret_')
        ? 'The configured value is a secret key and must never be bundled in the app.'
        : 'The configured value is not a Supabase Publishable key.';

    throw new Error(
      `${guidance} Set EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to the sb_publishable_... value from Supabase in Replit Secrets; do not paste it into chat.`,
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_URL is not a valid URL. Update it in Replit Secrets; do not paste it into chat.',
    );
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_URL must use https://. Update it in Replit Secrets; do not paste it into chat.',
    );
  }

  return { url, publishableKey };
}