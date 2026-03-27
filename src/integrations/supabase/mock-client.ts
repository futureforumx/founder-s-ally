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
      return { data: { success: true }, error: null };
    }
  };

  // Database mock
  from(table: string) {
    const self = this;
    const queryData = this.getData(table);
    let patchData: any = null;
    let filters: { key: string; value: any }[] = [];

    const chain = {
      select: (str?: string) => chain,
      insert: async (row: any) => {
        const rows = Array.isArray(row) ? row : [row];
        const newRows = rows.map(r => ({ 
          id: Math.random().toString(36).substring(7), 
          created_at: new Date().toISOString(),
          ...r 
        }));
        const updated = [...self.getData(table), ...newRows];
        self.setData(table, updated);
        return { data: Array.isArray(row) ? newRows : newRows[0], error: null };
      },
      update: (patch: any) => {
        patchData = patch;
        return chain;
      },
      upsert: async (row: any) => {
        const data = self.getData(table);
        const rows = Array.isArray(row) ? row : [row];
        const updated = [...data, ...rows];
        self.setData(table, updated);
        return { data: row, error: null };
      },
      delete: () => {
        patchData = "DELETE"; 
        return chain;
      },
      eq: (key: string, value: any) => {
        filters.push({ key, value });
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
        
        // Apply filters
        let filtered = [...currentData];
        filters.forEach(f => {
          if ((f as any).operator === "in") {
            const valSet = new Set(Array.isArray(f.value) ? f.value : [f.value]);
            filtered = filtered.filter(item => item && valSet.has(item[f.key]));
          } else {
            filtered = filtered.filter(item => item && item[f.key] === f.value);
          }
        });

        // Apply update/delete if requested
        if (patchData) {
          if (patchData === "DELETE") {
            const filteredIds = new Set(filtered.map(i => i?.id));
            currentData = currentData.filter(item => item && !filteredIds.has(item.id));
          } else {
            currentData = currentData.map(item => {
              if (!item) return item;
              const isMatch = filters.every(f => {
                if ((f as any).operator === "in") {
                  const s = new Set(Array.isArray(f.value) ? f.value : [f.value]);
                  return s.has(item[f.key]);
                }
                return item[f.key] === f.value;
              });
              return isMatch ? { ...item, ...patchData, updated_at: new Date().toISOString() } : item;
            });
            filtered = filtered.map(item => item ? { ...item, ...patchData } : item);
          }
          self.setData(table, currentData);
        }

        return Promise.resolve({ data: filtered, error: null }).then(onfulfilled);
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
