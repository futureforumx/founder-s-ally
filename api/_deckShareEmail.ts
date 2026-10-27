const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseAllowedEmails(value: unknown): string[] {
  if (typeof value !== "string") return [];
  if (value.length > 5000) throw new Error("Use no more than 50 email addresses.");
  const emails = [...new Set(value.split(";").map((item) => item.trim().toLowerCase()).filter(Boolean))];
  if (emails.length > 50) throw new Error("Use no more than 50 email addresses.");
  if (emails.some((email) => email.length > 254 || !EMAIL_PATTERN.test(email))) throw new Error("Enter valid email addresses separated by semicolons.");
  return emails;
}

export function isAllowedDeckViewerEmail(email: string, allowedEmails: unknown): boolean {
  if (!EMAIL_PATTERN.test(email)) return false;
  if (!Array.isArray(allowedEmails) || allowedEmails.length === 0) return true;
  return allowedEmails.some((allowed) => typeof allowed === "string" && allowed.trim().toLowerCase() === email.trim().toLowerCase());
}
