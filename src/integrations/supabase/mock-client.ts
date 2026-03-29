/**
 * A highly simplified mock of the Supabase client that uses local storage.
 * This allows the UI to function (login, onboarding, networking, workspace creation)
 * without a real Supabase backend.
 */

class MockSupabaseClient {
  private getStorageKey(table: string) {
    return `mock-supabase-${table}`;
  }

  private getData(table: string): any[] {
    try {
      const data = localStorage.getItem(this.getStorageKey(table));
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private setData(table: string, data: any[]) {
    localStorage.setItem(this.getStorageKey(table), JSON.stringify(data));
  }

  // Auth mock
  auth = {
    onAuthStateChange: (cb: any) => {
      // Mock "eventUAL" callback in next tick
      setTimeout(() => cb("SIGNED_IN", { user: { id: "mock-user-id", email: "founder@vekta.so" } }), 100);
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
    getUser: async () => ({ data: { user: { id: "mock-user-id", email: "founder@vekta.so" } }, error: null }),
    signOut: async () => ({ error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
  };

  // Functions mock
  functions = {
    invoke: async (name: string, payload: any) => {
      console.log(`[Mock] Invoking edge function: ${name}`, payload);
      // Return mock success for common functions
      if (name === "sync-company-linkedin") {
        return { 
          data: { 
            success: true, 
            data: { 
              company_name: "Mock Corp", 
              description: "AI-powered innovation", 
              website_url: payload.body.companyUrl || "mock.so",
              sector: "Enterprise AI",
              hq_location: "San Francisco, CA"
            } 
          }, 
          error: null 
        };
      }
      if (name === "sync-linkedin-profile") {
        return {
          data: {
            success: true,
            data: {
              full_name: "Alex Founder",
              title: "CEO & Co-founder · MockCo",
              bio: null,
              location: "San Francisco, CA",
              avatar_url: null,
              linkedin_url: String(payload?.body?.linkedinUrl || "https://linkedin.com/in/mock"),
              source: "mock",
            },
          },
          error: null,
        };
      }
      if (name === "market-updates") {
        return {
          data: {
            source: "mock",
            headlines: [
              {
                title: "Mock headline: sector activity",
                summary: "Local mock data for market pulse without Supabase functions.",
                relevance: `Illustrative relevance for ${payload?.body?.sector || "your sector"}.`,
              },
            ],
          },
          error: null,
        };
      }
      if (name === "research-agent") {
        return {
          data: {
            answer: "Mock research-agent: configure Supabase secrets (TAVILY_API_KEY, etc.) for live pipeline.",
            modelUsed: "mock",
            searchProvider: "none",
            topHits: [],
            urlReads: [],
            intents: { preferExa: false },
            strategy: {},
          },
          error: null,
        };
      }
      if (name === "create-company-workspace") {
        return {
          data: {
            success: true,
            companyId: "00000000-0000-4000-8000-000000000001",
            created: true,
          },
          error: null,
        };
      }
      if (name === "claim-company-workspace") {
        return {
          data: {
            success: true,
            companyId: "00000000-0000-4000-8000-000000000002",
            membershipId: "00000000-0000-4000-8000-000000000003",
          },
          error: null,
        };
      }
      if (name === "complete-founder-onboarding") {
        return { data: { success: true }, error: null };
      }
      if (name === "admin-list-users") {
        return { data: { users: [] }, error: null };
      }
      if (name === "admin-record-updates") {
        return { data: { updates: [] }, error: null };
      }
      if (name === "admin-update-permission") {
        return { data: { success: true }, error: null };
      }
      if (name === "intelligence-feed") {
        const action = payload?.body?.action || "feed";
        if (action === "summary") {
          return {
            data: {
              summary: {
                highSignal24h: 5,
                investorActivity: 7,
                competitorMoves: 4,
                peopleMoves: 3,
                newFunds: 2,
                productLaunches: 3,
                regulatory: 1,
              },
            },
            error: null,
          };
        }
        const demoEvents = [
          {
            id: "mock-e1",
            event_type: "new_investment_made",
            category: "investors",
            title: "Apex Ventures leads Series B for DataForge (mock)",
            summary: "Mock intelligence card when Supabase functions are not deployed.",
            why_it_matters: "Illustrates how canonical events surface with interpretation, not raw RSS.",
            confidence_score: 0.85,
            importance_score: 0.8,
            relevance_score: 0.78,
            sentiment: "positive",
            first_seen_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            canonical_source_url: "https://example.com/mock",
            source_count: 2,
            metadata: {},
            entities: [
              { id: "mock-ent1", type: "fund", name: "Apex Ventures", role: "investor" },
              { id: "mock-ent2", type: "company", name: "DataForge", role: "subject" },
            ],
            saved: false,
            rank: 0.81,
          },
        ];
        return {
          data: {
            events: action === "feed" ? demoEvents : demoEvents,
            meta: { limit: 15, offset: 0 },
            sideRail: {
              trendingInvestors: [{ id: "m1", name: "Apex Ventures", type: "fund" }],
              newFunds: [{ id: "m2", name: "Harbor Fund II", type: "fund" }],
              peopleMoves: [{ id: "m3", name: "Jamie Chen", type: "person" }],
              risingTopics: ["Agentic workflows", "EU AI Act", "Mid-market security"],
            },
          },
          error: null,
        };
      }
      return { data: { success: true }, error: null };
    }
  };

  // Database mock
  from(table: string) {
    const self = this;
    let patchData: any = null;
    let filters: { key: string; value: any; operator?: string }[] = [];
    let mutation:
      | null
      | { type: "insert"; rows: any[] }
      | { type: "upsert"; rows: any[] }
      | { type: "delete" }
      | { type: "update"; patch: any } = null;

    const chain = {
      select: (str?: string) => chain,
      insert: (row: any) => {
        mutation = { type: "insert", rows: Array.isArray(row) ? row : [row] };
        return chain;
      },
      update: (patch: any) => {
        patchData = patch;
        mutation = { type: "update", patch };
        return chain;
      },
      upsert: (row: any) => {
        mutation = { type: "upsert", rows: Array.isArray(row) ? row : [row] };
        return chain;
      },
      delete: () => {
        patchData = "DELETE";
        mutation = { type: "delete" };
        return chain;
      },
      eq: (key: string, value: any) => {
        filters.push({ key, value });
        return chain;
      },
      is: (key: string, value: any) => {
        filters.push({ key, value, operator: "is" } as { key: string; value: any; operator: string });
        return chain;
      },
      neq: (key: string, value: any) => {
        // Simple mock: just ignore for now or implement if needed
        return chain;
      },
      single: async () => {
        const res = await (chain as any);
        return { data: res.data[0] || null, error: null };
      },
      maybeSingle: async () => {
        const res = await (chain as any);
        return { data: res.data[0] || null, error: null };
      },
      in: (key: string, values: any[]) => {
        filters.push({ key, value: values, operator: "in" });
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      range: () => chain,
      then: (onfulfilled: any) => {
        let currentData = self.getData(table);
        let resultData: any = null;
        
        // Apply filters
        let filtered = [...currentData];
        filters.forEach((f) => {
          const op = (f as { operator?: string }).operator;
          if (op === "in") {
            const valSet = new Set(Array.isArray(f.value) ? f.value : [f.value]);
            filtered = filtered.filter((item) => item && valSet.has(item[f.key]));
          } else if (op === "is") {
            if (f.value === null) {
              filtered = filtered.filter(
                (item) => item && (item[f.key] === null || item[f.key] === undefined),
              );
            } else {
              filtered = filtered.filter((item) => item && item[f.key] === f.value);
            }
          } else {
            filtered = filtered.filter((item) => item && item[f.key] === f.value);
          }
        });

        // Apply mutations
        if (mutation?.type === "insert") {
          const newRows = mutation.rows.map(r => ({
            id: r?.id || Math.random().toString(36).substring(7),
            created_at: r?.created_at || new Date().toISOString(),
            ...r,
          }));
          currentData = [...currentData, ...newRows];
          self.setData(table, currentData);
          resultData = newRows;
        } else if (mutation?.type === "upsert") {
          const rows = mutation.rows.map(r => ({
            id: r?.id || Math.random().toString(36).substring(7),
            created_at: r?.created_at || new Date().toISOString(),
            ...r,
          }));
          const byId = new Map(currentData.map(item => [item?.id, item]));
          for (const row of rows) {
            byId.set(row.id, { ...(byId.get(row.id) || {}), ...row, updated_at: new Date().toISOString() });
          }
          currentData = Array.from(byId.values());
          self.setData(table, currentData);
          resultData = rows;
        } else if (patchData) {
          if (patchData === "DELETE") {
            const filteredIds = new Set(filtered.map(i => i?.id));
            currentData = currentData.filter(item => item && !filteredIds.has(item.id));
            resultData = filtered;
          } else {
            currentData = currentData.map(item => {
              if (!item) return item;
              const isMatch = filters.every((f) => {
                const op = (f as { operator?: string }).operator;
                if (op === "in") {
                  const s = new Set(Array.isArray(f.value) ? f.value : [f.value]);
                  return s.has(item[f.key]);
                }
                if (op === "is") {
                  return f.value === null
                    ? item[f.key] === null || item[f.key] === undefined
                    : item[f.key] === f.value;
                }
                return item[f.key] === f.value;
              });
              return isMatch ? { ...item, ...patchData, updated_at: new Date().toISOString() } : item;
            });
            filtered = filtered.map(item => item ? { ...item, ...patchData } : item);
              resultData = filtered;
          }
          self.setData(table, currentData);
        }

          return Promise.resolve({ data: resultData ?? filtered, error: null }).then(onfulfilled);
      }
    };
    
    return chain as any;
  }

  // RPC mock
  rpc = async (name: string, args: any) => ({ data: null, error: null });

  // Realtime mock
  channel = (name: string) => ({
    on: () => ({
      subscribe: () => ({
        unsubscribe: () => {}
      })
    }),
    subscribe: () => ({
      unsubscribe: () => {}
    })
  });

  removeChannel = async (channel: any) => {};
  removeAllChannels = async () => {};
}

export const mockSupabase = new MockSupabaseClient() as any;
