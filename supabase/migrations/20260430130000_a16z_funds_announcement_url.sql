UPDATE public.vc_funds
SET
  announcement_url = 'https://a16z.com/why-did-we-raise-15b/?utm_source=tryvekta&utm_medium=referral&utm_campaign=fresh_capital',
  updated_at       = NOW()
WHERE normalized_key LIKE 'a16z-%';
