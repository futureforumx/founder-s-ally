// =============================================================================
// Aurora KB — Zapier MCP Provider Adapter (Scaffold)
// =============================================================================
// Stub implementation of the Zapier MCP adapter.
// This follows the ActionProviderAdapter interface so it can be registered
// in the action dispatcher. Actual Zapier connectivity will be wired in
// when secrets and MCP endpoints are configured.
//
// Zapier MCP (Model Context Protocol) allows triggering Zaps via a
// structured API. When connected, this adapter will:
// - Accept normalized action payloads
// - Map them to Zapier webhook/MCP calls
// - Return normalized results
// - Never leak Zapier-specific logic into the rest of the codebase
// =============================================================================

import type { ActionProviderAdapter, ActionResult } from "./kb-types.ts";

// Supported action types that this adapter can handle
const SUPPORTED_ACTIONS = new Set([
  "zapier_trigger_zap",
  "zapier_create_contact",
  "zapier_send_notification",
  "zapier_update_crm",
  "zapier_custom",
]);

export class ZapierMcpAdapter implements ActionProviderAdapter {
  readonly providerName = "zapier";

  // TODO: These will come from kb_external_accounts or env vars
  private webhookBaseUrl: string | null;
  private mcpEndpoint: string | null;

  constructor() {
    this.webhookBaseUrl = Deno.env.get("ZAPIER_WEBHOOK_URL") ?? null;
    this.mcpEndpoint = Deno.env.get("ZAPIER_MCP_ENDPOINT") ?? null;
  }

  validatePayload(
    actionType: string,
    payload: Record<string, unknown>,
  ): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!SUPPORTED_ACTIONS.has(actionType)) {
      errors.push(
        `Unsupported action type: "${actionType}". Supported: ${Array.from(SUPPORTED_ACTIONS).join(", ")}`,
      );
    }

    // Basic payload validation
    if (actionType === "zapier_trigger_zap" && !payload.zapId && !payload.webhookUrl) {
      errors.push("zapier_trigger_zap requires either zapId or webhookUrl");
    }

    if (actionType === "zapier_create_contact") {
      if (!payload.email && !payload.name) {
        errors.push("zapier_create_contact requires at least email or name");
      }
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  async preview(
    actionType: string,
    payload: Record<string, unknown>,
  ): Promise<ActionResult> {
    // Preview mode: describe what would happen without executing
    const description = this.describeAction(actionType, payload);

    return {
      status: "preview",
      actionLogId: "", // Will be set by dispatcher
      summary: `[Preview] ${description}`,
      providerResponse: {
        provider: "zapier",
        actionType,
        wouldExecute: description,
        payloadSummary: Object.keys(payload),
        connected: !!(this.webhookBaseUrl || this.mcpEndpoint),
      },
    };
  }

  async execute(
    actionType: string,
    payload: Record<string, unknown>,
  ): Promise<ActionResult> {
    // Check connectivity
    if (!this.webhookBaseUrl && !this.mcpEndpoint) {
      return {
        status: "failed",
        actionLogId: "",
        summary:
          "Zapier is not connected. Set ZAPIER_WEBHOOK_URL or ZAPIER_MCP_ENDPOINT environment variable, or connect via Settings.",
      };
    }

    // TODO: Implement actual Zapier MCP/webhook call
    // For now, return a structured stub response indicating the adapter
    // is correctly wired but the external call is not yet implemented.
    //
    // When implementing:
    // 1. Build the request payload according to Zapier MCP spec
    // 2. POST to this.mcpEndpoint or this.webhookBaseUrl
    // 3. Parse the response
    // 4. Return normalized ActionResult
    // 5. Include any external IDs for kb_external_object_links creation

    const description = this.describeAction(actionType, payload);

    return {
      status: "failed",
      actionLogId: "",
      summary: `Zapier execution not yet implemented. Would execute: ${description}`,
      providerResponse: {
        provider: "zapier",
        actionType,
        stubbed: true,
        message: "Zapier MCP integration is scaffolded but not yet connected.",
      },
    };
  }

  private describeAction(
    actionType: string,
    payload: Record<string, unknown>,
  ): string {
    switch (actionType) {
      case "zapier_trigger_zap":
        return `Trigger Zap ${payload.zapId ?? "via webhook"} with ${Object.keys(payload).length} fields`;
      case "zapier_create_contact":
        return `Create contact: ${payload.name ?? payload.email ?? "unknown"}`;
      case "zapier_send_notification":
        return `Send notification to ${payload.channel ?? payload.recipient ?? "default channel"}`;
      case "zapier_update_crm":
        return `Update CRM record: ${payload.recordType ?? "contact"} ${payload.recordId ?? "new"}`;
      case "zapier_custom":
        return `Custom Zapier action with ${Object.keys(payload).length} payload fields`;
      default:
        return `${actionType} with ${Object.keys(payload).length} fields`;
    }
  }
}

/**
 * Future provider adapter stubs — these follow the same interface pattern.
 * Add implementations as needed:
 *
 * - HubSpotAdapter    — native HubSpot CRM API
 * - NotionAdapter     — Notion API for pages/databases
 * - SlackAdapter      — Slack Web API for messages
 * - GmailAdapter      — Gmail API for email
 * - ComposioAdapter   — Composio unified tool platform
 */
