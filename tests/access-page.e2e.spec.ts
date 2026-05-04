import { test, expect } from "../playwright-fixture";

test.describe("/access request form", () => {
  test("keeps submit clicks reliable while surfacing validation feedback", async ({ page }) => {
    await page.goto("/access");

    const form = page.locator("form").first();
    await expect(form).toHaveAttribute("novalidate", "");

    await page.getByLabel(/first name/i).fill("Jane");
    await page.getByLabel(/last name/i).fill("Doe");
    await page.getByLabel(/work email/i).fill("not-an-email");
    await page.getByRole("button", { name: /request access|get early access/i }).click();

    await expect(form.getByRole("alert").first()).toContainText("You sure that's right?");
    await expect(page.locator("#access-email")).toBeFocused();

    await page.getByLabel(/work email/i).fill("jane@example.com");
    await page.getByLabel(/role/i).selectOption("founder");
    await page.getByLabel(/^Stage/i).selectOption("seed");
    await page.getByLabel(/sector/i).selectOption("other");
    await page.getByLabel(/your sector/i).fill("Space logistics");
    await expect(page.locator("#access-sector-reinforce")).toContainText("Space logistics");
    await page.getByLabel(/Find investors/i).check();
    await page.getByLabel(/Company name or website/i).fill("Acme AI");
    await page.getByLabel(/LinkedIn or X profile/i).fill("not-a-profile");
    await page.getByRole("button", { name: /request access|get early access/i }).click();

    await expect(form.getByRole("alert").first()).toContainText("Enter a valid LinkedIn or X profile");
    await expect(page.locator("#access-social-profile")).toBeFocused();
  });

  test("submits a complete founder request", async ({ page }) => {
    await page.goto("/access");

    await page.getByLabel(/first name/i).fill("Jane");
    await page.getByLabel(/last name/i).fill("Doe");
    await page.getByLabel(/work email/i).fill("jane@example.com");
    await page.getByLabel(/role/i).selectOption("founder");
    await page.getByLabel(/^Stage/i).selectOption("seed");
    await page.getByLabel(/sector/i).selectOption("ai_ml");
    await page.getByLabel(/Find investors/i).check();
    await page.getByLabel(/Company name or website/i).fill("Acme AI");
    await page.getByLabel(/LinkedIn or X profile/i).fill("@janedoe");

    const submit = page.getByRole("button", { name: /get early access/i });
    await submit.scrollIntoViewIfNeeded();
    const submitBox = await submit.boundingBox();
    expect(submitBox).not.toBeNull();
    const centerTarget = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.tagName,
      {
        x: submitBox!.x + submitBox!.width / 2,
        y: submitBox!.y + submitBox!.height / 2,
      },
    );
    expect(centerTarget).toBe("BUTTON");

    await submit.click();

    await expect(page.getByText(/You’re on the waitlist|You're on the waitlist/)).toBeVisible();
  });
});
