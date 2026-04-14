# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: investor-directory-crash.e2e.spec.ts >> Investor directory >> Network → Investors does not throw (regression)
- Location: tests/investor-directory-crash.e2e.spec.ts:4:3

# Error details

```
Error: Page errors: console: Failed to load resource: net::ERR_CONNECTION_REFUSED
---
console: Access to fetch at 'https://zmnlsdohtwztneamvwaq.supabase.co/functions/v1/intelligence-feed' from origin 'http://127.0.0.1:4173' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: It does not have HTTP ok status.
---
console: Failed to load resource: net::ERR_FAILED
---
console: Failed to load resource: the server responded with a status of 400 ()
---
console: Failed to load resource: the server responded with a status of 404 ()
---
console: Failed to load resource: net::ERR_EMPTY_RESPONSE
---
console: [vite] Failed to reload /src/components/GlobalTopNav.tsx. This could be due to syntax errors or importing non-existent modules. (see errors above)
---
console: Failed to load resource: net::ERR_CONNECTION_RESET
---
console: [vite] Failed to reload /src/index.css. This could be due to syntax errors or importing non-existent modules. (see errors above)
---
console: Failed to load resource: net::ERR_CONNECTION_REFUSED
---
console: [vite] Failed to reload /src/index.css. This could be due to syntax errors or importing non-existent modules. (see errors above)
---
console: Failed to load resource: net::ERR_CONNECTION_REFUSED
---
console: [vite] Failed to reload /src/index.css. This could be due to syntax errors or importing non-existent modules. (see errors above)
---
console: Failed to load resource: net::ERR_CONNECTION_REFUSED
---
console: [vite] Failed to reload /src/index.css. This could be due to syntax errors or importing non-existent modules. (see errors above)
---
console: Failed to load resource: net::ERR_CONNECTION_REFUSED
---
console: [vite] Failed to reload /src/index.css. This could be due to syntax errors or importing non-existent modules. (see errors above)
---
console: Failed to load resource: net::ERR_CONNECTION_REFUSED
---
console: [vite] Failed to reload /src/index.css. This could be due to syntax errors or importing non-existent modules. (see errors above)
---
console: Failed to load resource: net::ERR_CONNECTION_REFUSED
---
console: [vite] Failed to reload /src/index.css. This could be due to syntax errors or importing non-existent modules. (see errors above)
---
console: Failed to load resource: net::ERR_CONNECTION_REFUSED
---
console: [vite] Failed to reload /src/index.css. This could be due to syntax errors or importing non-existent modules. (see errors above)
---
console: Failed to load resource: net::ERR_CONNECTION_REFUSED
---
console: [vite] Failed to reload /src/index.css. This could be due to syntax errors or importing non-existent modules. (see errors above)
---
console: Failed to load resource: net::ERR_CONNECTION_REFUSED
---
console: Failed to load resource: net::ERR_CONNECTION_REFUSED
---
console: [vite] Failed to reload /src/index.css. This could be due to syntax errors or importing non-existent modules. (see errors above)
---
console: [vite] Failed to reload /src/components/GlobalTopNav.tsx. This could be due to syntax errors or importing non-existent modules. (see errors above)
---
console: Failed to load resource: net::ERR_CONNECTION_REFUSED
---
console: [vite] Failed to reload /src/index.css. This could be due to syntax errors or importing non-existent modules. (see errors above)
---
console: Failed to load resource: net::ERR_CONNECTION_REFUSED
---
console: [vite] Failed to reload /src/index.css. This could be due to syntax errors or importing non-existent modules. (see errors above)
---
console: Failed to load resource: net::ERR_CONNECTION_REFUSED
---
console: [vite] Failed to reload /src/index.css. This could be due to syntax errors or importing non-existent modules. (see errors above)
---
console: Failed to load resource: net::ERR_CONNECTION_REFUSED
---
console: Access to fetch at 'https://zmnlsdohtwztneamvwaq.supabase.co/functions/v1/intelligence-feed' from origin 'http://127.0.0.1:4173' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: It does not have HTTP ok status.
---
console: Failed to load resource: net::ERR_FAILED
---
console: Failed to load resource: the server responded with a status of 404 ()
---
console: Failed to load resource: the server responded with a status of 400 ()

expect(received).toHaveLength(expected)

Expected length: 0
Received length: 40
Received array:  ["console: Failed to load resource: net::ERR_CONNECTION_REFUSED", "console: Access to fetch at 'https://zmnlsdohtwztneamvwaq.supabase.co/functions/v1/intelligence-feed' from origin 'http://127.0.0.1:4173' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: It does not have HTTP ok status.", "console: Failed to load resource: net::ERR_FAILED", "console: Failed to load resource: the server responded with a status of 400 ()", "console: Failed to load resource: the server responded with a status of 404 ()", "console: Failed to load resource: net::ERR_EMPTY_RESPONSE", "console: [vite] Failed to reload /src/components/GlobalTopNav.tsx. This could be due to syntax errors or importing non-existent modules. (see errors above)", "console: Failed to load resource: net::ERR_CONNECTION_RESET", "console: [vite] Failed to reload /src/index.css. This could be due to syntax errors or importing non-existent modules. (see errors above)", "console: Failed to load resource: net::ERR_CONNECTION_REFUSED", …]
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - paragraph [ref=e4]: An error has occurred
  - generic [ref=e5]: "TypeError: Cannot read properties of null (reading 'avatar_url') TypeError: Cannot read properties of null (reading 'avatar_url') at http://127.0.0.1:4173/src/components/dashboard/PersonProfileModal.tsx:154:30 at commitHookEffectListMount (http://127.0.0.1:4173/node_modules/.vite/deps/chunk-HGNGF7HD.js?v=611c581b:16963:34) at commitPassiveMountOnFiber (http://127.0.0.1:4173/node_modules/.vite/deps/chunk-HGNGF7HD.js?v=611c581b:18206:19) at commitPassiveMountEffects_complete (http://127.0.0.1:4173/node_modules/.vite/deps/chunk-HGNGF7HD.js?v=611c581b:18179:17) at commitPassiveMountEffects_begin (http://127.0.0.1:4173/node_modules/.vite/deps/chunk-HGNGF7HD.js?v=611c581b:18169:15) at commitPassiveMountEffects (http://127.0.0.1:4173/node_modules/.vite/deps/chunk-HGNGF7HD.js?v=611c581b:18159:11) at flushPassiveEffectsImpl (http://127.0.0.1:4173/node_modules/.vite/deps/chunk-HGNGF7HD.js?v=611c581b:19543:11) at flushPassiveEffects (http://127.0.0.1:4173/node_modules/.vite/deps/chunk-HGNGF7HD.js?v=611c581b:19500:22) at performSyncWorkOnRoot (http://127.0.0.1:4173/node_modules/.vite/deps/chunk-HGNGF7HD.js?v=611c581b:18921:11) at flushSyncCallbacks (http://127.0.0.1:4173/node_modules/.vite/deps/chunk-HGNGF7HD.js?v=611c581b:9166:30)"
```

