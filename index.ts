/**
 * ClawMemory OpenClaw Plugin
 *
 * Cloud-based semantic memory for AI agents.
 * Provides auto-recall and auto-capture via OpenClaw lifecycle hooks.
 *
 * @see https://clawmemory.dev
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

// ============================================================================
// Types
// ============================================================================

interface ClawMemoryConfig {
  apiKey: string;
  agentId?: string;
  autoRecall?: boolean;
  autoCapture?: boolean;
  recallLimit?: number;
  recallThreshold?: number;
}

interface Memory {
  id: string;
  content: string;
  type: string;
  tags: string[];
  importance: number;
  relevance?: number;
  created_at: string;
  agent_id?: string;
}

interface RecallResponse {
  success: boolean;
  data?: {
    memories: Memory[];
    count: number;
    query: string;
  };
  error?: string;
}

interface StoreResponse {
  success: boolean;
  data?: {
    id: string;
    status: string;
  };
  error?: string;
}

// ============================================================================
// ClawMemory API Client
// ============================================================================

const API_BASE = "https://www.clawmemory.dev/api";

class ClawMemoryClient {
  constructor(
    private readonly apiKey: string,
    private readonly agentId?: string,
  ) {}

  private async request<T>(
    endpoint: string,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    body?: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ClawMemory API error: ${response.status} ${text}`);
    }

    return response.json() as Promise<T>;
  }

  async recall(query: string, limit = 5, threshold = 0.3): Promise<Memory[]> {
    const response = await this.request<RecallResponse>("/memories/recall", "POST", {
      query,
      limit,
      threshold,
      agentId: this.agentId,
    });

    if (!response.success || !response.data) {
      return [];
    }

    return response.data.memories;
  }

  async store(
    content: string,
    type: "fact" | "preference" | "decision" | "event" | "task" | "context" = "fact",
    importance = 0.7,
    tags: string[] = [],
  ): Promise<string | null> {
    const response = await this.request<StoreResponse>("/memories", "POST", {
      content,
      type,
      importance,
      tags,
      agentId: this.agentId,
    });

    if (!response.success || !response.data) {
      return null;
    }

    return response.data.id;
  }
}

// ============================================================================
// Memory Extraction (for auto-capture)
// ============================================================================

const CAPTURE_PATTERNS = [
  { pattern: /\b(?:my name is|i'?m called|call me)\s+(\w+)/i, type: "fact" as const },
  { pattern: /\b(?:i prefer|i like|i want|i need)\b/i, type: "preference" as const },
  { pattern: /\b(?:we decided|decision:|let'?s go with|we'?ll use)\b/i, type: "decision" as const },
  { pattern: /\b(?:remember that|don'?t forget|important:)\b/i, type: "fact" as const },
  { pattern: /\b(?:todo:|task:|action item:)\b/i, type: "task" as const },
  { pattern: /\b(?:deployed|launched|shipped|released|published)\b/i, type: "event" as const },
];

function shouldCapture(text: string): { capture: boolean; type: "fact" | "preference" | "decision" | "event" | "task" | "context" } {
  for (const { pattern, type } of CAPTURE_PATTERNS) {
    if (pattern.test(text)) {
      return { capture: true, type };
    }
  }
  return { capture: false, type: "context" };
}

function extractImportantContent(messages: unknown[]): Array<{ content: string; type: "fact" | "preference" | "decision" | "event" | "task" | "context" }> {
  const results: Array<{ content: string; type: "fact" | "preference" | "decision" | "event" | "task" | "context" }> = [];

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;

    const msgObj = msg as Record<string, unknown>;
    const role = msgObj.role;

    // Only analyze user messages (they contain the important info)
    if (role !== "user") continue;

    const content = msgObj.content;
    let text = "";

    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter((c): c is { type: string; text: string } =>
          c && typeof c === "object" && "type" in c && c.type === "text" && "text" in c
        )
        .map((c) => c.text)
        .join(" ");
    }

    if (text.length < 10) continue;

    const { capture, type } = shouldCapture(text);
    if (capture) {
      // Limit to first 500 chars for storage
      results.push({
        content: text.slice(0, 500),
        type,
      });
    }
  }

  return results;
}

// ============================================================================
// Plugin Entry Point
// ============================================================================

export default function clawmemoryPlugin(api: OpenClawPluginApi) {
  const cfg = api.config as ClawMemoryConfig;

  // Validate API key
  if (!cfg.apiKey || !cfg.apiKey.startsWith("cm_")) {
    api.logger.error("clawmemory: Invalid API key. Get one at clawmemory.dev/dashboard");
    return;
  }

  const client = new ClawMemoryClient(cfg.apiKey, cfg.agentId);
  const recallLimit = cfg.recallLimit ?? 5;
  const recallThreshold = cfg.recallThreshold ?? 0.3;

  api.logger.info?.("clawmemory: Plugin initialized");

  // ========================================================================
  // Agent Tools
  // ========================================================================

  // memory_store tool
  api.registerTool(
    {
      name: "memory_store",
      description: "Store a memory in ClawMemory for long-term recall",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The information to remember",
          },
          type: {
            type: "string",
            enum: ["fact", "preference", "decision", "event", "task", "context"],
            description: "Type of memory",
          },
          importance: {
            type: "number",
            description: "Importance score (0-1)",
          },
        },
        required: ["content"],
      },
    },
    async (params) => {
      const { content, type = "fact", importance = 0.7 } = params as {
        content: string;
        type?: "fact" | "preference" | "decision" | "event" | "task" | "context";
        importance?: number;
      };

      try {
        const id = await client.store(content, type, importance);
        return {
          content: [{ type: "text", text: `Stored memory: ${id}` }],
          details: { id, status: "stored" },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to store: ${String(err)}` }],
          details: { error: String(err) },
        };
      }
    },
  );

  // memory_recall tool
  api.registerTool(
    {
      name: "memory_recall",
      description: "Search ClawMemory for relevant memories",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What to search for (semantic search)",
          },
          limit: {
            type: "number",
            description: "Max results (default: 5)",
          },
        },
        required: ["query"],
      },
    },
    async (params) => {
      const { query, limit = 5 } = params as { query: string; limit?: number };

      try {
        const memories = await client.recall(query, limit, recallThreshold);

        if (memories.length === 0) {
          return {
            content: [{ type: "text", text: "No relevant memories found." }],
            details: { count: 0 },
          };
        }

        const formatted = memories
          .map((m) => `- [${m.type}] ${m.content} (relevance: ${((m.relevance ?? 0) * 100).toFixed(0)}%)`)
          .join("\n");

        return {
          content: [{ type: "text", text: `Found ${memories.length} memories:\n${formatted}` }],
          details: { count: memories.length, memories },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Recall failed: ${String(err)}` }],
          details: { error: String(err) },
        };
      }
    },
  );

  // ========================================================================
  // Lifecycle Hooks
  // ========================================================================

  // Auto-recall: inject relevant memories before agent starts
  if (cfg.autoRecall !== false) {
    api.on("before_agent_start", async (event) => {
      if (!event.prompt || event.prompt.length < 5) {
        return;
      }

      try {
        const memories = await client.recall(event.prompt, recallLimit, recallThreshold);

        if (memories.length === 0) {
          return;
        }

        const memoryContext = memories
          .map((m) => `- [${m.type}] ${m.content}`)
          .join("\n");

        api.logger.info?.(`clawmemory: injecting ${memories.length} memories into context`);

        return {
          prependContext: `<clawmemory-context>\nRelevant memories from ClawMemory:\n${memoryContext}\n</clawmemory-context>`,
        };
      } catch (err) {
        api.logger.warn?.(`clawmemory: recall failed: ${String(err)}`);
      }
    });
  }

  // Auto-capture: store important information after agent ends
  if (cfg.autoCapture !== false) {
    api.on("agent_end", async (event) => {
      if (!event.success || !event.messages || event.messages.length === 0) {
        return;
      }

      try {
        const toStore = extractImportantContent(event.messages);

        if (toStore.length === 0) {
          return;
        }

        api.logger.info?.(`clawmemory: capturing ${toStore.length} memories`);

        for (const item of toStore) {
          await client.store(item.content, item.type, 0.7);
        }
      } catch (err) {
        api.logger.warn?.(`clawmemory: capture failed: ${String(err)}`);
      }
    });
  }

  // ========================================================================
  // CLI Commands
  // ========================================================================

  api.registerCli(
    ({ program }) => {
      const memory = program.command("clawmemory").description("ClawMemory plugin commands");

      memory
        .command("recall")
        .description("Search memories")
        .argument("<query>", "Search query")
        .option("--limit <n>", "Max results", "5")
        .action(async (query, opts) => {
          const memories = await client.recall(query, parseInt(opts.limit), recallThreshold);
          if (memories.length === 0) {
            console.log("No memories found.");
            return;
          }
          for (const m of memories) {
            console.log(`[${m.type}] ${m.content} (${((m.relevance ?? 0) * 100).toFixed(0)}%)`);
          }
        });

      memory
        .command("store")
        .description("Store a memory")
        .argument("<content>", "Content to store")
        .option("--type <type>", "Memory type", "fact")
        .action(async (content, opts) => {
          const id = await client.store(content, opts.type);
          console.log(`Stored: ${id}`);
        });
    },
    { commands: ["clawmemory"] },
  );
}
