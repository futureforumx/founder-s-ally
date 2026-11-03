import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

test("Chromium can read the local provider export fixture without accessing provider services", async ({ page }) => {
  const fixture = fileURLToPath(new URL("./fixtures/market-data-export.html", import.meta.url));
  await page.goto(`file://${fixture}`);
  const rows = await page.locator("article[data-provider-id]").evaluateAll((articles) => articles.map((article) => ({
    id: article.getAttribute("data-provider-id"), name: article.querySelector("h1")?.textContent?.trim(),
    href: article.querySelector("a")?.getAttribute("href"),
  })));
  expect(rows).toHaveLength(2);
  expect(rows[0]).toEqual({ id: "fixture-company-001", name: "Acme & Co.", href: "https://example.invalid/companies/acme" });
  expect(rows[1].name).toBe("Unknown");
});
