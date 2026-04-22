import type { IncomingMessage } from "http";
import busboy from "busboy";
import { randomUUID } from "node:crypto";
import { getClerkUserIdFromAuthHeader } from "../_clerkFromRequest";
import { getSupabaseServiceClient } from "../_supabaseServiceClient";
import { assertConnectorManagementForUser, isUuid } from "../_ownerContextAccess";

const MAX_BYTES = 12 * 1024 * 1024;

function countCsvLines(buf: Buffer): number {
  const text = buf.toString("utf8");
  if (!text.trim()) return 0;
  let lines = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0x0a) lines++;
  }
  if (!text.endsWith("\n")) lines++;
  return Math.max(0, lines - 1);
}

function parseLinkedinUpload(req: IncomingMessage): Promise<
  | { ok: true; owner_context_id: string; fileName: string; fileData: Buffer }
  | { ok: false; error: string }
> {
  return new Promise((resolve) => {
    let owner_context_id = "";
    let fileName = "upload.csv";
    const chunks: Buffer[] = [];

    const bb = busboy({
      headers: req.headers,
      limits: { fileSize: MAX_BYTES, files: 1, fields: 24 },
    });

    bb.on("field", (name, val) => {
      if (name === "owner_context_id") owner_context_id = String(val).trim();
    });

    bb.on("file", (name, file, info) => {
      if (name !== "file") {
        file.resume();
        return;
      }
      fileName = info.filename || "upload.csv";
      file.on("data", (d: Buffer) => {
        chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d));
      });
    });

    bb.on("partsLimit", () => resolve({ ok: false, error: "Too many parts" }));
    bb.on("filesLimit", () => resolve({ ok: false, error: "Too many files" }));
    bb.on("fieldsLimit", () => resolve({ ok: false, error: "Too many fields" }));

    bb.on("error", (err: Error) => {
      resolve({ ok: false, error: err.message || "Upload parse error" });
    });

    bb.on("finish", () => {
      if (!owner_context_id) {
        resolve({ ok: false, error: "Missing owner_context_id" });
        return;
      }
      const fileData = Buffer.concat(chunks);
      if (!fileData.length) {
        resolve({ ok: false, error: "Missing file" });
        return;
      }
      resolve({ ok: true, owner_context_id, fileName, fileData });
    });

    req.pipe(bb);
  });
}

export async function runLinkedinCsvUpload(
  req: IncomingMessage,
  authHeader: string | undefined,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const parsed = await parseLinkedinUpload(req);
  if (!parsed.ok) {
    return { status: 400, json: { error: parsed.error } };
  }

  if (!isUuid(parsed.owner_context_id)) {
    return { status: 400, json: { error: "owner_context_id must be a UUID" } };
  }

  const userId = await getClerkUserIdFromAuthHeader(authHeader);
  if (!userId) {
    return { status: 401, json: { error: "Missing or invalid Authorization bearer token" } };
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return { status: 500, json: { error: "Server missing Supabase service configuration" } };
  }

  const gate = await assertConnectorManagementForUser(supabase, userId, parsed.owner_context_id);
  if (!gate.ok) {
    return { status: 403, json: { error: gate.message } };
  }

  const rowCount = Math.max(0, countCsvLines(parsed.fileData));
  const externalId = `linkedin_csv:${randomUUID()}`;

  const { error: upErr } = await supabase.from("connected_accounts").insert({
    owner_context_id: parsed.owner_context_id,
    provider: "other",
    account_email: null,
    external_account_id: externalId,
    status: "active",
    last_synced_at: new Date().toISOString(),
    metadata: {
      linkedin_csv_upload: true,
      file_name: parsed.fileName,
      approx_data_rows: rowCount,
      uploaded_at: new Date().toISOString(),
    },
  });

  if (upErr) {
    return { status: 500, json: { error: "Failed to record upload", detail: upErr.message } };
  }

  return {
    status: 200,
    json: {
      ok: true,
      owner_context_id: parsed.owner_context_id,
      file_name: parsed.fileName,
      approx_data_rows: rowCount,
    },
  };
}
