# Readiness and recovery in rc.14

## Separate the connection from optional indexing

`desksom_status` reports `readinessContract: CORE_SERVICE_WITH_OPTIONAL_FEATURE_HEALTH_V1`.

| Field | Meaning |
| --- | --- |
| `ready` | The core engine is connected and the broker is accepting new work. False after quiescence begins. |
| `indexWorkerReady` | Every configured self-healing index is ready. True when indexing is disabled. |
| `allFeaturesReady` | The core and all configured indices are ready. |
| `indexStatus` | Authenticated, bounded per-root state, observed progress, sanitized error code and readiness. |

A core-ready broker may have a building or failed optional index. File tools, the terminal, project inspection and searches of other healthy roots remain available. Consumers needing an indexed root must inspect that root's readiness, not merely `ready`. The unauthenticated `/readyz` endpoint exposes only core/aggregate booleans and boot identity, never root paths or database locations.

Earlier rc.13 code waited for every index's initial reconciliation before opening its endpoint. A startup failure could therefore make unrelated tools unavailable. A disposable corrupt-database fixture reproduced both `INDEX_WORKER_NOT_READY` and an abandoned writer lease in that version. This establishes a failure class; it does not establish the original cause of the maintainer's separate multi-root incident.

## Progress and interruption

Worker progress reports phases such as `COLD_BUILD`, `FULL_RECONCILIATION`, `BUILDING_SEARCH_INDEX` and `WATCHING`, with observed directories, entries and elapsed time. Counts are not a percentage and do not predict remaining duration. A progress message is never a readiness proof.

The worker checks a shared cancellation flag during synchronous directory walks. Cancellation rolls back the active transaction, then the explicit stop handler closes the database and releases its own lease. A single blocking filesystem call or SQLite statement can still delay observation of cancellation. A deadline expiring is an unconfirmed result, not permission to terminate a live writer or invent success.

Fatal initialization errors close only resources successfully acquired by that worker. A failed worker remains reachable for explicit stop acknowledgment. Existing databases are retained, not automatically rebuilt or reset. A corrupt-file regression verifies exact retained bytes; a schema-mismatch regression verifies retention of the incompatible schema, not byte-for-byte immutability of all SQLite metadata.

## Owner controls

The Fast search dialog runs plan, apply and guarded rollback with a responsive progress window. It starts each command once, drains output concurrently, and uses the original child-process handle to determine completion. An unresolved command reports its PID and asks for receipt inspection instead of retrying or terminating it.

A successful configuration apply means settings were saved and the core service identity was verified. It does not mean every initial index scan has finished. The Overview shows ready-root counts. Reopen Fast search to refresh per-root state and error/progress details. No automatic percentage or forced recovery is displayed.

## When a writer lease remains

A lease may belong to another active worker, a crashed process, or an interrupted shutdown. Ordinary startup never steals it. A duplicate writer is refused while other roots and core tools remain usable. A global stop that cannot verify every selected lease stays unconfirmed and keeps tool admission closed.

Inspect the exact installation, boot, writer identity, process lifetime and private operation receipt. Do not remove lock directories or reset databases as a generic fix. Preserve evidence and use a separately reviewed owner recovery procedure when needed. This candidate does not introduce automatic stale-lock reclamation or claim complete power-loss recovery.

## Preserved guarantees

Quiescence is authenticated and bound to the current boot and installation. The final idle check and admission closure are atomic in the broker event loop. Successful indexed shutdown still requires the exact stop acknowledgment, clean worker exit and current lease absence. Cached success cannot conceal a reappeared lease. A later tool call is rejected after admission closes. No user file write is automatically replayed because an index update or acknowledgment was lost.
