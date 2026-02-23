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
  profileFrequency?: number;  // Inject full profile every N turns
  debug?: boolean;            // Verbose logging
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
    usage?: {
      count: number;
      limit: number;
    };
  };
  error?: string;
}

interface ListResponse {
  success: boolean;
  data?: {
    memories: Memory[];
    count: number;
  };
  error?: string;
}

interface DeleteResponse {
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
    private readonly debug?: boolean,
  ) {}

  private log(msg: string) {
    if (this.debug) {
      console.log(`[clawmemory] ${msg}`);
    }
  }

  private async request<T>(
    endpoint: string,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    body?: Record<string, unknown>,
  ): Promise<T> {
    this.log(`${method} ${endpoint}`);
    
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
      agent_id: this.agentId,
    });

    if (!response.success || !response.data) {
      return [];
    }

    this.log(`Recalled ${response.data.memories.length} memories`);
    return response.data.memories;
  }

  async store(
    content: string,
    type: "fact" | "preference" | "decision" | "event" | "task" | "context" = "fact",
    importance = 0.7,
    tags: string[] = [],
  ): Promise<{ id: string | null; usage?: { count: number; limit: number } }> {
    const response = await this.request<StoreResponse>("/memories", "POST", {
      content,
      type,
      importance,
      tags,
      agent_id: this.agentId,
    });

    if (!response.success || !response.data) {
      return { id: null };
    }

    this.log(`Stored memory: ${response.data.id}`);
    return { id: response.data.id, usage: response.data.usage };
  }

  async list(limit = 20, offset = 0): Promise<{ memories: Memory[]; count: number }> {
    const response = await this.request<ListResponse>(
      `/memories?limit=${limit}&offset=${offset}`,
      "GET",
    );

    if (!response.success || !response.data) {
      return { memories: [], count: 0 };
    }

    return { memories: response.data.memories, count: response.data.count };
  }

  async delete(id: string): Promise<boolean> {
    try {
      const response = await this.request<DeleteResponse>(`/memories/${id}`, "DELETE");
      this.log(`Deleted memory: ${id}`);
      return response.success;
    } catch {
      return false;
    }
  }

  async forget(query: string): Promise<{ deleted: number; ids: string[] }> {
    // Find memories matching query, then delete them
    const memories = await this.recall(query, 10, 0.5);
    const deleted: string[] = [];

    for (const memory of memories) {
      const success = await this.delete(memory.id);
      if (success) {
        deleted.push(memory.id);
      }
    }

    this.log(`Forgot ${deleted.length} memories`);
    return { deleted: deleted.length, ids: deleted };
  }

  async wipe(): Promise<{ deleted: number }> {
    let totalDeleted = 0;
    let hasMore = true;

    while (hasMore) {
      const { memories } = await this.list(50, 0);
      
      if (memories.length === 0) {
        hasMore = false;
        break;
      }

      for (const memory of memories) {
        await this.delete(memory.id);
        totalDeleted++;
      }
    }

    this.log(`Wiped all memories: ${totalDeleted} deleted`);
    return { deleted: totalDeleted };
  }

  async status(): Promise<{
    connected: boolean;
    memoriesCount: number;
    agentId?: string;
  }> {
    try {
      const { memories, count } = await this.list(1, 0);
      return {
        connected: true,
        memoriesCount: count,
        agentId: this.agentId,
      };
    } catch {
      return {
        connected: false,
        memoriesCount: 0,
        agentId: this.agentId,
      };
    }
  }
}

// ============================================================================
// Memory Extraction (for auto-capture)
// ============================================================================

