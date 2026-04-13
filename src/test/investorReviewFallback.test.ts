// @vitest-environment node

import {
  buildInvestorReviewUpsertRow,
  pickInvestorReviewRowForPerson,
  upsertInvestorReviewWithSchemaFallback,
} from "@/lib/investorReviewFallback";

function createMockDb() {
  const operations: Array<Record<string, unknown>> = [];
  const state = {
    exactSelectResult: { data: [] as unknown[], error: null as Record<string, unknown> | null },
    legacySelectResult: { data: [] as unknown[], error: null as Record<string, unknown> | null },
    updateResult: { error: null as Record<string, unknown> | null },
    insertResult: { error: null as Record<string, unknown> | null },
  };

  const db = {
    from(table: string) {
      return {
        select(columns: string) {
          const filters: Array<{ kind: string; column?: string; value?: unknown; field?: string; options?: unknown }> = [];
          return {
            eq(column: string, value: unknown) {
              filters.push({ kind: "eq", column, value });
              return this;
            },
            order(field: string, options: unknown) {
              filters.push({ kind: "order", field, options });
              return this;
            },
            async limit(value: number) {
              filters.push({ kind: "limit", value });
              operations.push({ type: "select", table, columns, filters: [...filters] });
              const usesPersonId = filters.some((filter) => filter.kind === "eq" && filter.column === "person_id");
              return usesPersonId ? state.exactSelectResult : state.legacySelectResult;
            },
          };
        },
        update(patch: Record<string, unknown>) {
          const filters: Array<{ column: string; value: unknown }> = [];
          return {
            eq(column: string, value: unknown) {
              filters.push({ column, value });
              if (column === "id") {
                operations.push({ type: "update", table, patch, filters: [...filters] });
                return Promise.resolve(state.updateResult);
              }
              return this;
            },
          };
        },
        async insert(payload: Record<string, unknown>) {
          operations.push({ type: "insert", table, payload });
          return state.insertResult;
        },
      };
    },
  };

  return { db, state, operations };
}

describe("investorReviewFallback", () => {
  it("omits person_id on insert when investor_reviews schema cache is stale", async () => {
    const { db, state, operations } = createMockDb();
    state.exactSelectResult.error = {
      code: "PGRST204",
      message: "Could not find the 'person_id' column of 'investor_reviews' in the schema cache",
    };

    const result = await upsertInvestorReviewWithSchemaFallback({
      db,
      userId: "founder_123",
      payload: {
        vc_firm_id: "firm_123",
        vc_person_id: "person_123",
        interaction_type: "investor_relationship",
        nps: 9,
        comment: "Strong follow through",
        anonymous: false,
        star_ratings: {
          firm_name: "Acme Ventures",
          remember_who_vc_person_ids: ["person_123"],
        },
      },
    });

    expect(result.error).toBeNull();
    expect(result.usedSchemaFallback).toBe(true);

    const insertOp = operations.find((op) => op.type === "insert");
    expect(insertOp).toBeDefined();
    expect(insertOp?.payload).toMatchObject({
      founder_id: "founder_123",
      firm_id: "firm_123",
      interaction_type: "investor_relationship",
      nps_score: 9,
    });
    expect(insertOp?.payload).not.toHaveProperty("person_id");
  });

  it("updates the matched legacy row when schema fallback can recover the person context", async () => {
    const { db, state, operations } = createMockDb();
    state.exactSelectResult.error = {
      code: "PGRST204",
      message: "Could not find the 'person_id' column of 'investor_reviews' in the schema cache",
    };
    state.legacySelectResult.data = [
      {
        id: "legacy_review_1",
        created_at: "2026-04-13T12:00:00.000Z",
        star_ratings: {
          remember_who_vc_person_ids: ["person_123"],
        },
      },
    ];

    const result = await upsertInvestorReviewWithSchemaFallback({
      db,
      userId: "founder_123",
      payload: {
        vc_firm_id: "firm_123",
        vc_person_id: "person_123",
        interaction_type: "investor_relationship",
        nps: 7,
        comment: "Updated note",
        anonymous: true,
        star_ratings: {
          firm_name: "Acme Ventures",
          remember_who_vc_person_ids: ["person_123"],
        },
      },
    });

    expect(result.error).toBeNull();
    expect(result.usedSchemaFallback).toBe(true);

    const updateOp = operations.find((op) => op.type === "update");
    expect(updateOp).toBeDefined();
    expect(updateOp?.filters).toEqual([{ column: "id", value: "legacy_review_1" }]);
    expect(operations.find((op) => op.type === "insert")).toBeUndefined();
  });

  it("prefers the review whose remembered people match the requested person", () => {
    const picked = pickInvestorReviewRowForPerson(
      [
        { id: "firm_only", star_ratings: {} },
        { id: "person_scoped", star_ratings: { remember_who_vc_person_ids: ["person_123"] } },
      ],
      "person_123",
    );

    expect(picked?.id).toBe("person_scoped");
  });

  it("builds the legacy investor review row with sane defaults", () => {
    expect(
      buildInvestorReviewUpsertRow("founder_123", {
        star_ratings: { firm_name: "Acme Ventures" },
      }),
    ).toMatchObject({
      founder_id: "founder_123",
      firm_id: "Acme Ventures",
      person_id: "",
      interaction_type: "investor_relationship",
      nps_score: 0,
      is_anonymous: true,
    });
  });
});