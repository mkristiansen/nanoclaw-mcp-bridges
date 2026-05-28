# nanoclaw-mcp-bridges

Bridge scripts and launchd plists that connect [Svend](https://nanoclaw.com) (a NanoClaw agent running in a Docker container on a work laptop) to MCP servers that run on the host Mac.

## Architecture

The agent container cannot run Mac-native processes (AppleScript, Electron apps, etc.), so MCP servers that need local Mac access run on the host Mac and are exposed over HTTP via [supergateway](https://github.com/supercorp-ai/supergateway). Each bridge script inside the container connects to its supergateway instance over `host.docker.internal`.

```
┌─────────────────────────────────┐      ┌──────────────────────────────────────┐
│   Docker container (work laptop)│      │  Host Mac (work laptop)              │
│                                 │      │                                      │
│  NanoClaw agent                 │      │  supergateway :8080                  │
│    └── tolaria-bridge.mjs ──────┼─────▶│    └── Tolaria MCP server            │
│    └── rovo-bridge.mjs    ──────┼─────▶│  supergateway :8082                  │
│                                 │      │    └── mcp-remote → Atlassian Rovo   │
└─────────────────────────────────┘      └──────────────────────────────────────┘
```

Both bridges reconnect automatically (5 s retry) if the host-side supergateway drops. The launchd plists keep supergateway alive and restart it after crashes or reboots.

---

## Tolaria (Obsidian vaults)

**What it does:** Gives the agent read/write access to Obsidian vaults managed by [Tolaria](https://tolaria.app).

### Host Mac setup

1. Tolaria must be running (it exposes an MCP server at `/Applications/Tolaria.app/Contents/Resources/mcp-server/index.js`).
2. Install the launchd plist:

```bash
cp launchd/com.nanoclaw.tolaria-supergateway.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.nanoclaw.tolaria-supergateway.plist
```

### Agent container setup

Copy `bridges/tolaria-bridge.mjs` to `/workspace/agent/` in the container, then add to agent group MCP config:

```
name: tolaria
command: node
args: ["/workspace/agent/tolaria-bridge.mjs"]
```

---

## Rovo (Atlassian Jira & Confluence)

**What it does:** Gives the agent access to Jira and Confluence via Atlassian's hosted [Rovo MCP server](https://mcp.atlassian.com/v1/mcp/authv2), using [mcp-remote](https://github.com/modelcontextprotocol/mcp-remote) to handle OAuth.

### One-time OAuth (first time only)

Run this on your Mac to authorise and cache tokens:

```bash
MCP_REMOTE_CONFIG_DIR=~/.mcp-auth npx -y mcp-remote@latest https://mcp.atlassian.com/v1/mcp/authv2
```

Complete the browser prompt, then Ctrl-C. Tokens are stored in `~/.mcp-auth/` and refreshed automatically by mcp-remote going forward.

### Host Mac setup

Install the launchd plist (starts supergateway on port 8082, wrapping mcp-remote):

```bash
cp launchd/com.nanoclaw.rovo-supergateway.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.nanoclaw.rovo-supergateway.plist
```

### Agent container setup

Copy `bridges/rovo-bridge.mjs` to `/workspace/agent/` in the container, then add to agent group MCP config:

```
name: rovo
command: node
args: ["/workspace/agent/rovo-bridge.mjs"]
```

---

## Verifying both services

```bash
launchctl list | grep nanoclaw
# Both entries should show a PID (not "-")
```

Logs:
- `/tmp/tolaria-supergateway.log` / `/tmp/tolaria-supergateway-error.log`
- `/tmp/rovo-supergateway.log` / `/tmp/rovo-supergateway-error.log`

---

## Ports

| Port | Service |
|------|---------|
| 8080 | Tolaria supergateway |
| 8081 | Reserved — Apple Reminders (planned) |
| 8082 | Rovo supergateway |
