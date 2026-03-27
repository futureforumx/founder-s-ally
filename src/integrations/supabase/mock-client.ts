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
    let lastQuery: any[] = [...queryData];

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
        lastQuery = newRows;
        return { data: Array.isArray(row) ? newRows : newRows[0], error: null };
      },
      update: (patch: any) => {
        // In real Supabase, update returns a FilterBuilder. 
        // We'll return the chain so .eq() can be called.
        return chain;
      },
      upsert: async (row: any) => {
        const data = self.getData(table);
        const rows = Array.isArray(row) ? row : [row];
        const updated = [...data, ...rows];
        self.setData(table, updated);
        return { data: row, error: null };
      },
      delete: () => chain,
      eq: (key: string, value: any) => {
        lastQuery = lastQuery.filter(item => item[key] === value);
        return chain;
      },
      neq: (key: string, value: any) => {
        lastQuery = lastQuery.filter(item => item[key] !== value);
        return chain;
      },
      single: async () => ({ data: lastQuery[0] || null, error: null }),
      maybeSingle: async () => ({ data: lastQuery[0] || null, error: null }),
      order: () => chain,
      limit: () => chain,
      range: () => chain,
      // Support the .then() pattern which many finders use
      then: (onfulfilled: any) => {
        return Promise.resolve({ data: lastQuery, error: null }).then(onfulfilled);
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
}

export const mockSupabase = new MockSupabaseClient() as any;
