# Qualification and release status

## Candidate, not a deployment claim

This is the **0.2.0-rc.14 development candidate**. It combines the rc.13 R3 source lineage with the existing public rc.12 publication changes, then repairs optional-index startup isolation, failed-initialization cleanup, cooperative scan cancellation and owner-facing progress. No development test authorizes replacing a running service or reusing another installation's credentials.

The current test effort is maintainer verification, not an independent external audit. Earlier unresolved independent dynamic reviews remain historical evidence gaps, not retroactive passes. Public rc.12 downloads retain their original hashes; no rc.14 binary installer has been qualified by this document.

## October 21 power-loss recovery follow-up

An actual overnight laptop power loss left the rc.13 default installation's core broker and private tunnel disconnected. Its local stderr confirmed INDEX_WORKER_NOT_READY during rc.13's mandatory index readiness wait, and its private index directory retained a writer marker from the prior Windows boot. On October 21 a new guarded one-time owner script verified the exact host/SID/source/installation, stopped tasks and port, index profile and prior PID, then preserved the old lease as intact private evidence; a single official Start restored the original rc.13 broker, private tunnel and direct ChatGPT indexed search. No installed sources, index database, credentials or tunnel configuration were changed.

The rc.14 source now additionally recognizes *only* a conclusively prior-Windows-boot marker for automatic evidence-preserving quarantine and a fresh atomic writer acquisition. A real Windows worker fixture, immediate-sign-in clock scenario, same-boot refusal, live PID refusal and malformed-marker cases are tested. This is a source-candidate test, not proof that the installed rc.13 can perform automatic recovery. Future genuine cold-reboot/sleep-loss trials and new-owner installation acceptance remain outstanding.

## Painted-preview visual check and navigation regression

An instrumented *disposable copy* of the actual WinForms setup and control-panel sources was rendered with Windows PowerShell 5.1 at the observed 200% display scale. The first painted preview found a genuine wizard navigation defect: Show-Page reset Back to unscaled coordinates after the form was scaled. Earlier checks examined only offscreen bounds and therefore missed the overlap. The candidate fixes the dynamic position and now checks all three steps for footer placement, expected scaled coordinates, and collisions with page content, dividers, Next and Finish. The first and corrected images are retained privately for comparison. No GUI clicks or service operations were automated by the fixture. The owner has not yet performed a manual visual acceptance of an actually installed task-based instance.

## Historical initial rc.14 evidence categories

| Check | Scope and status |
| --- | --- |
| Pre-fix failure reproduction | A disposable corrupt SQLite file reproduced `INDEX_WORKER_NOT_READY`, unconfirmed stop and retained lease in the predecessor. This is not a proven diagnosis of the separate real-world multi-root incident. |
| Focused index regression | The initial repair passed 24 tests covering new initialization/cancellation/root-isolation cases and inherited health, writer ownership and strict stop-proof cases. |
| Real degraded-index broker | An isolated broker with one corrupt index and one healthy root passed actual read, write, PowerShell, inspection, healthy-root search, bad-root refusal and authenticated quiesce checks. |
| Native UI command helper | 17 assertions passed under PowerShell 7 and 17 under Windows PowerShell 5.1, including argument quoting, Unicode, large stderr, exact exit codes and no command replay. |
| Control-panel layout | Native no-window layout check passed at the observed 200% DPI with four pages and no reported clipping or overlap. This is not visual owner acceptance of the new progress dialog. |
| Full Node candidate regression | The complete 31-file selection passed: 132 tests, 131 passed, 0 failed, 1 skipped because Windows file-symlink creation was denied. All four exact 25/26/26/27 tool catalogs passed. These are maintainer source tests, not a fresh installed-owner acceptance. |
| Native owner-status bridge | Nine synthetic checks passed for propagation of optional health, preserved core identity validation, rejected unauthenticated responses and excluded unapproved fields. |

Private execution logs retain failed attempts and their corrections. The first extracted native run exposed an inherited stop-barrier fixture that omitted the identity fields required since R3. Its mock was corrected to provide the complete synthetic identity; the actual stop check was not relaxed. Additional negative cases now exercise foreign identities and missing fields. In particular, an initial broker fixture was missing its engine-overlay receipt, and another used a Windows short-name temporary path rejected by the existing file policy. Corrected fixtures did not weaken runtime permissions. Sanitized summaries may be published; raw host paths, process logs and credentials must not be.

## Completion and performance follow-up

The follow-up adds owner inspection plan/apply/rollback and revision-bound startup checks, missing-root and missing-Git fault isolation, indexed literal query planning, accurate truncation, case-only rename updates, a strict three-slot Git queue, and one compatible markdown-it patch. Current measured results and reproducible harnesses are in PERFORMANCE.md. Fresh final-package receipts and the PR distinguish these results from the initial candidate numbers above.

The matched A/B comparison uses alternating same-process queries against separate derived indices over identical fixtures, rather than comparing separate runs under different host load. Common/short queries have a small measured overhead; inspection is essentially unchanged. No cold-disk, remote ChatGPT latency or universal performance guarantee is claimed.

## Reproducible test selection

`npm test` invokes `scripts/Run-Tests.mjs`. It prints the runtime version and selected inventory. Node 22 runs core tests without claiming optional-index qualification; Node 25+ additionally selects index tests. `npm run test:core`, `npm run test:index` and `npm run test:all` select explicit scopes. Index-only and all-feature runs reject Node versions below 25. The candidate has been exercised locally on Node 25.2.1; runtime availability above the gate is not a blanket compatibility certification.

The same inventory is used by installer qualification. Optional SQLite tests must not make an ordinary Node-22 installation fail merely because indexing is disabled. Native installer checks include Windows ownership/ACL helpers, stop admission, catalog accounting, DPI/startup/completion/connection-guide checks and the responsive-command helper. Genuine installed lifecycle checks remain separate from source tests and synthetic helper objects.

Mutable test fixtures use temporary directories rather than the maintainer's project tree. Failure fixtures whose lease or outcome is unresolved are retained and excluded from source packaging. Existing experiments and manually invoked benchmarks are not part of the ordinary automated suite.

## Source and artifact identity

A new maintainer source manifest binds every included path, size and SHA-256. The manifest is not a publisher signature. The maintained `downloads/` subtree contains historically published binary artifacts with separate hash receipts and is deliberately excluded from new source manifests and source archives. It must not be repackaged as the current version.

Release preparation must inspect the exact public file set, verify a clean extracted source archive, and bind results to the candidate commit and artifact hashes. Do not regenerate an installed user's manifest to conceal drift. No fixture logs, private state, ownership receipts, dependencies, keys or task exports belong in the public archive.

## Remaining acceptance work

Before a new downloadable release: qualify a fresh normal-user installation using its exact source package; exercise owner index changes, long/failed initial crawls, stop/start and retained-state recovery; visually accept the responsive progress UI; and verify the genuine account/ChatGPT connection. A second Windows computer must exercise prerequisite discovery, path differences, security software and first-user behavior. Owner-facing project-inspection activation is now implemented and exercised against both mocked lifecycle controls and real isolated brokers. A real scheduled-task installation remains separate from that evidence.

No result here establishes complete power-loss recovery, pre-login operation, atomic protection against adversarial filesystem replacement, unlimited concurrent workloads, or vulnerability-free dependencies. See the dependency disclosure and readiness/recovery contract for separate limitations.
