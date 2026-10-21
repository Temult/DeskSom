# DeskSom

Give ChatGPT a private connection to your Windows files and terminal through your own OpenAI Secure MCP Tunnel. DeskSom uses the pinned open-source Desktop Commander engine; it does not use Desktop Commander's paid hosted relay.

**Development candidate: 0.2.0-rc.14.** This branch adds resilient optional filename indexing and bounded project inspection. It is not a claim that rc.14 has passed a new-owner installation or been released as an installer. Existing rc.12 downloads and their exact hashes remain preserved under `downloads/v0.2.0-rc.12/`.

## What it does

The base installation exposes 25 tools for file access, content/path search, terminal execution, process sessions, configuration and diagnostics. Two optional tools extend that catalog to 26 or 27 tools:

- `find_files_fast`: selected-root, case-insensitive filename-substring search using a private SQLite index. Filesystem watching, acknowledged-write hints and periodic full reconciliation keep derived data current. It does not search file contents, and a missing result is never proof of absence.
- `inspect_project`: a bounded, read-only project/Git snapshot with branch, commit, working-tree counts, tracked languages and script names. It does not run project scripts, install dependencies, recurse into child repositories, or write Git state.

Both optional features are off by default. Filename indexing has an owner-approved control-panel workflow. Project inspection is integrated and tested, but a general installed-owner enable/disable workflow is still outstanding; do not edit an installation's sealed state by hand to activate it. See [the feature guide](docs/INDEX_AND_INSPECTION.md).

## Index trouble no longer means a dead connection

In rc.14, the core endpoint can serve ordinary tools while selected indices initialize or need attention. `desksom_status.ready` describes the core service; `indexWorkerReady`, `allFeaturesReady` and authenticated per-root `indexStatus` report optional-feature health separately. A failed root does not disable a healthy root's search. An unready root rejects fast searches with an explicit status rather than serving a stale snapshot as current.

Index progress reports observed work, not a guessed completion percentage. Initial full walks support cooperative cancellation. Setup failures clean up only resources acquired by that worker; existing foreign or crash-held writer leases are never stolen. The owner control panel distinguishes saved settings from a ready index and uses a responsive progress dialog for index changes.

These changes do not establish universal crash recovery. Blocking OS calls and individual SQLite operations are not preemptible, and an uncertain shutdown still requires inspection. Details are in [readiness and recovery](docs/READINESS_AND_RECOVERY.md).

## Requirements

Windows x64, PowerShell 7.4 or newer, and Node.js 22 or newer are the core baseline. **Optional indexed search requires Node.js 25 or newer; this candidate has been exercised on Node.js 25.2.1.** A newer major is not automatically a qualified runtime. Project inspection also needs an installed, trusted Git executable. The engine remains pinned to Desktop Commander 0.2.52 and tunnel-client 0.0.16.

The test runner reports which suites it selects. On Node 22 it runs core suites without claiming indexing qualification; `npm run test:all` requires Node 25+. See [qualification](docs/QUALIFICATION.md) for observed evidence and remaining acceptance steps.

## Installation and everyday use

Use a prepared, qualified release package, extract it, and double-click **Start-DeskSom.cmd**. The Windows wizard guides folder selection, installation and the optional account-connection checklist. **Start-DeskSom-CLI.cmd** retains the console route. Run as your normal Windows user, not as administrator. Do not replace a running installation with this development checkout.

The non-elevated tray icon and four-tab control panel provide service status, allowed file folders, optional filename-index selection, statistics and deliberate service controls. Startup occurs at Windows sign-in, not before login and not while the computer is asleep. Closing the tray does not stop the service.

**Powerful access, not a sandbox:** allowed folders restrict file tools, not terminal commands. Terminal tools have your Windows account's permissions. Keep the connection private and authorize only intended work. The selected index roots are a separate subset of approved file-tool roots.

## Ask an authorized AI to help install a qualified release

> Read AGENTS.md and AI_INSTALL.md, inspect the existing installation, and use the prepared release's preflight and approved-plan installer. Explain Windows-user terminal access. Keep API keys out of chat and guide me through the local masked prompt. Preserve existing installations and verify an actual ChatGPT identity call and disposable file round-trip before calling setup complete.

Without an existing authorized computer-control connection, an AI cannot bootstrap local access by itself. The double-click launcher is the human entry point. Each recipient needs their own private account association; account availability, permissions, billing and usage limits are separate from DeskSom.

## Evidence, privacy and limitations

Source manifests bind exact bytes, but are not publisher signatures. Operation receipts distinguish preparation, local readiness and actual ChatGPT verification. DeskSom never blindly replays an ambiguous write. Private configuration, credentials, task exports and raw logs do not belong in the public source archive.

The pinned dependency tree has disclosed advisories. Read [the dependency review](docs/DEPENDENCY_REVIEW.md); passing functional tests is not proof that every dependency is vulnerability-free. A dependency audit is not an extra manual installation approval gate.

[Installation](INSTALLATION.md) · [AI installation](AI_INSTALL.md) · [Owner controls](docs/OWNER_CONTROLS.md) · [Features](docs/INDEX_AND_INSPECTION.md) · [Recovery](docs/READINESS_AND_RECOVERY.md) · [Security](SECURITY.md) · [Qualification](docs/QUALIFICATION.md) · [Troubleshooting](docs/TROUBLESHOOTING.md)
