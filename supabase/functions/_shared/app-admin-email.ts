export type AppPermission = "user" | "manager" | "admin" | "god";

const APP_MANAGER_EMAIL_DOMAINS = ["vekta.so", "tryvekta.com"] as const;
const GOD_MODE_EMAIL = "matt@vekta.so";

export function normalizeEmail(email: string | null | undefined): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isGodModeEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email) === GOD_MODE_EMAIL;
}

export function isAppAdminEmailDomain(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  const at = normalized.indexOf("@");
  if (at < 0) return false;
  const domain = normalized.slice(at + 1);
  return (APP_MANAGER_EMAIL_DOMAINS as readonly string[]).includes(domain);
}

export function autoPermissionForEmail(email: string | null | undefined): AppPermission | null {
  if (isGodModeEmail(email)) return "god";
  if (isAppAdminEmailDomain(email)) return "manager";
  return null;
}

export function clampGodModeToDesignatedEmail(permission: AppPermission, email: string | null | undefined): AppPermission {
  if (permission !== "god") return permission;
  return isGodModeEmail(email) ? "god" : "admin";
}

export function hasAdminConsoleAccess(permission: AppPermission): boolean {
  return permission === "manager" || permission === "admin" || permission === "god";
}
