import { Injectable } from "@nestjs/common";
import { buildAdapterRegistry } from "@founder-intel/adapters";
import type { SourceDto } from "@founder-intel/types";

const IMPLEMENTED = new Set(["yc-companies", "founders-list"]);

@Injectable()
export class SourcesService {
  private readonly registry = buildAdapterRegistry();

  list(): SourceDto[] {
    const sources: SourceDto[] = [];
    for (const [name, adapter] of this.registry) {
      sources.push({
        name,
        version: adapter.version,
        enabled: adapter.enabled,
        complianceNote: adapter.complianceNote,
        status: IMPLEMENTED.has(name) ? "implemented" : "scaffolded",
      });
    }
    return sources;
  }
}
