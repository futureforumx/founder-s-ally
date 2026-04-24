"""
Push all VEKTA project memories to mem0.
Run: python3 push_memories_to_mem0.py
"""

from mem0 import MemoryClient

MEM0_API_KEY = "m0-ZrxgwmYHXa845kEA1JO1dUZpJ0NibjLfyCtN5RZl"
USER_ID = "matt@vekta.so"

client = MemoryClient(api_key=MEM0_API_KEY)

memories = [
    {
        "category": "path",
        "messages": [
            {"role": "user", "content": "What is the VEKTA APP project path?"},
            {"role": "assistant", "content": "The VEKTA APP project is located at `/Users/matthewthompson/VEKTA APP` on Matthew's Mac. Always use this exact path in any terminal command. Do not guess or use /Documents/ or any other path — the user has corrected this multiple times."},
        ],
    },
    {
        "category": "overview",
        "messages": [
            {"role": "user", "content": "What is the VEKTA project?"},
            {"role": "assistant", "content": "VEKTA (formerly Founder's Ally) is a Supabase-powered application for founder tools and investor relations, deployed at https://founder-s-ally.vercel.app. The Supabase project URL is https://zmnlsdohtwztneamvwaq.supabase.co. The GitHub repo is futureforumx/founder-s-ally. User: Matthew Thompson, matt@vekta.so."},
        ],
    },
    {
        "category": "integrations",
        "messages": [
            {"role": "user", "content": "What are the key integrations in VEKTA?"},
            {"role": "assistant", "content": "VEKTA integrates: Supabase (database + auth + edge functions), WorkOS AuthKit (auth provider, VITE_AUTH_PROVIDER=workos), Clerk (also configured), Vercel (deployment at founder-s-ally.vercel.app), OpenRouter (LLM), Gemini API, Exa API (search), mem0 (memory layer). WorkOS redirect URI: http://localhost:5173/fresh-capital."},
        ],
    },
    {
        "category": "environment",
        "messages": [
            {"role": "user", "content": "What env vars does VEKTA use?"},
            {"role": "assistant", "content": "VEKTA .env.local: SUPABASE_URL=https://zmnlsdohtwztneamvwaq.supabase.co, VITE_AUTH_PROVIDER=workos, WORKOS_CLIENT_ID=client_01KPVXV875W2CA20EVJCHBB360, WORKOS_REDIRECT_URI=http://localhost:5173/fresh-capital, MEM0_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, EXA_API_KEY. All secrets stay in .env.local, never committed to git."},
        ],
    },
    {
        "category": "agent-workflow",
        "messages": [
            {"role": "user", "content": "What is the VEKTA agent workflow?"},
            {"role": "assistant", "content": "Every task in VEKTA must follow AGENT_INSTRUCTIONS.md: (1) restate the task, (2) list assumptions and risks, (3) provide a plan, (4) create a requirements checklist, (5) implement, (6) end with audit (pass/fail per requirement). Core principles: correctness > completeness > speed. No hidden shortcuts. Evidence over claims. Minimal cleverness. Use TASK_TEMPLATE.md structure."},
        ],
    },
    {
        "category": "quality-checklist",
        "messages": [
            {"role": "user", "content": "What is the VEKTA quality checklist?"},
            {"role": "assistant", "content": "VEKTA QUALITY_CHECKLIST.md: YC Companies + YC People both implemented as adapters, SourceRecord exists for orgs AND people, MatchDecision populated for org + person merges, ingestion is idempotent (rerun safe), all API routes exist, tests exist for matching + normalization, raw payloads preserved, no disabled sources accidentally active."},
        ],
    },
    {
        "category": "mem0",
        "messages": [
            {"role": "user", "content": "How is mem0 set up in VEKTA?"},
            {"role": "assistant", "content": "mem0ai Python package is installed. MEM0_API_KEY is in /Users/matthewthompson/VEKTA APP/.env.local. User ID for mem0 is matt@vekta.so. Usage: `from mem0 import MemoryClient; client = MemoryClient(api_key=os.environ['MEM0_API_KEY'])`. Memories are tagged with user_id='matt@vekta.so'."},
        ],
    },
    {
        "category": "infrastructure",
        "messages": [
            {"role": "user", "content": "What is the Supabase clone pipeline in VEKTA?"},
            {"role": "assistant", "content": "VEKTA has a GitHub Actions workflow (.github/workflows/clone-supabase.yml) cloning source project fuxzlmporikuhotzcqyc into destination awdtlonduhrpvxerrmst. Clones: database schema+data+RLS+functions+triggers (pg_dump/pg_restore), Edge Functions, Storage buckets+objects, Auth users. Requires SUPABASE_ACCESS_TOKEN and project credentials as GitHub Actions secrets."},
        ],
    },
    {
        "category": "cursor-rules",
        "messages": [
            {"role": "user", "content": "What are the VEKTA cursor/coding rules?"},
            {"role": "assistant", "content": "VEKTA coding rules: Correctness > completeness > speed. Treat prompts as specs. Restate → assumptions → plan → checklist before coding. Maintain requirements checklist with file mapping. Build system before large data runs. Preserve provenance; log matching decisions. No hidden shortcuts. End every implementation with audit (pass/fail per requirement)."},
        ],
    },
]

print(f"Pushing {len(memories)} memories to mem0 for user: {USER_ID}\n")

success = 0
for i, mem in enumerate(memories):
    cat = mem["category"]
    try:
        result = client.add(
            mem["messages"],
            user_id=USER_ID,
            metadata={"project": "vekta", "category": cat},
        )
        print(f"[{i+1}/{len(memories)}] ✓ {cat}")
        success += 1
    except Exception as e:
        print(f"[{i+1}/{len(memories)}] ✗ {cat}: {e}")

print(f"\nDone — {success}/{len(memories)} memories saved.")
