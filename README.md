# DeskSom

**Give ChatGPT a private connection to your Windows files and terminal, with an installer an AI can operate safely.**

DeskSom combines the open-source Desktop Commander engine with your own OpenAI Secure MCP Tunnel. You do not need Somner or Desktop Commander's paid hosted relay. Your own ChatGPT/Platform account must support private custom MCP connections; OpenAI permissions, charges and usage limits are separate.

**Release review notice:** The installer is a tested release candidate, but the pinned upstream dependency audit has open high/moderate findings. Read [the dependency review](docs/DEPENDENCY_REVIEW.md) before a pilot; broad rollout is not security-cleared.

## The easy way

Download a prepared release ZIP from this repository, extract it to a folder you will keep, then double-click **Start-DeskSom.cmd**. The guided setup checks its source, explains permissions, offers official WinGet prerequisites when needed, asks which project folder to expose, and shows an installation plan before changing anything. Run as your normal Windows user, not as administrator.

**This is powerful access, not a sandbox.** File-tool folder restrictions do not limit the terminal tools. A connected AI can run commands with your Windows account's permissions. Keep the connection private and approve only work you intend.

## Ask an AI to install it

Copy this into a chat with an AI that already has authorized terminal access to your Windows machine:

> Please install DeskSom from this repository. Read AGENTS.md and AI_INSTALL.md first, inspect any existing installation, and use the prepared release's preflight and approved-plan installer. Ask which folder I want to work in and explain the terminal permissions. Keep all API keys out of this chat; guide me through the local masked prompt. Preserve existing installations and verify a real ChatGPT tool call before calling setup complete.

Without an existing computer-control connection, ChatGPT cannot execute commands on your machine. The double-click launcher is the bootstrap route; it does not magically grant ChatGPT access before installation.

## What the installer does

It creates a separate per-user runtime and private state, installs pinned dependencies, verifies the tunnel download, runs local checks, and registers a named, non-elevated Windows task. A saved plan and operation receipts support safe continuation. Repeated installation preserves credentials; changed files, foreign tasks, port conflicts and uncertain subprocess outcomes stop the workflow rather than trigger a reset.

The final account steps stay with you: create/select your own private tunnel, confirm its organization/workspace, enter its runtime key in a **local masked prompt**, and add the private MCP connection in ChatGPT. Local health checks never claim that last step succeeded.

## Read more

[AI installation](AI_INSTALL.md) · [Human setup](INSTALLATION.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Security](SECURITY.md) · [Architecture](ARCHITECTURE.md) · [Test and release status](docs/QUALIFICATION.md)

This **0.2.0-rc.1 release candidate** targets Windows x64, PowerShell 7.4+ and Node.js 22+. The engine is pinned to Desktop Commander 0.2.52 and tunnel-client to 0.0.16. It is a source distribution for individual private installations, not a shared public shell or a public ChatGPT plugin-store submission. Each recipient uses their own credentials. The existing 0.1.x installer and task names are not silently migrated.
