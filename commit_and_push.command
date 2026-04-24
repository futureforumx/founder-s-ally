#!/bin/bash
cd "$(dirname "$0")"
echo "Removing stale git locks..."
rm -f .git/index.lock .git/HEAD.lock .git/packed-refs.lock .git/refs/heads/*.lock 2>/dev/null
echo "Staging changes..."
git add src/components/admin/AdminMarketIntelligence.tsx
git add src/pages/AdminIntelligence.tsx
git add supabase/functions/admin-market-intel/index.ts
echo "Committing..."
git commit -m "feat(admin): Market Intelligence section — Companies, Founders, Operators

Adds a new 'Market Intel' nav item to the admin console with three
searchable, paginated sub-tabs backed by the admin-market-intel edge function:

- Companies  → startups table (sector, stage, location, raised, fit score)
- Founders   → startup_founders table (expertise, archetype, track record,
               repeat/exit/operator-to-founder signals)
- Operators  → operator_profiles table (expertise, completeness score bar,
               enrichment status, availability)

Routes all queries through admin-market-intel edge function (service-role key,
bypasses RLS) using the same anon-key-in-Authorization / WorkOS-JWT-in-X-User-Auth
pattern as other admin functions — fixes 'Missing or invalid bearer token' error.

Also adds auto-stub trigger trg_fi_deal_create_startup_stub: any new insert into
fi_deals_canonical now creates a startups record automatically."
echo ""
echo "Pushing to origin..."
git push origin HEAD
echo ""
echo "Done! Press any key to close..."
read -n 1
