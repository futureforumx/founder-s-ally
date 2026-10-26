import type { Page } from "@playwright/test";
import { test, expect } from "../playwright-fixture";

/**
 * Geometry regression cover for the Investors "Firm type" filter: the checklist must open
 * below its trigger, never flipped above it, and never squeezed into an unusable sliver.
 * jsdom cannot verify this — every rect there is zero — so it lives in Playwright.
 */

const AUTH_STORAGE_KEY = "vekta-supabase-auth";

/**
 * The directory sits behind `ProtectedRoute`, so seed a session instead of driving the login
 * form. Supabase reads it straight from storage; directory reads 401 and render empty, which
 * is fine because only the toolbar geometry is under test.
 */
async function seedSession(page: Page) {
  const nowSec = Math.floor(Date.now() / 1000);
  const iso = new Date().toISOString();
  const b64url = (payload: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(payload)).toString("base64url");
  const accessToken = [
    b64url({ alg: "HS256", typ: "JWT" }),
    b64url({
      sub: "00000000-0000-4000-8000-000000000001",
      aud: "authenticated",
      role: "authenticated",
      email: "e2e@vekta.local",
      iat: nowSec,
      exp: nowSec + 60 * 60 * 24,
    }),
    "e2e-signature",
  ].join(".");

  await page.addInitScript(
    ([key, session]) => {
      window.localStorage.setItem(key, JSON.stringify(session));
    },
    [
      AUTH_STORAGE_KEY,
      {
        access_token: accessToken,
        token_type: "bearer",
        expires_in: 60 * 60 * 24,
        expires_at: nowSec + 60 * 60 * 24,
        refresh_token: "e2e-fake-refresh",
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          aud: "authenticated",
          role: "authenticated",
          email: "e2e@vekta.local",
          email_confirmed_at: iso,
          app_metadata: { provider: "email", providers: ["email"] },
          user_metadata: { full_name: "E2E Tester" },
          identities: [],
          created_at: iso,
          updated_at: iso,
        },
      },
    ] as const,
  );
}

async function openInvestorDirectory(page: Page) {
  await seedSession(page);
  await page.goto("/intelligence");
  await page.waitForTimeout(2_000);

  test.skip(
    new URL(page.url()).pathname === "/login",
    "Needs VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY so the app runs its real auth provider.",
  );

  // `investor-search` has no URL of its own; Index only reaches it through the nav event,
  // and the listener attaches after mount, so re-dispatch until the toolbar shows up.
  const trigger = page.getByRole("button", { name: /firm type/i });
  await expect(async () => {
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("vekta:navigate-app-view", { detail: { view: "investor-search" } }),
      );
    });
    expect(await trigger.count()).toBeGreaterThan(0);
  }).toPass({ timeout: 30_000 });

  await expect(trigger).toBeVisible();
  return trigger;
}

/** Radix `aria-hidden`s the page while the menu is open, so measure the node, not the role. */
async function assertOpensBelowTrigger(page: Page, trigger: ReturnType<Page["getByRole"]>) {
  const triggerNode = await trigger.elementHandle();
  expect(triggerNode).not.toBeNull();

  await trigger.click();

  // Radix names the menu after its trigger; the top nav also exposes `role="menu"` lists.
  const menu = page.getByRole("menu", { name: /firm type/i });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute("data-side", "bottom");

  const triggerBox = await triggerNode!.boundingBox();
  const menuBox = await menu.boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.y).toBeGreaterThanOrEqual(triggerBox!.y + triggerBox!.height);

  // A menu pinned below a trigger near the viewport floor must still be readable.
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Venture Capital", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /clear firm types/i })).toBeVisible();
  await expect(page.getByRole("menuitemcheckbox")).toHaveCount(9);
}

test.describe("Investors directory firm type filter", () => {
  test("opens below the trigger when the toolbar sits at the viewport floor", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 620 });
    const trigger = await openInvestorDirectory(page);

    // Park the toolbar just above the viewport floor: the pre-fix menu flipped upwards here.
    await trigger.scrollIntoViewIfNeeded();
    await trigger.evaluate((el) => {
      const scroller = document.scrollingElement ?? document.documentElement;
      const box = el.getBoundingClientRect();
      scroller.scrollTop += box.top - (window.innerHeight - box.height - 24);
    });
    await expect(async () => {
      const box = await trigger.boundingBox();
      expect(box!.y).toBeGreaterThan(400);
    }).toPass({ timeout: 5_000 });

    await assertOpensBelowTrigger(page, trigger);
  });

  test("opens below the trigger on a tall viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const trigger = await openInvestorDirectory(page);
    await assertOpensBelowTrigger(page, trigger);
  });
});
