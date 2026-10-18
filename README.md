# DeskSom

**Give ChatGPT a private connection to your Windows files and terminal, with an installer an AI can operate safely.**

DeskSom combines the open-source Desktop Commander engine with your own OpenAI Secure MCP Tunnel. You do not need Somner or Desktop Commander's paid hosted relay. Your own ChatGPT/Platform account must support private custom MCP connections; OpenAI permissions, charges and usage limits are separate.

**Dependency disclosure:** The pinned upstream tree has documented high/moderate advisories. The details and limitations are in [the dependency review](docs/DEPENDENCY_REVIEW.md). This is information for the recipient, not an additional maintainer approval or manual sign-off required to run the installer.

## The easy way

Download the prepared release ZIP, extract it, and double-click **Start-DeskSom.cmd**. A Windows setup window guides the owner through a folder picker, installation, and an optional ChatGPT connection assistant. No command-line knowledge is needed. It validates its source, explains the full Windows-user terminal permissions, and can offer official WinGet prerequisites with confirmation. The original command-line setup remains available as **Start-DeskSom-CLI.cmd**. Run as your normal Windows user, not as administrator.

**This is powerful access, not a sandbox.** File-tool folder restrictions do not limit the terminal tools. A connected AI can run commands with your Windows account's permissions. Keep the connection private and approve only work you intend.

## Ask an AI to install it

Copy this into a chat with an AI that already has authorized terminal access to your Windows machine:

> Please install DeskSom from this repository. Read AGENTS.md and AI_INSTALL.md first, inspect any existing installation, and use the prepared release's preflight and approved-plan installer. Ask which folder I want to work in and explain the terminal permissions. Keep all API keys out of this chat; guide me through the local masked prompt. Preserve existing installations and verify a real ChatGPT tool call before calling setup complete.

Without an existing computer-control connection, ChatGPT cannot execute commands on your machine. The double-click launcher is the bootstrap route; it does not magically grant ChatGPT access before installation.

## Investigating a chat that claims DeskSom is read-only

DeskSom reports which tools its server actually advertises. It cannot determine which actions a particular ChatGPT conversation was given or permitted to invoke. If one chat reports read-only access, use the [cross-chat discovery diagnostic](docs/CHAT_DISCOVERY_DIAGNOSTIC.md) and [release notes](docs/DISCOVERY_RESILIENCE.md) before blaming Windows permissions. The compact catalog improves descriptive signals but cannot override app permissions or frozen tool snapshots.

## Your DeskSom control panel

The installed non-elevated tray icon and Start Menu control panel provide a compact four-tab view of service status, authorized folder management, per-boot usage statistics and settings. The panel is DPI-aware; the tabs are navigation and the buttons perform actions, not duplicate navigation. File-tool folders can be added or removed without reinstalling; each change needs explicit approval and a brief restart. Windows Task Scheduler starts the local service **at user sign-in** and attempts restart on failure, while an intentional stop remains stopped.

Read the owner-controls documentation for folder approvals, privacy, startup and recovery. File-tool roots are not restrictions on the trusted-local shell.

## What the installer does

It creates a separate per-user runtime and private state, installs pinned dependencies, verifies the tunnel download, runs local checks, and registers a named, non-elevated Windows task. A saved plan and operation receipts support safe continuation. Repeated installation preserves credentials; changed files, foreign tasks, port conflicts and uncertain subprocess outcomes stop the workflow rather than trigger a reset.

The final account steps stay with you: create/select your own private tunnel, confirm its organization/workspace, and enter its runtime key in a **local masked prompt**. DeskSom then opens a guided ChatGPT Plugins checklist with Open Plugins and copyable tunnel ID/test message buttons, rather than leaving you to figure out plugin creation. The owner must still review the ChatGPT risk notice and approve the custom connection. Local health checks never claim that final ChatGPT call succeeded.

## Read more

[AI installation](AI_INSTALL.md) · [Human setup](INSTALLATION.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Security](SECURITY.md) · [Architecture](ARCHITECTURE.md) · [Test and release status](docs/QUALIFICATION.md)

This **0.2.0-rc.12 release candidate** targets Windows x64, PowerShell 7.4+ and Node.js 22+. The engine is pinned to Desktop Commander 0.2.52 and tunnel-client to 0.0.16. It is a source distribution for individual private installations, not a shared public shell or a public ChatGPT plugin-store submission. Each recipient uses their own credentials. The existing 0.1.x installer and task names are not silently migrated.
