import { describe, expect, it } from "vitest";
import { fetchVCFirmDetail, isIgnorableFirmQueryError } from "@/lib/vcFirmDetail";

type QueryState = {
  table: string;
  eq: Record<string, string>;
  ilike: Record<string, string>;
  usedDeletedAt: boolean;
};

function mockClient(respond: (state: QueryState) => { data: unknown; error: { message: string } | null }) {
  return {
    from(table: string) {
      const state: QueryState = { table, eq: {}, ilike: {}, usedDeletedAt: false };
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      let started: Promise<{ data: unknown; error: { message: string } | null }> | null = null;
      const execute = () => {
        if (!started) started = Promise.resolve().then(() => respond(state));
        return started;
      };
      chain.select = self;
      chain.eq = (col: string, value: string) => {
        state.eq[col] = value;
        return chain;
      };
      chain.ilike = (col: string, value: string) => {
        state.ilike[col] = value;
        return chain;
      };
      chain.is = (col: string) => {
        if (col === "deleted_at") state.usedDeletedAt = true;
        return chain;
      };
      chain.limit = execute;
      chain.maybeSingle = execute;
      return chain;
    },
  };
}

describe("isIgnorableFirmQueryError", () => {
  it("treats missing deleted_at and invalid uuids as skippable", () => {
    expect(isIgnorableFirmQueryError({ message: "column vc_firms.deleted_at does not exist" })).toBe(true);
    expect(isIgnorableFirmQueryError({ message: 'invalid input syntax for type uuid: "a16z.com"' })).toBe(true);
    expect(isIgnorableFirmQueryError({ message: "JWT expired" })).toBe(false);
  });
});

describe("fetchVCFirmDetail", () => {
  it("does not filter vc_firms on deleted_at", async () => {
    const seen: QueryState[] = [];
    const client = mockClient((state) => {
      seen.push({ ...state, eq: { ...state.eq }, ilike: { ...state.ilike } });
      if (state.table === "vc_firms" && state.eq.id === "firm-1") {
        return { data: { id: "firm-1", firm_name: "Acme", slug: "acme" }, error: null };
      }
      return { data: [], error: null };
    });

    const firm = await fetchVCFirmDetail(client as never, "firm-1");
    expect(firm?.id).toBe("firm-1");
    expect(seen.filter((call) => call.table === "vc_firms" && call.usedDeletedAt)).toEqual([]);
  });

  it("falls back to firm_records.domain when vc_firms is the leftover slim table", async () => {
    const client = mockClient((state) => {
      if (state.table === "vc_firms") {
        if (state.eq.id === "a16z.com") {
          return { data: null, error: { message: 'invalid input syntax for type uuid: "a16z.com"' } };
        }
        if (state.eq.slug) {
          return { data: null, error: { message: "column vc_firms.slug does not exist" } };
        }
        return { data: null, error: { message: "column vc_firms.website_url does not exist" } };
      }
      if (state.table === "firm_records" && state.eq.domain === "a16z.com") {
        return {
          data: {
            id: "e63728aa-a93a-4977-895d-0d98e6e2e748",
            firm_name: "Andreessen Horowitz",
            slug: "andreessen-horowitz",
            domain: "a16z.com",
            website_url: "https://a16z.com",
          },
          error: null,
        };
      }
      return { data: [], error: null };
    });

    const firm = await fetchVCFirmDetail(client as never, "a16z.com");
    expect(firm?.firm_name).toBe("Andreessen Horowitz");
    expect(firm?.website_url).toBe("https://a16z.com");
  });
});
