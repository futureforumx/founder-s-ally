import { test, expect } from "../playwright-fixture";

test.describe("Profile settings fields", () => {
  test("validates required fields and allows confirming profile details", async ({ page }) => {
    await page.goto("/?view=settings&tab=account");

    const onboardingModal = page.getByText("Welcome to Vekta. Let's sync your company.");
    if (await onboardingModal.isVisible()) {
      await page.getByRole("button", { name: "Skip for now" }).click();
    }

    const personalCard = page.locator('[data-tour-section="profile"]');
    await expect(personalCard).toBeVisible();
    await expect(personalCard.getByText("Personal Information")).toBeVisible();

    const nameInputs = personalCard.locator('[data-field="full_name"] input');
    await expect(nameInputs).toHaveCount(2);

    const firstName = nameInputs.nth(0);
    const lastName = nameInputs.nth(1);
    const title = personalCard.locator('[data-field="title"] input').first();
    const location = personalCard.locator('[data-field="location"] input').first();
    const bio = personalCard.locator('[data-field="bio"] textarea').first();

    // Force one required field missing to verify validation feedback.
    await firstName.fill("");
    await lastName.fill("Thompson");
    await title.fill("Founder & CEO");
    await title.blur();
    await location.fill("New York, NY");
    await location.blur();
    await bio.fill("Building a high-conviction investor intelligence platform.");

    await personalCard.getByRole("button", { name: "Confirm Details" }).click();
    await expect(page.getByText("Please complete all required fields")).toBeVisible();

    await firstName.fill("Matthew");
    await lastName.fill("Thompson");
    await title.fill("Founder & CEO");
    await title.blur();
    await location.fill("New York, NY");
    await location.blur();
    await bio.fill("Building a high-conviction investor intelligence platform.");

    await expect(firstName).toHaveValue("Matthew");
    await expect(lastName).toHaveValue("Thompson");
    await expect(title).toHaveValue("Founder & CEO");
    await expect(location).toHaveValue("New York, NY");
    await expect(bio).toHaveValue("Building a high-conviction investor intelligence platform.");

    await personalCard.getByRole("button", { name: "Confirm Details" }).click();
    await expect(page.getByText("Profile details confirmed")).toBeVisible();
  });
});