# Test source

```ts
  1  | import { test, expect } from "../playwright-fixture";
  2  | 
  3  | test.describe("Investor directory", () => {
  4  |   test("Network → Investors does not throw (regression)", async ({ page }) => {
  5  |     const errors: string[] = [];
  6  |     page.on("pageerror", (err) => {
  7  |       errors.push(`${err.message}\n${err.stack ?? ""}`);
  8  |     });
  9  |     page.on("console", (msg) => {
  10 |       if (msg.type() === "error") {
  11 |         errors.push(`console: ${msg.text()}`);
  12 |       }
  13 |     });
  14 | 
  15 |     await page.goto("/");
  16 | 
  17 |     const onboardingModal = page.getByText("Welcome to Vekta. Let's sync your company.");
  18 |     if (await onboardingModal.isVisible().catch(() => false)) {
  19 |       await page.getByRole("button", { name: "Skip for now" }).click();
  20 |     }
  21 | 
  22 |     await page.getByRole("button", { name: /network/i }).click();
  23 |     await page.waitForTimeout(500);
  24 | 
  25 |     await page.getByRole("radio", { name: /investors/i }).click();
  26 |     await page.waitForTimeout(2000);
  27 | 
> 28 |     expect(errors, `Page errors: ${errors.join("\n---\n")}`).toHaveLength(0);
     |                                                              ^ Error: Page errors: console: Failed to load resource: net::ERR_CONNECTION_REFUSED
  29 |   });
  30 | });
  31 | 
```