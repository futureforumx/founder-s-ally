/** Email domains that automatically receive in-app admin (admin console, edge functions). */
export const APP_ADMIN_EMAIL_DOMAINS = ["vekta.so", "kova.vc"] as const;

export function isAppAdminEmailDomain(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  const at = email.indexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return (APP_ADMIN_EMAIL_DOMAINS as readonly string[]).includes(domain);
}
