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

A lease may belong to another active worker, a crashed process, or an interrupted shutdown. Ordinary startup **never steals an active, same-boot, foreign, malformed, linked or ambiguous lease**. A duplicate writer is refused while other roots and core tools remain usable. A global stop that cannot verify every selected lease stays unconfirmed and keeps tool admission closed.

**Power-loss recovery:** An index worker can recognize a strictly bounded *previous-Windows-boot* orphan, based on the running OS boot time, the writer's original marker identity and timestamps, and the directory's unchanged private ownership boundary. The recovery requires an intact one-file marker directory, the original SQLite database still in the expected private `indices` folder, and marker/directory creation times at least 30 seconds before the current OS boot. It may proceed immediately after sign-in once Windows uptime is measurable. The original lock directory is atomically **moved intact**, never deleted, into a new uniquely named private `owner-repairs` evidence directory with intent and outcome receipts. Only then does a new writer acquire its own atomic lock. Authenticated root status reports `priorBootLockRecovered` when applicable.

If any proof is missing, incomplete or uncertain, it fails closed and retains the writer lease. The rc.14 core endpoint still starts and ordinary tools remain available even when an optional index cannot start. Existing databases are not reset, and no user/application write is ever replayed. This change is limited to a *provably older Windows boot*: an abandoned **same-boot** writer still requires manual reconciliation. OS clock anomalies, incompatible filesystems or hostile concurrent filesystem changes remain out of scope for automatic repair.

## Preserved guarantees

Quiescence is authenticated and bound to the current boot and installation. The final idle check and admission closure are atomic in the broker event loop. Successful indexed shutdown still requires the exact stop acknowledgment, clean worker exit and current lease absence. Cached success cannot conceal a reappeared lease. A later tool call is rejected after admission closes. No user file write is automatically replayed because an index update or acknowledgment was lost.

## Inspection owner controls and optional failures

Authenticated status includes projectInspection with enabled, ready, revision and a bounded errorCode. allFeaturesReady now includes inspection health; ready remains core admission. Public /readyz exposes only the corresponding boolean, never an executable path. Missing Git refuses inspection without taking down ordinary tools. A selected index root missing at startup reports UNAVAILABLE and is not opened; remaining roots stay usable.

The inspection CLI returns INSPECTION_PLAN_READY, INSPECTION_UPDATED or INSPECTION_UPDATED_STOPPED. Pending changes block ordinary management until reconciled; explicit guarded rollback returns INSPECTION_ROLLED_BACK_STOPPED. START_AUTHORIZED is the sole pending phase permitting the planned local restart. No field claims visual acceptance, scheduled-task qualification or new ChatGPT tool exposure.
