# Changelog

## 0.2.0-rc.7: A real three-page installation wizard

The default Windows graphical installation now has a dedicated page for choosing an initial folder, a separate page to review and approve the installation, and a final page to connect ChatGPT or finish for now. Back/Next/Finish navigation lives in a consistent footer, replacing the crowded, vertically stacked controls. The fixed-size layout is checked at the host's actual DPI to catch clipped navigation or content before launch. The same immutable plan, source verification, local account permissions and runtime checks continue to govern installation. The GUI does not obtain or authorize an OpenAI tunnel without the owner's action.

## 0.2.0-rc.6: Native high-DPI clarity and plain-language folder choice

Fixed Windows PowerShell's DPI-unaware WinForms rendering on high-density displays. All graphical setup, control-panel, tray and local account windows now enable per-monitor DPI awareness before creating controls, then scale their pixel layout to the monitor's effective system DPI without bitmap stretching or enlarged fonts. The initial folder prompt now reads "Choose a folder ChatGPT can access", followed by "You can add or remove folders later". Added a native no-window scaling regression test under both Windows PowerShell and PowerShell 7. No service/tunnel semantics or security gates changed.

## 0.2.0-rc.5: Beginner-friendly Windows setup

The default double-click launcher now opens a graphical folder-picker and three-step install/connection assistant. It uses the same sealed source validation, approved installation plan and per-user service setup as the original CLI, with asynchronous installation and a responsive progress indication. The owner-only connection assistant has masked Windows credential dialogs and direct links to the necessary OpenAI account pages. No new runtime dependencies or per-user background agents were added; the previous console workflow remains available as Start-DeskSom-CLI.cmd. Owner authorization, Platform tunnel setup and the ChatGPT custom connection still require explicit account actions.

## 0.2.0-rc.4: Owner controls and resilience

Added revisioned, approved file-tool folder changes without mutating the original plan; a Windows tray and control panel with installation-owned Startup and Start Menu shortcuts; per-boot in-memory usage counters without a database; and up to 20 one-minute Task Scheduler restart attempts after unsuccessful exits. Active work and ambiguous outcomes remain protected against blind restart/replay. The original v0.2 discovery and tunnel authority boundaries remain.

## 0.2.0-rc.3: Discovery Resilience R1 integration

Integrated reviewed donor catalog compaction, truthful non-read-only annotations on file/host mutations, server-advertised capability reporting, and a reproducible cross-conversation diagnostic. Existing v0.2 installation identities, source fingerprints, tool schemas, task/credential controls and no-blind-replay behavior remain intact. No ChatGPT-side visibility guarantee or production cutover is claimed.

## 0.2.0-rc.2: owner-trial restart phase repair

After an owner-tested stop and restart, the installation receipt now updates from STOPPED to LOCAL_READY (or TUNNEL_READY for a configured tunnel) only after successful service readiness. New regression checks cover the transition. The inherited dependency advisories remain disclosed without imposing an extra maintainer approval gate.

## 0.2.0-rc.1: AI-first installation candidate

Human double-click setup and agent-directed JSON commands now use one installer. A read-only preflight produces a source/host/user/path-bound plan; installation requires its approved digest and acknowledgment of terminal permissions. Per-instance runtime, state, ports and task ownership support isolated evaluation alongside an existing service.

Added atomic progress records, subprocess completion receipts, mutex-based operation exclusion, pinned dependency/download verification, non-elevated task creation, exact readiness identity, narrow repair operations, explicit stop/start controls, task-only uninstall with data retention, a local masked tunnel-key prompt and fixed-field diagnostic exports.

Added AGENTS.md, AI_INSTALL.md, a human setup guide, troubleshooting, prerequisite instructions, a machine-readable result contract, a release checklist, manifest checking and test documentation. Native tests cover normal-user DACL updates, optional MCP response fields, disposable verification and unresolved-receipt handling.

A prepared source package does not mean a new owner's ChatGPT connection was tested. This remains a release candidate pending the second-machine pilot and actual private-account integration. The deployed 0.1.3 installation is not automatically upgraded.

## 0.1.3: deployed local baseline

Pinned Desktop Commander 0.2.52 and OpenAI tunnel-client 0.0.16; authenticated loopback MCP bridge; legacy and modern MCP support; host identity and bounded tool operations; no automatic write replay; unsupported upstream UI-resource metadata removed. This baseline was prepared for source distribution before the AI-first installer was developed.
