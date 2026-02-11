# ClawMemory for OpenClaw

Cloud-based semantic memory for AI agents. Give your OpenClaw agent perfect memory with one command.

## Installation

```bash
openclaw plugins install clawmemory-openclaw
```

## Quick Start

1. Get your API key at [clawmemory.dev/dashboard](https://clawmemory.dev/dashboard)

2. Add to your `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "clawmemory": {
        "config": {
          "apiKey": "cm_your_api_key",
          "autoRecall": true,
          "autoCapture": true
        }
      }
    }
  }
}
```

3. Restart OpenClaw — that's it!

## Features

### Auto-Recall

When enabled, relevant memories are automatically injected into your agent's context before each response. Your agent will "remember" past conversations, preferences, and decisions.

### Auto-Capture

When enabled, the plugin automatically detects and stores important information from conversations:

- User preferences ("I prefer dark mode")
- Decisions ("We decided to use React")
- Facts ("My name is Alex")
- Tasks ("Remember to deploy tomorrow")
- Events ("Deployed v1.2 to production")

### Manual Tools

Your agent also gets two tools for manual memory management:

- `memory_store` - Store a specific memory
- `memory_recall` - Search for relevant memories

### CLI Commands

```bash
# Search memories
openclaw clawmemory recall "user preferences"

# Store a memory
openclaw clawmemory store "User prefers concise responses" --type preference
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | string | required | Your ClawMemory API key |
| `autoRecall` | boolean | true | Auto-inject relevant memories |
| `autoCapture` | boolean | true | Auto-store important info |
| `agentId` | string | - | Agent identifier (multi-agent setups) |
| `recallLimit` | number | 5 | Max memories to recall |
| `recallThreshold` | number | 0.3 | Min relevance score (0-1) |

### Advanced Config Example

```json
{
  "plugins": {
    "entries": {
      "clawmemory": {
        "config": {
          "apiKey": "cm_your_api_key",
          "agentId": "jarvis",
          "autoRecall": true,
          "autoCapture": true,
          "recallLimit": 10,
          "recallThreshold": 0.4
        }
      }
    }
  }
}
```

## How It Works

1. **Before each response**: ClawMemory searches for memories relevant to the user's message and injects them into the agent's context.

2. **After each response**: ClawMemory analyzes the conversation for important information (preferences, decisions, facts) and stores them automatically.

3. **Semantic search**: Unlike keyword search, ClawMemory understands meaning. "What color does the user like?" will find "I prefer dark themes."

## Privacy

- All memories are stored in your ClawMemory account
- Memories are isolated per API key
- Use `agentId` to separate memories between agents
- Delete memories anytime via dashboard or API

## Links

- [ClawMemory Dashboard](https://clawmemory.dev/dashboard)
- [API Documentation](https://clawmemory.dev/docs)
- [GitHub](https://github.com/krupesh-app/clawmemory-openclaw)

## License

MIT
