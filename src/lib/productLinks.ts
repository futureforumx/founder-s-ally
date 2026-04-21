/**
 * Marketing site — features anchor (waitlist / referrals CTAs).
 * Override with `VITE_PRODUCT_FEATURES_URL` when needed.
 */
const envUrl = import.meta.env.VITE_PRODUCT_FEATURES_URL;
export const PRODUCT_FEATURES_URL =
  typeof envUrl === "string" && envUrl.trim() !== "" ? envUrl.trim() : "https://tryvekta.com/#features";
