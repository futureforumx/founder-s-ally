import { describe, expect, it, vi } from "vitest";
import { syncLoopsMailingList } from "../../supabase/functions/_shared/loops-mailing-list";

describe("syncLoopsMailingList", () => {
  it("resolves Approved Users by name and subscribes the contact", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: "list-waitlist", name: "Waitlist" },
        { id: "list-approved", name: "Approved Users" },
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    const result = await syncLoopsMailingList({
      apiKey: "secret",
      listName: "Approved Users",
      contact: { id: "user-1", email: "founder@example.com", name: "Ada Founder" },
      subscribed: true,
      fetchImpl,
    });

    expect(result).toMatchObject({
      synced: true,
      status: "synced",
      listId: "list-approved",
      subscribed: true,
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://app.loops.so/api/v1/contacts/update",
      expect.objectContaining({ method: "PUT" }),
    );
    const updateRequest = fetchImpl.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(updateRequest.body))).toEqual({
      email: "founder@example.com",
      userId: "user-1",
      firstName: "Ada",
      mailingLists: { "list-approved": true },
    });
  });

  it("removes a contact from the list when approval is revoked", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: "list-approved", name: "Approved Users" }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    const result = await syncLoopsMailingList({
      apiKey: "secret",
      listName: "approved users",
      contact: { id: "user-2", email: "founder2@example.com", name: null },
      subscribed: false,
      fetchImpl,
    });

    expect(result.synced).toBe(true);
    const updateRequest = fetchImpl.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(updateRequest.body)).mailingLists).toEqual({ "list-approved": false });
  });

  it("reports a missing list without updating the contact", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: "list-waitlist", name: "Waitlist" }]), { status: 200 }),
    );

    const result = await syncLoopsMailingList({
      apiKey: "secret",
      listName: "Approved Users",
      contact: { id: "user-3", email: "founder3@example.com", name: "Founder" },
      subscribed: true,
      fetchImpl,
    });

    expect(result).toMatchObject({ synced: false, status: "list_not_found" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
