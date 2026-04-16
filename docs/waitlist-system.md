# Waitlist System — Implementation Guide

## Overview

A production-ready waitlist system built natively in Supabase with referral tracking, dynamic scoring/positioning, configurable milestones, and API-friendly endpoints for Framer/Tally/custom frontends.

---

## Schema

### Tables

| Table | Purpose |
|---|---|
| `waitlist_users` | Core user records with scores, position, referral info |
| `waitlist_referrals` | Junction table tracking who referred whom |
| `waitlist_events` | Audit log of signups, referral credits, status changes |
| `waitlist_milestones` | Configurable reward tiers (e.g. 3 referrals = early access) |

### Admin View

`v_waitlist_admin` — Joins referrer email, computes actual referral counts, sorted by position.

---

## Scoring Logic

### Referral Score

```
referral_count ≤ 10  →  referral_count × 10   (max 100)
referral_count > 10  →  100 + (count - 10) × 5
```

### Qualification Score

| Signal | Values → Points |
|---|---|
| **Role** | investor: 25, founder: 20, advisor: 15, operator: 10, other: 5 |
| **Urgency** | actively_raising/deploying: 30, raising_6_months: 25, exploring: 10, not_yet: 5 |
| **Stage** | seed: 20, pre-seed: 15, series-a: 15, series-b+: 10, other: 5 |
| **Intent** | High-value intents: +8 each, other: +3 each |

High-value intents: `find_investors`, `get_warm_intros`, `source_deals`, `raise_capital`, `find_cofounders`, `due_diligence`

### Total Score

```
total_score = referral_score + qualification_score + (priority_access ? 500 : 0)
```

### Position Calculation

```sql
ROW_NUMBER() OVER (
  ORDER BY total_score DESC, referral_count DESC, created_at ASC
)
```

Persisted into `waitlist_users.waitlist_position`. Recalculated on every signup. Can be triggered manually:

```sql
SELECT recalculate_waitlist_positions();
```

---

## How Signup Works

1. Frontend calls the `waitlist-signup` Edge Function with form payload
2. Edge Function calls `waitlist_signup()` RPC via service role
3. RPC normalizes email, checks for duplicates
4. If new: generates referral code, calculates scores, inserts user
5. If existing: returns existing record (attaches referral if applicable)
6. Referral chain: if `referral_code` provided, credits the referrer
7. Positions recalculated after each signup
8. Returns user data including referral link

---

## How Referrals Work

1. Each user gets a unique 8-char referral code on signup (e.g. `VKTA3X9P`)
2. Referral link format: `https://vekta.app?ref=VKTA3X9P`
3. When a new user signs up with a referral code:
   - `referred_by_user_id` set on the new user
   - Row added to `waitlist_referrals`
   - Referrer's `referral_count` incremented
   - Referrer's scores recalculated
   - Audit event logged
4. Each user can only be referred once (unique constraint)
5. Self-referral is prevented

---

## API Endpoints

### Signup — `POST /functions/v1/waitlist-signup`

```json
{
  "email": "jane@example.com",
  "name": "Jane Doe",
  "role": "founder",
  "stage": "seed",
  "urgency": "actively_raising",
  "intent": ["find_investors", "get_warm_intros"],
  "biggest_pain": "Finding the right investors",
  "company_name": "Acme Inc",
  "linkedin_url": "https://linkedin.com/in/janedoe",
  "source": "landing_page",
  "campaign": "launch_apr_2026",
  "referral_code": "VKTA3X9P",
  "metadata": { "utm_medium": "social" }
}
```

Response:
```json
{
  "status": "created",
  "id": "uuid",
  "email": "jane@example.com",
  "referral_code": "AB3XK9PQ",
  "referral_count": 0,
  "total_score": 83,
  "waitlist_position": 42,
  "referral_link": "https://vekta.app?ref=AB3XK9PQ"
}
```

### Status — `POST /functions/v1/waitlist-status`

```json
{ "email": "jane@example.com" }
```

or

```json
{ "referral_code": "AB3XK9PQ" }
```

Response includes milestones with `reached: true/false` for each tier.

---

## Frontend Integration Examples

### From React (using the helper)

```typescript
import { waitlistSignup, waitlistGetStatus } from "@/lib/waitlist";

// Signup
const result = await waitlistSignup({
  email: "jane@example.com",
  name: "Jane",
  role: "founder",
  urgency: "actively_raising",
  intent: ["find_investors"],
  source: "landing_page",
});

// Check status
const status = await waitlistGetStatus({ email: "jane@example.com" });
```

### From Framer / external site (fetch)

```javascript
const res = await fetch(
  "https://zmnlsdohtwztneamvwaq.supabase.co/functions/v1/waitlist-signup",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": "YOUR_SUPABASE_ANON_KEY",
    },
    body: JSON.stringify({
      email: "jane@example.com",
      name: "Jane",
      role: "founder",
      source: "framer",
    }),
  },
);
const data = await res.json();
```

### From Tally (webhook)

Configure a Tally webhook to POST to:
```
https://zmnlsdohtwztneamvwaq.supabase.co/functions/v1/waitlist-signup
```

Map Tally fields to the payload shape. Add `apikey` header with your Supabase anon key.

---

## Recalculating Positions Manually

```sql
-- Recalculate all scores for a specific user
SELECT recalculate_waitlist_user_scores('USER_UUID');

-- Recalculate all positions globally
SELECT recalculate_waitlist_positions();
```

---

## Milestones

Default milestones (seeded in migration):

| Referrals | Reward | Description |
|---|---|---|
| 3 | Early Access | Get early access before public launch |
| 10 | Priority Onboarding | Skip the queue with dedicated onboarding |
| 25 | Premium Perks | Premium features free for 3 months |

Add more:
```sql
INSERT INTO waitlist_milestones (referral_threshold, reward_key, reward_label, description)
VALUES (50, 'vip', 'VIP Status', 'Lifetime VIP membership');
```

---

## Configuration

Set the `WAITLIST_BASE_URL` env var on your Supabase Edge Functions to control the referral link domain:

```
WAITLIST_BASE_URL=https://vekta.app
```

If unset, defaults to `https://vekta.app`.

---

## Security

- RLS is enabled on all waitlist tables
- No direct `anon` access to tables — all public interaction goes through `SECURITY DEFINER` RPC functions
- Only users with `admin` or `god` role in `user_roles` can read/update waitlist tables directly (uses `is_admin_or_above`)
- Internal helper functions (`generate_waitlist_referral_code`, scoring functions, `recalculate_*`) have EXECUTE revoked from PUBLIC/anon/authenticated — only callable from within SECURITY DEFINER RPCs
- Service role bypasses RLS for admin operations
- Edge Functions use `SUPABASE_SERVICE_ROLE_KEY` to call RPCs
