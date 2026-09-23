-- Dame Pon preview-31 — authenticated users may finish profile onboarding

grant update (full_name, phone, avatar_url, onboarding_completed, default_payment_method)
on table public.profiles
to authenticated;