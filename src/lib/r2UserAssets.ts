import { getSupabaseBearerForFunctions } from "@/integrations/supabase/client";

export type R2UserAssetType = "pitch-deck" | "demo-video" | "company-logo" | "founder-headshot";

export type R2UploadResult = {
  ok: true;
  key: string;
  url: string;
  bucket: string;
};

async function authHeaders(): Promise<Record<string, string>> {
  const jwt = await getSupabaseBearerForFunctions();
  return jwt ? { Authorization: `Bearer ${jwt}` } : {};
}

export async function uploadR2UserAsset(assetType: R2UserAssetType, file: File): Promise<R2UploadResult> {
  const form = new FormData();
  form.set("asset_type", assetType);
  form.set("file", file);
  const res = await fetch("/api/r2-user-assets/upload", {
    method: "POST",
    headers: await authHeaders(),
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error ? String(json.error) : `R2 upload failed (${res.status})`);
  }
  return json as R2UploadResult;
}

export function uploadR2UserAssetWithProgress(
  assetType: R2UserAssetType,
  file: File,
  onProgress: (progress: number) => void,
): Promise<R2UploadResult> {
  const form = new FormData();
  form.set("asset_type", assetType);
  form.set("file", file);
  return authHeaders().then((headers) => new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/r2-user-assets/upload");
    Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("Network error while uploading. Check your connection and try again."));
    request.onabort = () => reject(new Error("Upload canceled."));
    request.onload = () => {
      let json: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(request.responseText || "{}");
        if (parsed && typeof parsed === "object") json = parsed as Record<string, unknown>;
      } catch { json = {}; }
      if (request.status < 200 || request.status >= 300 || !json?.ok) {
        reject(new Error(typeof json.error === "string" ? json.error : `Upload failed (${request.status}).`));
        return;
      }
      resolve(json as unknown as R2UploadResult);
    };
    request.send(form);
  }));
}

export async function getR2PitchDeckSignedUrl(fileUrl: string): Promise<string | null> {
  const res = await fetch("/api/r2-user-assets/signed-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ file_url: fileUrl }),
  });
  const json = await res.json().catch(() => ({}));
  return res.ok && typeof json?.signedUrl === "string" ? json.signedUrl : null;
}

export async function deleteR2PitchDeck(fileUrl: string): Promise<void> {
  const res = await fetch("/api/r2-user-assets/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ file_url: fileUrl }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.error ? String(json.error) : `R2 delete failed (${res.status})`);
  }
}

export function isR2PrivateUrl(fileUrl: string): boolean {
  return fileUrl.trim().startsWith("r2://");
}
