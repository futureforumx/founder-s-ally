export type LoopsMailingListSyncResult = {
  synced: boolean;
  status: "synced" | "not_configured" | "list_not_found" | "failed";
  listName: string;
  listId?: string;
  subscribed: boolean;
  detail?: string;
};

type LoopsList = {
  id?: unknown;
  name?: unknown;
};

type SyncLoopsMailingListInput = {
  apiKey?: string | null;
  listName: string;
  contact: {
    id: string;
    email: string;
    name: string | null;
  };
  subscribed: boolean;
  fetchImpl?: typeof fetch;
};

function providerDetail(status: number, responseBody: string): string {
  let detail = `Loops HTTP ${status}`;
  try {
    const parsed = JSON.parse(responseBody) as {
      message?: unknown;
      error?: { message?: unknown };
    };
    const message = parsed.message ?? parsed.error?.message;
    if (typeof message === "string" && message.trim()) {
      detail += `: ${message.trim().slice(0, 240)}`;
    }
  } catch {
    // Avoid returning arbitrary provider HTML or proxy responses.
  }
  return detail;
}

export async function syncLoopsMailingList(
  input: SyncLoopsMailingListInput,
): Promise<LoopsMailingListSyncResult> {
  const apiKey = input.apiKey?.trim();
  const listName = input.listName.trim();
  const fetchImpl = input.fetchImpl ?? fetch;

  if (!apiKey) {
    return {
      synced: false,
      status: "not_configured",
      listName,
      subscribed: input.subscribed,
      detail: "Loops API key is not configured",
    };
  }

  try {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
    const listsResponse = await fetchImpl("https://app.loops.so/api/v1/lists", { headers });
    const listsBodyText = await listsResponse.text().catch(() => "");
    if (!listsResponse.ok) {
      return {
        synced: false,
        status: "failed",
        listName,
        subscribed: input.subscribed,
        detail: providerDetail(listsResponse.status, listsBodyText),
      };
    }

    let parsedLists: LoopsList[] = [];
    try {
      const parsed = JSON.parse(listsBodyText) as LoopsList[] | { data?: LoopsList[] };
      parsedLists = Array.isArray(parsed) ? parsed : Array.isArray(parsed.data) ? parsed.data : [];
    } catch {
      return {
        synced: false,
        status: "failed",
        listName,
        subscribed: input.subscribed,
        detail: "Loops returned an invalid mailing-list response",
      };
    }

    const targetName = listName.toLowerCase();
    const target = parsedLists.find((item) =>
      typeof item.name === "string" && item.name.trim().toLowerCase() === targetName
    );
    const listId = typeof target?.id === "string" ? target.id.trim() : "";
    if (!listId) {
      return {
        synced: false,
        status: "list_not_found",
        listName,
        subscribed: input.subscribed,
        detail: `Loops mailing list "${listName}" was not found`,
      };
    }

    const firstName = input.contact.name?.trim().split(/\s+/)[0] || undefined;
    const updateResponse = await fetchImpl("https://app.loops.so/api/v1/contacts/update", {
      method: "PUT",
      headers,
      body: JSON.stringify({
        email: input.contact.email,
        userId: input.contact.id,
        ...(firstName ? { firstName } : {}),
        mailingLists: { [listId]: input.subscribed },
      }),
    });
    const updateBodyText = await updateResponse.text().catch(() => "");
    if (!updateResponse.ok) {
      return {
        synced: false,
        status: "failed",
        listName,
        listId,
        subscribed: input.subscribed,
        detail: providerDetail(updateResponse.status, updateBodyText),
      };
    }

    return {
      synced: true,
      status: "synced",
      listName,
      listId,
      subscribed: input.subscribed,
    };
  } catch (error) {
    return {
      synced: false,
      status: "failed",
      listName,
      subscribed: input.subscribed,
      detail: error instanceof Error ? error.message : "Unexpected Loops error",
    };
  }
}
