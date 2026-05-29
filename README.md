# nanoclaw-mcp-bridges

Bridge scripts, launchd plists, and container config that connect [Svend](https://nanoclaw.com) (a NanoClaw agent running in a Docker container on a Mac) to MCP servers.

## Architecture

Two categories of MCP server:

**Host-bridged** — MCP servers that need local Mac access (AppleScript, Electron apps, etc.) run on the host Mac and are exposed over HTTP via [supergateway](https://github.com/supercorp-ai/supergateway). Bridge scripts inside the container connect over `host.docker.internal`.

**In-container** — MCP servers that communicate only with external APIs run directly inside the container. No bridge or host-side process needed.

```
┌────────────────────────────────────────────────┐      ┌──────────────────────────────────────┐
│   Docker container (Mac)                       │      │  Host Mac                            │
│                                                │      │                                      │
│  NanoClaw agent                                │      │  supergateway :8080                  │
│    └── tolaria-bridge.mjs ────────────────────┼─────▶│    └── Tolaria MCP server            │
│    └── rovo-bridge.mjs ───────────────────────┼─────▶│  supergateway :8082                  │
│    └── aha (pnpm dlx @cedricziel/aha-mcp)     │      │    └── mcp-remote → Atlassian Rovo   │
│         └──▶ merative1.aha.io (via OneCLI)    │      │                                      │
└────────────────────────────────────────────────┘      └──────────────────────────────────────┘
```

Host-bridged services reconnect automatically (5 s retry) if the supergateway drops. The launchd plists keep supergateway alive across crashes and reboots.

The full container MCP config is in [`container.json`](./container.json).

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

## Aha! (product roadmap)

**What it does:** Gives the agent 49 tools for reading and writing Aha! features, epics, releases, ideas, and more — connected to `merative1.aha.io`.

**No host-side setup required.** Aha runs directly in the container via `pnpm dlx`. Credentials are injected at the HTTP boundary by [OneCLI](https://onecli.sh) — no token files or env vars needed on the host.

### Agent container setup

Add to agent group MCP config:

```
name: aha
command: pnpm
args: ["dlx", "@cedricziel/aha-mcp"]
env:
  AHA_COMPANY: onecli-managed
  AHA_TOKEN: onecli-managed
```

Connect the credential once via OneCLI:

```
http://127.0.0.1:10254/connections/custom?create=generic&host=merative1.aha.io&path=%2F*&name=Aha+API+Token
```

---

## Verifying host-bridged services

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
