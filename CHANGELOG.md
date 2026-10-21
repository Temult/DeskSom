# Changelog

## 0.2.0-rc.14 power-loss startup recovery

Repair the recurring reboot failure where a prior-boot index writer lease causes INDEX_WORKER_NOT_READY and takes the rc.13 broker and private tunnel offline. On a fresh rc.14 boot the broker already admits ordinary tools independently of optional index health. The new index recovery recognizes only marker and filesystem timestamps conclusively predating the current Windows boot, verifies an intact private database/lease, moves the entire obsolete lease to private evidence with receipts, and obtains a new atomic writer lease. Same-boot, linked, foreign and uncertain leases are retained and refused. Native regression cases cover immediate sign-in recovery, accepted orphans, refused ambiguity and byte-identical database/marker preservation. This source change does not alter the already running rc.13 installation or credentials.

## 0.2.0-rc.14 visual polish: scaled wizard navigation

The first real painted WinForms preview at 200% display scaling revealed that the Setup wizard's dynamically relocated Back button was using unscaled pixel positions after the rest of the window had been scaled. It could overlap the folder field or ChatGPT setup controls. Fix dynamic positioning for all three steps and add an explicit footer/content/button collision regression, included in installer qualification and Windows CI. No service, tunnel or credential change is required.

## 0.2.0-rc.14 follow-up: complete owner inspection controls and measure performance

Add approved inspection enable/disable, revision-bound restart confirmation and guarded rollback. Only the local broker restarts; indexing, tunnel and credentials are preserved. Missing optional Git or a missing selected index root no longer prevents core access. The public installer still defaults optional tools off.

Use an indexable literal anchor for SQLite trigram queries instead of disabling the optimization with ESCAPE on every query. Preserve wildcard-literal semantics, report bounded-result truncation accurately, refresh case-only filenames and yield between concurrent queries. Reserve Git subprocess slots for queued work. See docs/PERFORMANCE.md for measured gains, unchanged paths and small regressions.

Pin only markdown-it to patched 14.3.3. Engine, SDK and all other locked packages remain unchanged. A fresh audit reports eleven affected-package findings (five high, six moderate, no critical), with the two markdown-it advisory paths removed. Remaining findings are disclosed, not suppressed.


## 0.2.0-rc.14: Optional-index resilience (development candidate)

Separate core service readiness from optional index health. The endpoint starts without waiting for all initial scans; authenticated status exposes truthful per-root progress and errors. Healthy-root search and ordinary file, terminal and inspection tools remain usable when another index fails. Searches of unready roots are explicitly refused.

Add cooperative cancellation checkpoints during full walks, rollback on interrupted traversal, and resource cleanup after failed worker initialization. Preserve incompatible/corrupt databases and foreign or crash-held leases. Explicit stop still requires the exact acknowledgment, clean exit and current lease absence. No forced worker termination, lock stealing or automatic application-write replay is added.

Run index plan/apply/rollback through a responsive owner progress dialog, retain exact native command exit codes, and distinguish saved settings from completed scans. Forward optional health through the Windows helper and show it in the control panel. Attach engine stderr before the MCP handshake so early diagnostics are drained.

Add startup/cancellation/root-isolation regressions, a real degraded-index broker test, native UI-command and status-probe checks, portable temporary fixtures and one version-aware test inventory. Node 22 qualifies the ordinary feature set without claiming SQLite-index qualification; Node 25+ selects index tests. Preserve prior public binary downloads outside new source manifests. Documentation now distinguishes development source, installed state, observed tests and public release acceptance.

This entry does not claim a new binary release, live upgrade, second-machine pilot, visual owner acceptance or independent external review.

## 0.2.0-rc.13: Native filename index and project inspection (maintainer lineage)

Integrated optional selected-root SQLite filename indexing and bounded read-only Git/project inspection into one broker and engine. Added best-effort watcher repair, acknowledged-write hints, explicit miss reconciliation, private writer ownership and strict shutdown proof. R2 repaired filename-less notification recovery; R3 separated authenticated idle-owner checks from temporarily stale optional index health. A later owner multi-root startup incident was recovered without resetting databases or rotating the tunnel; its original trigger remains unproven. The rc.14 changes address reproduced startup failure classes rather than retroactively declaring that incident fully diagnosed.

## 0.2.0-rc.12: Guided ChatGPT connection completion

After a successful local tunnel configuration, DeskSom now opens a native account-connection guide instead of leaving the owner to discover ChatGPT custom MCP plugin creation. It opens the ChatGPT Plugins page on request, explains the exact Tunnel and ChatGPT-facing No authentication selections, allows owner-initiated copying of the correct locally stored tunnel identifier and instance-bound verification message, and makes clear that setup is not proven until ChatGPT calls the intended instance. The three-page installer and Control Panel can reopen the guide without repeating an already configured tunnel. The guide never reads an API key or creates a ChatGPT plugin, and keeps all account security confirmations with the owner. Added a native six-step layout/behavior smoke to installer qualification. No installed DeskSom, production tunnel or credentials are modified by this source work.


## 0.2.0-rc.11: Compact owner control panel

Replace the inherited oversized high-DPI control-panel layout with a smaller four-tab arrangement, aligned status fields, a compact statistics dashboard and long-path folder scrolling. Tabs alone handle navigation; refresh stays near the Overview heading. Keep all existing owner-approved folder and service actions, including their restart and consent requirements. Add a guarded, no-install visual preview and a native geometry check that detects clipping and overlapping controls. The rc.10 installation-completion repair remains unchanged. The complete local engineering qualification still runs for this candidate; installation-time optimization is deferred to a separate, measured change.


## 0.2.0-rc.10: Verify actual installation completion

The Windows graphical wizard no longer confuses a nullable Start-Process ExitCode with a failed install. A LOCAL_READY installation receipt must be corroborated by a separate authenticated read-only status check matching the exact installation, version and source fingerprint. Optional error fields are inspected safely under StrictMode, and the native completion regression now runs during installer qualification. The fix does not reinstall a successfully running service or change tunnel/permission boundaries.

## 0.2.0-rc.9: Repair first-run setup initialization

Initialize the per-wizard review summary before Windows PowerShell StrictMode reaches first-run prerequisite checks. Add a native no-window first-launch regression that follows source-check and setup-initialization paths, and include it in the pre-activation installer qualification. No service, tunnel, folder-policy or ownership-boundary change.

## 0.2.0-rc.8: Wizard readability polish

The second page now describes automatic sign-in startup in plain language while retaining the essential Windows-user terminal permission warning. The final page offers only one Finish button, with Back alongside it, rather than two finish actions. The visual-only preview explains disabled connection and control-panel buttons and preserves the same installation and account authority controls.

## 0.2.0-rc.7: A real three-page installation wizard

The default Windows graphical installation now has a dedicated page for choosing an initial folder, a separate page to review and approve the installation, and a final page to connect ChatGPT or finish for now. Back/Next/Finish navigation lives in a consistent footer, replacing the crowded, vertically stacked controls. The fixed-size layout is checked at the host's actual DPI to catch clipped navigation or content before launch. A read-only visual preview lets reviewers navigate the pages without installing anything. The same immutable plan, source verification, local account permissions and runtime checks continue to govern installation. The GUI does not obtain or authorize an OpenAI tunnel without the owner's action.

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
