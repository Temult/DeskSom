# Qualification and release boundaries

The public source is a **0.2.0-rc.2 release candidate**. The production 0.1.3 service is a separate installation and is not upgraded by developing or testing this candidate. Do not confuse evidence from that older service with an end-to-end test of a newly installed instance.

The final source includes the open dependency-audit findings in [DEPENDENCY_REVIEW.md](DEPENDENCY_REVIEW.md). Functional correctness and dependency vulnerability disclosure are separate considerations; the installer does not require a separate human approval gate for the disclosed advisories. The release qualification report distinguishes the exact native-tested implementation from subsequent documentation-only additions.

## Automated suites

- `scripts/tests/installer.test.mjs`: plan/digest semantics, path restrictions, input validation, consent ordering, task ownership, readiness identity, safe result envelopes and source-manifest failures.
- `scripts/tests/windows-helper.test.ps1`: native normal-user DACL behavior, optional MCP isError handling, successful disposable verification, uncertain-receipt blocking and no false ChatGPT completion claims. Replies are synthetic; no cloud key or real task is needed for this suite.
- `security.test.mjs` and `modern.test.mjs`: bearer/origin checks, credential environment boundaries, malformed protocol handling, live isolated modern/legacy transport and absence of unserved UI references.
- `acceptance.mjs`: 26 engine checks covering file read/write/hash/edit, search, PowerShell, process output, concurrency, restart identity and stdio/HTTP behavior.

The installer runs these applicable local suites before service registration, records qualification against the approved source fingerprint, and seals the dependency tree. A repeated installation validates its existing receipt rather than blindly repeating successful preparation. Read the separate release qualification report for results bound to the final source archive and test instance.

## What still requires real-world verification

A clean second Windows computer may differ in prerequisite installation, security software, Store aliases, permission policy or network access. Windows UAC/WinGet prompts, the owner's actual OpenAI tunnel key/association, the current ChatGPT UI, and a genuine ChatGPT-selected tool call through the new instance must be checked in the pilot installation. Local mocks or a healthy loopback response are not substitutes.

The release does not claim an independent external security audit, complete crash/power-loss recovery, universal dependency safety, or uninterrupted multi-hour workloads. It intentionally blocks ambiguous states rather than inventing a guarantee of exactly-once execution. Stopping a service can interrupt work and requires explicit confirmation.

## Development verification

Run the Node unit tests from a clean source checkout. For a complete native rehearsal, create a new reviewed plan using a unique instance, separate source/runtime/state/work directories and unused port; install with `-PrepareOnly`, then activate that same plan and exercise lifecycle controls. Use no production credentials and never repoint another service's tasks. Preserve original failed receipts, record reconciliation, remove only verified test-owned tasks, and retain the fixture's private state for review.

GitHub Actions performs reproducible source syntax and pure unit checks. It is not a claim that the full normal-user installation lifecycle passed on a hosted runner, which may run under a privileged account. The native Windows qualification is a separate release gate.
