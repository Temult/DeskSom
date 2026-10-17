# Changelog

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
