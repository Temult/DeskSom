# Qualification and release boundaries

The public source is a **0.2.0-rc.10 release candidate**. The production 0.1.3 service is a separate installation and is not upgraded by developing or testing this candidate. Do not confuse evidence from that older service with an end-to-end test of a newly installed instance.

The final source includes the open dependency-audit findings in [DEPENDENCY_REVIEW.md](DEPENDENCY_REVIEW.md). Functional correctness and dependency vulnerability disclosure are separate considerations; the installer does not require a separate human approval gate for the disclosed advisories. The release qualification report distinguishes the exact native-tested implementation from subsequent documentation-only additions.

## Discovery-specific qualification

Added catalog-schema preservation, capability-reporting, and isolated modern/legacy MCP integration tests including real temporary file edits, shell execution and bearer rejection. The server reports advertised capabilities only; a real ChatGPT visibility comparison on the updated connection remains a separate deployment-time experiment. See [DISCOVERY_R1_INTEGRATION.md](DISCOVERY_R1_INTEGRATION.md).

## Installed-service completion verification

Windows PowerShell 5.1 can return a null ExitCode from a Start-Process -PassThru instance even after HasExited. The graphical wizard now verifies a success envelope against a separate read-only authenticated status call and checks installation ID, source fingerprint, version and private state root. It handles missing optional error fields under StrictMode instead of crashing. A native 11-assertion regression suite checks positive and negative completion receipts and is included in installer pre-activation qualification. No ambiguous install is automatically replayed.

## First-launch StrictMode qualification

The Windows PowerShell setup now initializes its review summary before the first actual Show event. The prior rc.8 wizard raised an unset-variable error on first launch in PowerShell StrictMode, even though visual preview and layout checks passed. An explicit -StartupCheck replays the source validation and the Load-ExistingPlan initialization route using a unique new instance without showing a UI or creating an installation plan. The installer runs this smoke test natively before registering any service task. The test rejects missing source integrity, lost first-page navigation, and unexpected installation activity.

## Wizard layout qualification

The default graphical setup now uses three distinct, non-overlapping pages and a shared Back/Next footer. A -LayoutCheck pass builds the actual WinForms controls without showing the window or installing anything. The dedicated -PreviewOnly mode allows a human to view and navigate all three pages without installing a local service, configuring a tunnel or changing private state. It visits all three pages, checks geometry against the live DPI-aware screen, and rejects any clipped button or page content. These checks supplement the existing PowerShell AST, MCP and native installer tests, but do not replace the owner's final visual pilot.

## High-DPI graphical qualification

The WinForms setup, tray, control panel, and local private-account dialogs enable DPI awareness before constructing windows. The supported Windows display reports its physical system DPI, not the virtual 96 DPI of a bitmap-stretched legacy window. Layout bounds are scaled separately from font rasterization. Automated smoke tests exercise WinForms in a no-window child under both Windows PowerShell 5.1 and PowerShell 7, and the native installer now runs the Windows PowerShell DPI check. A human screenshot still determines visual presentation and legibility on the target screen.

## Graphical installer qualification

The graphical setup reuses the existing release manifest, plan generation, owner approval and installed CLI rather than introducing a second installer backend. Pure tests verify the graphical entry point, CLI fallback, approvals, masked local connection prompts, and prerequisites. Windows PowerShell AST checks cover all new scripts. The actual graphical appearance, first-time user workflow, WinGet prompts on a machine missing dependencies, and a new owner's private ChatGPT tunnel still require a desktop pilot.

## Owner control qualification

Tests include folder approval digests and rejection cases, explicit startup shortcut ownership, signed-in-user task retry settings, installed folder add/remove/verification, and broker statistics. Actual tray rendering and sign-in behavior need a live human desktop test. Sign-in startup is not a claim of pre-login system-service support.

## Automated suites

- `scripts/tests/installer.test.mjs`: plan/digest semantics, path restrictions, input validation, consent ordering, task ownership, readiness identity, safe result envelopes and source-manifest failures.
- `scripts/tests/windows-helper.test.ps1`: native normal-user DACL behavior, optional MCP isError handling, successful disposable verification, uncertain-receipt blocking and no false ChatGPT completion claims. Replies are synthetic; no cloud key or real task is needed for this suite.
- `security.test.mjs` and `modern.test.mjs`: bearer/origin checks, credential environment boundaries, malformed protocol handling, live isolated modern/legacy transport and absence of unserved UI references.
- `acceptance.mjs`: 26 engine checks covering file read/write/hash/edit, search, PowerShell, process output, concurrency, restart identity and stdio/HTTP behavior.

The installer runs the security, modern, discovery and installer suites plus native Windows helper checks before service registration, records qualification against the approved source fingerprint, and seals the dependency tree. A repeated installation validates its existing receipt rather than blindly repeating successful preparation. Read the separate release qualification report for results bound to the final source archive and test instance.

## What still requires real-world verification

A clean second Windows computer may differ in prerequisite installation, security software, Store aliases, permission policy or network access. Windows UAC/WinGet prompts, the owner's actual OpenAI tunnel key/association, the current ChatGPT UI, and a genuine ChatGPT-selected tool call through the new instance must be checked in the pilot installation. Local mocks or a healthy loopback response are not substitutes.

The release does not claim an independent external security audit, complete crash/power-loss recovery, universal dependency safety, or uninterrupted multi-hour workloads. It intentionally blocks ambiguous states rather than inventing a guarantee of exactly-once execution. Stopping a service can interrupt work and requires explicit confirmation.

## Development verification

Run the Node unit tests from a clean source checkout. For a complete native rehearsal, create a new reviewed plan using a unique instance, separate source/runtime/state/work directories and unused port; install with `-PrepareOnly`, then activate that same plan and exercise lifecycle controls. Use no production credentials and never repoint another service's tasks. Preserve original failed receipts, record reconciliation, remove only verified test-owned tasks, and retain the fixture's private state for review.

GitHub Actions performs reproducible source syntax and pure unit checks. It is not a claim that the full normal-user installation lifecycle passed on a hosted runner, which may run under a privileged account. The native Windows qualification is a separate release gate.
