// =============================================================================
// Vyta KB — Embedding Provider
// =============================================================================
// Isolated embedding provider implementation.
// Uses the same Lovable AI gateway (OpenAI-compatible) as generate-embeddings.
// The interface (EmbeddingProvider) is defined in kb-types.ts so the provider
// can be swapped without touching any consuming code.
// =============================================================================

import type { EmbeddingProvider } from "./kb-types.ts";

/**
 * Lovable AI Gateway embedding provider.
 * Uses openai/text-embedding-3-small (1536 dimensions) — same model
 * used by the existing generate-embeddings edge function.
 */
export class LovableEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1536;
  private apiKey: string;
  private endpoint: string;
  private model: string;

  constructor(
    apiKey: string,
    endpoint = "https://ai.gateway.lovable.dev/v1/embeddings",
    model = "openai/text-embedding-3-small",
  ) {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
    this.model = model;
  }

  async embed(text: string): Promise<number[]> {
    const resp = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: this.model, input: text }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Embedding API error [${resp.status}]: ${errText}`);
    }

    const data = await resp.json();
    return data.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    // OpenAI-compatible APIs support batch input
    const resp = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Embedding batch API error [${resp.status}]: ${errText}`);
    }

    const data = await resp.json();
    // Sort by index to ensure correct ordering
    const sorted = data.data.sort((a: any, b: any) => a.index - b.index);
    return sorted.map((item: any) => item.embedding);
  }
}

/**
 * Create an embedding provider from environment variables.
 * Returns null if the API key is not configured (embeddings will be skipped).
 */
export function createEmbeddingProvider(): EmbeddingProvider | undefined {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.warn("LOVABLE_API_KEY not set — embedding generation will be skipped");
    return undefined;
  }
  return new LovableEmbeddingProvider(apiKey);
}
