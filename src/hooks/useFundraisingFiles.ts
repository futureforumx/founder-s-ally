import { useCallback, useEffect, useState } from "react";
import { supabase, getSupabaseAccessToken } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { deleteR2PitchDeck, getR2PitchDeckSignedUrl, isR2PrivateUrl, uploadR2UserAssetWithProgress } from "@/lib/r2UserAssets";
import { readStoredProfileFields } from "@/hooks/useCompanyProfileFields";

export type FundraisingCategory = "Pitch Deck" | "One Pager" | "Demo";
export type FundraisingFileVersion = {
  id: string;
  document_id: string;
  version_number: number;
  source_kind: "upload" | "video_link";
  storage_ref: string | null;
  external_url: string | null;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
  change_note: string | null;
};
export type FundraisingDocument = {
  id: string;
  user_id: string;
  display_name: string;
  category: FundraisingCategory;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
  versions: FundraisingFileVersion[];
};

const MATERIAL_EXTENSIONS = [".pdf", ".ppt", ".pptx"];
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function tokenSubject(token: string | null) {
  try {
    const part = token?.split(".")[1];
    if (!part) return null;
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch { return null; }
}

export function validateFundraisingUpload(category: FundraisingCategory, file: File): string | null {
  if (file.size > MAX_UPLOAD_BYTES) return "File is over the 25 MB upload limit.";
  const name = file.name.toLowerCase();
  if (category === "Demo") {
    if (!name.endsWith(".mp4") || file.type.toLowerCase() !== "video/mp4") return "Demo uploads must be MP4 video files.";
    return null;
  }
  if (!MATERIAL_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    return "Use a PDF, PPT, or PPTX file.";
  }
  return null;
}

export function useFundraisingFiles() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<FundraisingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const ownerId = useCallback(async () => {
    const token = await getSupabaseAccessToken();
    return tokenSubject(token) ?? user?.id ?? null;
  }, [user?.id]);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("fundraising_file_documents")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const documentRows = data ?? [];
      const { data: versions, error: versionsError } = documentRows.length
        ? await supabase.from("fundraising_file_versions").select("*").in("document_id", documentRows.map((row) => row.id)).order("version_number", { ascending: false })
        : { data: [], error: null };
      if (versionsError) throw versionsError;
      const versionsByDocument = new Map<string, FundraisingFileVersion[]>();
      for (const version of versions ?? []) {
        const list = versionsByDocument.get(version.document_id) ?? [];
        list.push(version);
        versionsByDocument.set(version.document_id, list);
      }
      setDocuments(documentRows.map((row) => ({ ...row, versions: versionsByDocument.get(row.id) ?? [] })) as FundraisingDocument[]);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load fundraising files.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const createDocument = useCallback(async (name: string, category: FundraisingCategory) => {
    const userId = await ownerId();
    if (!userId) throw new Error("Sign in to add a fundraising file.");
    const { data, error } = await supabase.from("fundraising_file_documents")
      .insert({ user_id: userId, display_name: name.trim(), category })
      .select("*").single();
    if (error) throw error;
    const doc = { ...data, versions: [] } as FundraisingDocument;
    await refresh();
    return doc;
  }, [ownerId, refresh]);

  const addUploadVersion = useCallback(async (
    documentId: string,
    category: FundraisingCategory,
    file: File,
    note: string,
    onProgress: (progress: number) => void,
  ) => {
    if (!readStoredProfileFields().stage?.trim()) {
      throw new Error("Set your fundraising round in your company profile before uploading fundraising materials.");
    }
    const validation = validateFundraisingUpload(category, file);
    if (validation) throw new Error(validation);
    const uploaded = await uploadR2UserAssetWithProgress(category === "Demo" ? "demo-video" : "pitch-deck", file, onProgress);
    let data: unknown;
    try {
      const result = await supabase.rpc("add_fundraising_file_version", {
        p_document_id: documentId,
        p_source_kind: "upload",
        p_storage_ref: uploaded.url,
        p_external_url: null,
        p_original_filename: file.name,
        p_mime_type: category === "Demo" ? "video/mp4" : file.type || mimeFromName(file.name),
        p_size_bytes: file.size,
        p_change_note: note.trim() || null,
      });
      if (result.error) throw result.error;
      data = result.data;
    } catch (error) {
      await deleteR2PitchDeck(uploaded.url).catch(() => undefined);
      throw error;
    }
    await refresh();
    return data as FundraisingFileVersion;
  }, [refresh]);

  const addVideoLinkVersion = useCallback(async (documentId: string, url: string, note: string) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("Enter a valid HTTPS video URL.");
    const { data, error } = await supabase.rpc("add_fundraising_file_version", {
      p_document_id: documentId,
      p_source_kind: "video_link",
      p_storage_ref: null,
      p_external_url: parsed.toString(),
      p_original_filename: null,
      p_mime_type: null,
      p_size_bytes: null,
      p_change_note: note.trim() || null,
    });
    if (error) throw error;
    await refresh();
    return data as FundraisingFileVersion;
  }, [refresh]);

  const renameDocument = useCallback(async (documentId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Document name is required.");
    const { error } = await supabase.from("fundraising_file_documents")
      .update({ display_name: trimmed, updated_at: new Date().toISOString() }).eq("id", documentId);
    if (error) throw error;
    await refresh();
  }, [refresh]);

  const updateCategory = useCallback(async (documentId: string, category: FundraisingCategory) => {
    const { error } = await supabase.from("fundraising_file_documents")
      .update({ category, updated_at: new Date().toISOString() }).eq("id", documentId);
    if (error) throw error;
    await refresh();
  }, [refresh]);

  const makeCurrent = useCallback(async (documentId: string, versionId: string) => {
    const { error } = await supabase.rpc("make_fundraising_file_version_current", {
      p_document_id: documentId, p_version_id: versionId,
    });
    if (error) throw error;
    await refresh();
  }, [refresh]);

  const getPreviewUrl = useCallback(async (version: FundraisingFileVersion) => {
    if (version.source_kind === "video_link") return version.external_url;
    if (!version.storage_ref) return null;
    if (isR2PrivateUrl(version.storage_ref)) return getR2PitchDeckSignedUrl(version.storage_ref);
    const { data, error } = await supabase.storage.from("pitch-decks").createSignedUrl(version.storage_ref, 3600);
    if (error) throw error;
    return data.signedUrl;
  }, []);

  return { documents, loading, loadError, refresh, createDocument, addUploadVersion, addVideoLinkVersion, renameDocument, updateCategory, makeCurrent, getPreviewUrl };
}

export function mimeFromName(name: string) {
  const extension = name.toLowerCase().split(".").pop();
  const types: Record<string, string> = {
    pdf: "application/pdf", txt: "text/plain", md: "text/markdown",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    mp4: "video/mp4",
  };
  return types[extension ?? ""] ?? "application/octet-stream";
}

export { MAX_UPLOAD_BYTES, MATERIAL_EXTENSIONS };
