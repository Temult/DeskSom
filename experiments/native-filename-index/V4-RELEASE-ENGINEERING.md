# DeskSom native filename index v4 | Release engineering checkpoint

Date: 2026-10-18 (Eastern), some test receipts UTC 2026-10-19.
State: ISOLATED DEVELOPMENT CANDIDATE, NOT INSTALLED, NOT ENABLED, NOT PUSHED.

## What changed after v3
1. Periodic recovery: each self-healing worker schedules a differential full-tree reconciliation at a configurable interval (default 30 minutes, minimum 5, maximum 1440). Uses the existing writer thread, no new Windows service. Events and successful tool writes continue to reconcile dirty directories between full passes. No automatic replay of failed writes.
2. Exclusive writer: index-writer-lock.mjs uses atomic filesystem directory creation under the private index database path. Competing writers fail closed. A clean stop validates its own lease identity and removes it. Unexpected worker crashes leave a lock requiring explicit, inspected recovery. No automatic lock stealing or race-prone stale-PID guessing.
3. Cold-index optimization: insert path/name/parent records in one transaction, then bulk-create SQLite FTS5 trigram rows in one set operation. Delta operations keep normal per-entry FTS updates.
4. Installed-root binding preparation: scripts/lib/index-profile.mjs produces a SHA-256-bound, explicit owner-opt-in profile with exact current approved file roots, installed revision and a database location derived within private state. No arbitrary input database paths, no whole-drive escalation, no implicit enablement. The installer settings source now accepts an explicitly persisted valid index profile. **The actual owner-facing apply/restart workflow and Control Panel switch are not yet implemented or qualified**.
5. Regression coverage: existing source npm test command includes the new opt-in profile, Windows watcher, crash/lock and synthetic MCP HTTP tests. Pinned QA dependencies are temporarily attached only to this disposable worktree for test execution and are removed before committing.

## Tests
- Earlier real C:\DL v3 differential benchmark: 263,712 entries; restart catch-up 10,167ms, unchanged full 12,512ms, 0 changed rows, reader during reconciliation 97.1ms. Database ~174.5 MiB. Read-only source folder.
- Fresh v4 cold build on C:\DL: 263,712 entries, 18,212ms, DB 182,947,840 bytes; no C:\DL files changed. Receipt: ops/native-index-v4-cold-20261018/COLD_BUILD_RESULTS.json.
- V4 index-writer + periodic fixture suite: SELF_HEALING_RELEASE_GATES_PASS. Verified timer fires (test-only fast interval), duplicate writer denied, graceful release, crash-held lock, failure to steal stale lock and manual inspected recovery.
- Owner opt-in policy suite: 5/5 PASS (approved roots, disabled default, private deterministic storage, stale revision/hash denial, settings binding).
- Source npm test full expanded suite: see qualified run receipt (should be added only after confirming final actual exit code).

## Open release gates, not disguised as passed
- Need complete owner-facing Controls/installer opt-in AND guarded apply/restart, including private ACL tests. Profile generation alone is not a clickable installer feature.
- Node built-in sqlite is experimental on tested Node 25.2.1, while the published rc12 installer permits Node 22+. Future installer must either enforce a version with supported native SQLite/FTS5 or fail-closed to the original search when unsupported.
- Test journal/DB corruption and migration, writer crash during very large active scan, stale-lock recovery UI, watcher overflow and rename storm in independent QA.
- Stress test the 30-minute timer on a busy real tree and isolate arbitrary shell actions; exhaustive absence must remain non-authoritative until a complete inspection.
- Independent release review and fresh extracted source qualification before publishing rc13. Do not change production rc12 or public GitHub automatically.

## Safe status
On the tested host, original DeskSom rc12 Primary remains operational, default installation identity preserved, original 25-tool catalog and tunnel/key unchanged. All index databases/receipts are confined to separate C:\Projects\Somner\DeskSom\ops locations. No periodic index task has been installed in Windows.