const CAPTURE_PATTERNS = [
  { pattern: /\b(?:my name is|i'?m called|call me)\s+(\w+)/i, type: "fact" as const },
  { pattern: /\b(?:i prefer|i like|i want|i need)\b/i, type: "preference" as const },
  { pattern: /\b(?:we decided|decision:|let'?s go with|we'?ll use)\b/i, type: "decision" as const },
  { pattern: /\b(?:remember|don'?t forget|important:)\b/i, type: "fact" as const },
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

// Track turn count for profile injection
let turnCount = 0;

export default function clawmemoryPlugin(api: OpenClawPluginApi) {
  const cfg = (api.pluginConfig ?? {}) as ClawMemoryConfig;

  // Validate API key
  if (!cfg.apiKey || !cfg.apiKey.startsWith("cm_")) {
    api.logger.error("clawmemory: Invalid API key. Get one at clawmemory.dev/dashboard");
    return;
  }

  const client = new ClawMemoryClient(cfg.apiKey, cfg.agentId, cfg.debug);
  const recallLimit = cfg.recallLimit ?? 5;
  const recallThreshold = cfg.recallThreshold ?? 0.3;
  const profileFrequency = cfg.profileFrequency ?? 0;  // 0 = disabled
  const debug = cfg.debug ?? false;

  const log = (msg: string) => {
    if (debug) {
      api.logger.info?.(`clawmemory: ${msg}`);
    }
  };

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
        const { id, usage } = await client.store(content, type, importance);
        const usageStr = usage ? ` (${usage.count}/${usage.limit} memories)` : "";
        return {
          content: [{ type: "text", text: `Stored memory: ${id}${usageStr}` }],
          details: { id, status: "stored", usage },
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

  // memory_forget tool
  api.registerTool(
    {
      name: "memory_forget",
      description: "Delete memories from ClawMemory by search query or ID",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query to find memories to delete",
          },
          id: {
            type: "string",
            description: "Specific memory ID to delete",
          },
        },
        required: [],
      },
    },
    async (params) => {
      const { query, id } = params as { query?: string; id?: string };

      try {
        if (id) {
          // Delete specific memory by ID
          const success = await client.delete(id);
          if (success) {
            return {
              content: [{ type: "text", text: `Deleted memory: ${id}` }],
              details: { deleted: 1, ids: [id] },
            };
          } else {
            return {
              content: [{ type: "text", text: `Memory not found: ${id}` }],
              details: { deleted: 0 },
            };
          }
        } else if (query) {
          // Find and delete memories matching query
          const result = await client.forget(query);
          if (result.deleted === 0) {
            return {
              content: [{ type: "text", text: "No matching memories found to delete." }],
              details: { deleted: 0 },
            };
          }
          return {
            content: [{ type: "text", text: `Deleted ${result.deleted} memories matching "${query}"` }],
            details: result,
          };
        } else {
          return {
            content: [{ type: "text", text: "Please provide either a query or an id to delete." }],
            details: { error: "Missing query or id" },
          };
        }
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to forget: ${String(err)}` }],
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

      turnCount++;
      log(`Turn ${turnCount}`);

      try {
        const memories = await client.recall(event.prompt, recallLimit, recallThreshold);

        if (memories.length === 0) {
          // Check if we should inject profile anyway
          if (profileFrequency > 0 && turnCount % profileFrequency === 0) {
            const { memories: allMemories } = await client.list(10, 0);
            if (allMemories.length > 0) {
              const profileContext = allMemories
                .map((m) => `- [${m.type}] ${m.content}`)
                .join("\n");

              log(`Injecting profile (${allMemories.length} memories)`);
              return {
                prependContext: `<clawmemory-profile>\nUser profile from ClawMemory:\n${profileContext}\n</clawmemory-profile>`,
              };
            }
          }
          return;
        }

        const memoryContext = memories
          .map((m) => `- [${m.type}] ${m.content}`)
          .join("\n");

        log(`Injecting ${memories.length} memories into context`);

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

        log(`Capturing ${toStore.length} memories`);

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
        .command("status")
        .description("Show ClawMemory connection status")
        .action(async () => {
          console.log("Checking ClawMemory status...\n");
          const status = await client.status();
          
          console.log(`  Connected:    ${status.connected ? "✓ Yes" : "✗ No"}`);
          console.log(`  Memories:     ${status.memoriesCount}`);
          console.log(`  Agent ID:     ${status.agentId || "(default)"}`);
          console.log(`  Auto-recall:  ${cfg.autoRecall !== false ? "enabled" : "disabled"}`);
          console.log(`  Auto-capture: ${cfg.autoCapture !== false ? "enabled" : "disabled"}`);
          console.log(`  Debug:        ${cfg.debug ? "enabled" : "disabled"}`);
          if (profileFrequency > 0) {
            console.log(`  Profile freq: every ${profileFrequency} turns`);
          }
        });

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
          console.log(`Found ${memories.length} memories:\n`);
          for (const m of memories) {
            const relevance = ((m.relevance ?? 0) * 100).toFixed(0);
            console.log(`  [${m.type}] ${m.content}`);
            console.log(`           Relevance: ${relevance}% | Created: ${m.created_at}\n`);
          }
        });

      memory
        .command("store")
        .description("Store a memory")
        .argument("<content>", "Content to store")
        .option("--type <type>", "Memory type", "fact")
        .option("--importance <n>", "Importance (0-1)", "0.7")
        .action(async (content, opts) => {
          const { id, usage } = await client.store(content, opts.type, parseFloat(opts.importance));
          console.log(`Stored: ${id}`);
          if (usage) {
            console.log(`Usage: ${usage.count}/${usage.limit} memories`);
          }
        });

      memory
        .command("forget")
        .description("Delete memories by query")
        .argument("<query>", "Search query for memories to delete")
        .action(async (query) => {
          const result = await client.forget(query);
          if (result.deleted === 0) {
            console.log("No matching memories found.");
          } else {
            console.log(`Deleted ${result.deleted} memories.`);
          }
        });

      memory
        .command("list")
        .description("List recent memories")
        .option("--limit <n>", "Max results", "10")
        .action(async (opts) => {
          const { memories, count } = await client.list(parseInt(opts.limit), 0);
          if (memories.length === 0) {
            console.log("No memories stored yet.");
            return;
          }
          console.log(`Showing ${memories.length} of ${count} memories:\n`);
          for (const m of memories) {
            console.log(`  [${m.type}] ${m.content.slice(0, 80)}${m.content.length > 80 ? "..." : ""}`);
            console.log(`           ID: ${m.id} | Created: ${m.created_at}\n`);
          }
        });

      memory
        .command("wipe")
        .description("Delete ALL memories (requires confirmation)")
        .option("--confirm", "Skip confirmation prompt")
        .action(async (opts) => {
          if (!opts.confirm) {
            console.log("⚠️  This will delete ALL your memories permanently.");
            console.log("   Run with --confirm to proceed.\n");
            console.log("   openclaw clawmemory wipe --confirm");
            return;
          }
          
          console.log("Wiping all memories...");
          const result = await client.wipe();
          console.log(`Deleted ${result.deleted} memories.`);
        });
    },
    { commands: ["clawmemory"] },
  );
}
