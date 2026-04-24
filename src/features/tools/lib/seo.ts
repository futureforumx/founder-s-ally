import { useEffect } from "react";
import type { BreadcrumbItem } from "@/features/tools/types";

type SeoInput = {
  title: string;
  description: string;
  canonicalPath: string;
  structuredData?: Array<Record<string, unknown>>;
};

function getSiteOrigin() {
  const envOrigin = String(import.meta.env.VITE_SITE_URL ?? "").trim().replace(/\/$/, "");
  if (envOrigin) return envOrigin;
  if (typeof window !== "undefined") return window.location.origin;
  return "https://vekta.app";
}

function upsertMeta(selector: string, attrs: Record<string, string>) {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([key, value]) => el?.setAttribute(key, value));
}

function upsertLink(selector: string, attrs: Record<string, string>) {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector(selector) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([key, value]) => el?.setAttribute(key, value));
}

export function buildBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: `${getSiteOrigin()}${item.href}` } : {}),
    })),
  };
}

export function usePageSeo({ title, description, canonicalPath, structuredData = [] }: SeoInput) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const canonicalUrl = `${getSiteOrigin()}${canonicalPath}`;
    document.title = title;
    upsertMeta('meta[name="description"]', { name: "description", content: description });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: title });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonicalUrl });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    upsertLink('link[rel="canonical"]', { rel: "canonical", href: canonicalUrl });

    document.head.querySelectorAll('script[data-vekta-seo="true"]').forEach((node) => node.remove());
    structuredData.forEach((item) => {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.setAttribute("data-vekta-seo", "true");
      script.textContent = JSON.stringify(item);
      document.head.appendChild(script);
    });
  }, [canonicalPath, description, structuredData, title]);
}

export function getCanonicalUrl(path: string) {
  return `${getSiteOrigin()}${path}`;
}
