# DeskSom

**Let ChatGPT work with your Windows computer, without turning it into a public server.**

DeskSom connects ChatGPT to the files, projects, and command-line tools on a Windows PC you control. You can ask an assistant to find a document, inspect a codebase, make an edit, or run a local command. The work runs on your computer, using your Windows account, through your own private OpenAI Secure MCP Tunnel.

DeskSom is a self-hosted bridge built around the open-source [Desktop Commander](https://github.com/wonderwhy-er/DesktopCommanderMCP) engine. It doesn't use Desktop Commander's hosted relay.

**[Get DeskSom v0.2.0-rc.15](https://github.com/Temult/DeskSom/releases/tag/v0.2.0-rc.15)** · [Setup guide](INSTALLATION.md) · [Security model](SECURITY.md)

## What can I do with it?

For example, you can ask ChatGPT to:

> “Find the latest budget spreadsheet in my project folder and summarize what's changed.”
>
> “Show me the state of this Git repository before we start editing.”
>
> “Update this configuration file, run the tests, and tell me what failed.”

DeskSom provides tools for reading and editing files, searching content and paths, working with spreadsheets and documents, running PowerShell and other local commands, and checking processes and command output.

Two optional features add useful context without getting in the way:

- **Fast filename search** finds names across folders you select for indexing. A local SQLite index is maintained in the background; it searches filenames, not file contents.
- **Project inspection** gives a bounded, read-only overview of a Git project: its branch, recent commits, changed files, tracked languages, and available script names. It does not execute project scripts.

Both are off by default. Enable them from the DeskSom Control Panel when you want them. The regular file and terminal tools remain available if an optional index is still building or needs attention.

## Get started

DeskSom currently targets **Windows x64**. You will need PowerShell **7.4+**, Node.js **22.12+**, and a normal Windows user account. Optional fast filename indexing requires **Node.js 25+**. Connecting to ChatGPT also requires an account and workspace with access to custom MCP connections and OpenAI Secure MCP Tunnels; availability and charges depend on your account.

1. **Download** the [current release](https://github.com/Temult/DeskSom/releases/tag/v0.2.0-rc.15). The rc.15 download is a portable ZIP, not an installer EXE. Check its SHA-256 against the checksum file provided with the release.
2. **Extract** the ZIP to a folder you intend to keep. Double-click `Start-DeskSom.cmd`. The setup wizard checks prerequisites, asks which folders to make available to file tools, and explains the access being granted.
3. **Connect your account.** The local setup assistant walks you through your own private tunnel and ChatGPT connection. Enter the restricted tunnel key in DeskSom's *local, masked* dialog, never in a chat message or GitHub issue.
4. **Try it in ChatGPT.** Ask the connected DeskSom to report its status, then approve a small disposable file test. A successful local installation alone does not prove the ChatGPT connection works.

You can finish the ChatGPT connection later without reinstalling. For the full walkthrough, see [Installation](INSTALLATION.md). If you're already using DeskSom, **don't overwrite its running files with a newly downloaded ZIP**; use a reviewed upgrade path that retains the previous installation for rollback.

## How it works

```text
ChatGPT
   │
   │ Your private OpenAI Secure MCP Tunnel
   ▼
DeskSom on your Windows PC
   │
   ├── Authenticated local broker
   │      └── Desktop Commander: files, terminal, search, processes
   │
   ├── Optional private filename index
   └── Optional read-only project inspection
```

The tunnel makes an outbound connection; DeskSom does not need an internet-facing port or a public web server on your PC. The local broker listens only on loopback and authenticates requests. Tunnel credentials are entered locally and encrypted for your Windows login.

DeskSom starts under your user account when you sign in to Windows. It doesn't run while the PC is shut down, asleep, or waiting at the sign-in screen. A tray icon and Control Panel let you review status, manage folders and optional tools, and deliberately start or stop the service.

## Understand the permissions

**DeskSom is powerful local access, not a sandbox.** Folders you select restrict its direct *file tools*. They **do not restrict terminal commands**, which run with your Windows account's permissions and can reach other files and programs that account can access. Give the connection only to assistants and workflows you trust, and review actions with consequences.

The private tunnel protects the connection path; it does not turn commands into harmless or read-only operations. DeskSom avoids automatically replaying writes after an uncertain result, keeps installation state and credentials separate from shared project folders, and reports core service health separately from optional indexing. These are safeguards, not a promise that every mistake or compromised account is contained.

Read the [security model](SECURITY.md) before granting access, particularly if the Windows account contains sensitive files.

## For developers and AI assistants

The README is the starting point. The detailed contracts live with the code:

| Start here | For |
| --- | --- |
| [INSTALLATION.md](INSTALLATION.md) | A human walkthrough of setup and connecting ChatGPT |
| [AGENTS.md](AGENTS.md) and [AI_INSTALL.md](AI_INSTALL.md) | Agents working on an already-authorized PC: permissions, installation plans, verification, and recovery |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Broker, tunnel, engine, Windows tasks, and configuration |
| [SECURITY.md](SECURITY.md) | Trust boundaries and the limits of folder permissions |
| [Owner controls](docs/OWNER_CONTROLS.md) and [Troubleshooting](docs/TROUBLESHOOTING.md) | Everyday administration and recovery |
| [Features](docs/INDEX_AND_INSPECTION.md) and [Contributing](CONTRIBUTING.md) | Indexing, Git inspection, development, and tests |

If you're an AI assistant asked to install or maintain DeskSom, **read [AGENTS.md](AGENTS.md) first**. Confirm which Windows machine you're operating on, review the exact installation plan and full-user shell access with the owner, never request a key in chat, and verify the result through a real ChatGPT tool call. Discovering tools does not itself grant permission to use them.

## Project status

The current public download is **[DeskSom v0.2.0-rc.15](https://github.com/Temult/DeskSom/releases/tag/v0.2.0-rc.15)**, a **portable prerelease** using Desktop Commander **0.3.0**. It has been tested on a Windows owner installation, but a second-machine/new-user evaluation and a real whole-machine power-loss trial remain outstanding. See the [release notes](https://github.com/Temult/DeskSom/releases/tag/v0.2.0-rc.15) for qualifications and known limits.

DeskSom is an independent community project, not an official OpenAI or Desktop Commander product. Each person installs their own copy and connects their own account. Contributions and focused bug reports are welcome via [Contributing](CONTRIBUTING.md).
