import { describe, expect, it, vi, afterEach } from "vitest";
import {
  isValidSubscribeEmail,
  LOOPS_NEWSLETTER_FORM_URL,
  LOOPS_NEWSLETTER_MAILING_LIST_ID,
  submitLoopsNewsletterForm,
} from "@/lib/loopsNewsletterForm";

describe("isValidSubscribeEmail", () => {
  it("accepts a normal address", () => {
    expect(isValidSubscribeEmail("jane@company.com")).toBe(true);
  });

  it("rejects empty or malformed values", () => {
    expect(isValidSubscribeEmail("")).toBe(false);
    expect(isValidSubscribeEmail("not-an-email")).toBe(false);
  });
});

describe("submitLoopsNewsletterForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts urlencoded email and mailing list to the public Loops form endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitLoopsNewsletterForm(" Jane@Company.com ")).resolves.toEqual({ ok: true });

    expect(LOOPS_NEWSLETTER_FORM_URL).toBe(
      "https://app.loops.so/api/newsletter-form/cmn6v8iw50gh10i0b6cp3wseb",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      LOOPS_NEWSLETTER_FORM_URL,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }),
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(Object.keys(headers).some((key) => /authorization|bearer/i.test(key))).toBe(false);
    expect(String(init.body)).toBe(
      `email=Jane%40Company.com&mailingLists=${LOOPS_NEWSLETTER_MAILING_LIST_ID}`,
    );
  });

  it("surfaces Loops error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, message: "Invalid email." }), { status: 400 }),
      ),
    );

    await expect(submitLoopsNewsletterForm("jane@company.com")).resolves.toEqual({
      ok: false,
      message: "Invalid email.",
    });
  });

  it("treats already-on-list as success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, message: "Email already on list." }), {
          status: 400,
        }),
      ),
    );

    await expect(submitLoopsNewsletterForm("jane@company.com")).resolves.toEqual({ ok: true });
  });

  it("handles network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(submitLoopsNewsletterForm("jane@company.com")).resolves.toEqual({
      ok: false,
      message: "Network error. Check your connection and try again.",
    });
  });
});
