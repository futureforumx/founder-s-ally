import {
  galleryCompanyPageSlugs,
  galleryHtmlMatchesCompany,
  galleryProfileIsIncomplete,
  mergeGalleryCompanyProfile,
  pickGalleryCompanyProfileFromHtml,
  type GalleryCompanyProfile,
} from "../../src/lib/galleryCompanyProfile";

const GALLERY_ORIGIN = "https://startups.gallery";

export async function fetchGalleryCompanyProfileFromPages(
  companyName: string,
  slugHint?: string | null,
): Promise<GalleryCompanyProfile> {
  const empty: GalleryCompanyProfile = { sector: null, hqLine: null, description: null };
  const slugs = galleryCompanyPageSlugs(companyName, slugHint);
  let merged = empty;

  for (const slug of slugs) {
    try {
      const res = await fetch(`${GALLERY_ORIGIN}/companies/${encodeURIComponent(slug)}`, {
        redirect: "follow",
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          accept: "text/html,application/xhtml+xml",
        },
      });
      if (!res.ok) continue;
      const html = await res.text();
      if (!galleryHtmlMatchesCompany(html, companyName)) continue;
      merged = mergeGalleryCompanyProfile(merged, pickGalleryCompanyProfileFromHtml(html));
      if (!galleryProfileIsIncomplete(merged)) return merged;
    } catch {
      continue;
    }
  }

  return merged;
}
