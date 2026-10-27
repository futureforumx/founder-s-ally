import { describe, expect, it } from "vitest";
import { validateFundraisingUpload, type FundraisingCategory } from "@/hooks/useFundraisingFiles";
import { getValidatedVideoEmbedUrl } from "@/lib/fundraisingVideo";
import { hasMp4Signature, validateContent } from "../../api/_r2UserAssets";

function file(name: string, type: string, size = 1024) {
  return { name, type, size } as File;
}

describe("fundraising file upload validation", () => {
  it.each(["pdf", "ppt", "pptx"])("accepts material format .%s", (extension) => {
    expect(validateFundraisingUpload("Pitch Deck", file(`deck.${extension}`, "application/octet-stream"))).toBeNull();
    expect(validateFundraisingUpload("One Pager", file(`brief.${extension}`, "application/octet-stream"))).toBeNull();
  });

  it("restricts Demo to MP4 and the configured 25 MB maximum", () => {
    expect(validateFundraisingUpload("Demo", file("demo.mp4", "video/mp4"))).toBeNull();
    expect(validateFundraisingUpload("Demo", file("demo.mov", "video/quicktime"))).toMatch(/MP4/);
    expect(validateFundraisingUpload("Demo", file("demo.mp4", "video/mp4", 25 * 1024 * 1024 + 1))).toMatch(/25 MB/);
  });

  it("rejects unsupported fundraising material formats", () => {
    expect(validateFundraisingUpload("Pitch Deck" as FundraisingCategory, file("deck.key", "application/octet-stream"))).toMatch(/PDF/);
  });

  it("embeds validated providers and rejects arbitrary iframe hosts", () => {
    expect(getValidatedVideoEmbedUrl("https://www.youtube.com/watch?v=abc123XYZ_1")).toBe("https://www.youtube-nocookie.com/embed/abc123XYZ_1");
    expect(getValidatedVideoEmbedUrl("https://www.loom.com/share/loom-token")).toBe("https://www.loom.com/embed/loom-token");
    expect(getValidatedVideoEmbedUrl("https://example.com/video")).toBeNull();
    expect(getValidatedVideoEmbedUrl("javascript:alert(1)")).toBeNull();
  });

  it("validates Demo uploads on the server by declared type and MP4 signature", () => {
    expect(validateContent("demo-video", "demo.mp4", "video/mp4")).toBeNull();
    expect(validateContent("demo-video", "demo.mp4", "application/octet-stream")).toMatch(/MP4/);
    expect(hasMp4Signature(Uint8Array.from([0, 0, 0, 24, 102, 116, 121, 112]))).toBe(true);
    expect(hasMp4Signature(Uint8Array.from([0, 0, 0, 24, 0, 0, 0, 0]))).toBe(false);
  });
});
