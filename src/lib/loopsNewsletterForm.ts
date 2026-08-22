/** Public Loops form endpoint — no API key. Do not send Authorization/Bearer headers. */
export const LOOPS_NEWSLETTER_FORM_URL =
  "https://app.loops.so/api/newsletter-form/cmn6v8iw50gh10i0b6cp3wseb";

export const LOOPS_NEWSLETTER_MAILING_LIST_ID = "cmt3mld4k1xly0jxmb2ky4ykr";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidSubscribeEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

type LoopsFormResponse = {
  success?: boolean;
  message?: string;
};

function messageFromResponse(data: LoopsFormResponse | null, status: number): string {
  const message = data?.message?.trim();
  if (status === 429) {
    return message || "Too many signups, please try again in a little while.";
  }
  return message || "Couldn't subscribe. Please try again.";
}

/**
 * Public Loops form POST. Browser-safe; must not include an API key.
 */
export async function submitLoopsNewsletterForm(
  email: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const cleanEmail = email.trim();
  if (!isValidSubscribeEmail(cleanEmail)) {
    return { ok: false, message: "Enter a valid email." };
  }

  try {
    const response = await fetch(LOOPS_NEWSLETTER_FORM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: cleanEmail,
        mailingLists: LOOPS_NEWSLETTER_MAILING_LIST_ID,
      }),
    });

    let data: LoopsFormResponse | null = null;
    try {
      data = (await response.json()) as LoopsFormResponse;
    } catch {
      data = null;
    }

    const alreadyOnList = /already on list/i.test(data?.message ?? "");
    if (response.status === 200 || alreadyOnList) {
      return { ok: true };
    }

    return { ok: false, message: messageFromResponse(data, response.status) };
  } catch {
    return { ok: false, message: "Network error. Check your connection and try again." };
  }
}
