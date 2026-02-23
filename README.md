# ClawMemory Plugin for OpenClaw

Cloud-based semantic memory for AI agents. Auto-recall relevant context, auto-capture important facts, and search by meaning.

**Website:** https://clawmemory.dev

## Install

```bash
openclaw plugins install clawmemory-openclaw
```

Restart OpenClaw after installing.

## Setup

1. Get your API key at [clawmemory.dev/dashboard](https://clawmemory.dev/dashboard)
2. Add to your `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "clawmemory-openclaw": {
        "enabled": true,
        "config": {
          "apiKey": "cm_your_api_key"
        }
      }
    }
  }
}
```

3. Restart OpenClaw. Done!

## Features

| Feature | Description |
|---------|-------------|
| **Auto-Recall** | Injects relevant memories before every AI turn |
| **Auto-Capture** | Stores important facts after every turn |
| **Semantic Search** | Find memories by meaning, not keywords |
| **Profile Injection** | Optionally inject full profile every N turns |

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | string | — | Your ClawMemory API key (required) |
| `agentId` | string | — | Identifier for this agent |
| `autoRecall` | boolean | `true` | Inject relevant memories before turns |
| `autoCapture` | boolean | `true` | Store important facts after turns |
| `recallLimit` | number | `5` | Max memories to inject per turn |
| `recallThreshold` | number | `0.3` | Min relevance score (0-1) |
| `profileFrequency` | number | `0` | Inject full profile every N turns (0=disabled) |
| `debug` | boolean | `false` | Enable verbose logging |

### Full Example

```json
{
  "plugins": {
    "entries": {
      "clawmemory-openclaw": {
        "enabled": true,
        "config": {
          "apiKey": "cm_your_api_key",
          "agentId": "jarvis",
          "autoRecall": true,
          "autoCapture": true,
          "recallLimit": 10,
          "recallThreshold": 0.3,
          "profileFrequency": 50,
          "debug": false
        }
      }
    }
  }
}
```

## AI Tools

The plugin registers these tools for the AI to use:

| Tool | Description |
|------|-------------|
| `memory_store` | Store information in long-term memory |
| `memory_recall` | Search memories by semantic query |
| `memory_forget` | Delete memories by query or ID |

## CLI Commands

```bash
# Check connection status
openclaw clawmemory status

# Search memories
openclaw clawmemory recall "project deadlines"

# Store a memory
openclaw clawmemory store "User prefers dark mode" --type preference

# List recent memories
openclaw clawmemory list --limit 20

# Delete memories matching query
openclaw clawmemory forget "old project"

# Delete ALL memories (careful!)
openclaw clawmemory wipe --confirm
```

## How It Works

### Auto-Recall
Before every AI turn, the plugin:
1. Takes the user's message as a query
2. Searches ClawMemory for relevant memories
3. Injects them as context: `<clawmemory-context>...</clawmemory-context>`

### Auto-Capture
After every AI turn, the plugin:
1. Scans for important patterns (preferences, decisions, tasks, etc.)
2. Extracts and stores them in ClawMemory

### Profile Injection
When `profileFrequency` is set, every N turns the plugin injects your most recent memories as a "profile" — even if they don't match the current query.

## Pricing

- **$12/month** — 5,000 memories, unlimited recalls
- **7-day free trial** — No credit card required

Get started at [clawmemory.dev](https://clawmemory.dev)

## Support

- Website: https://clawmemory.dev
- Email: support@clawmemory.dev
- GitHub: https://github.com/krupesh-app/clawmemory

## License

MIT
