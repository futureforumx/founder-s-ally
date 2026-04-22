ALTER TABLE public.connected_accounts
DROP CONSTRAINT IF EXISTS connected_accounts_provider_check;

ALTER TABLE public.connected_accounts
ADD CONSTRAINT connected_accounts_provider_check
CHECK (
  provider IN (
    'gmail',
    'google_calendar',
    'google_sheets',
    'outlook',
    'hubspot',
    'salesforce',
    'pipedrive',
    'linear',
    'notion',
    'other'
  )
);
