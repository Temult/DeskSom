# Machine-readable result contract

The CLI emits one JSON result envelope to stdout. Ordinary commands do not print keys, raw subprocess logs or arbitrary underlying exception messages. Detailed setup logs remain in private state. Never interpret an exit code alone.

Every result uses schemaVersion `desksom.result/v1` and includes command, at, operationOk, setupComplete and status. An unsuccessful operation includes an error object with code, message and nextAction. Local commands intentionally keep **setupComplete:false**. No local health receipt can establish that a ChatGPT-side tool call occurred.

| Status | What it establishes |
| --- | --- |
| PLAN_READY | Source, host, user, prerequisite, path, task and port checks passed; no service was installed. |
| PREPARED | Pinned runtime and local tests passed; no service task was created by preparation. |
| ALREADY_INSTALLED | An owned installation already exists; prepare-only did not downgrade it. |
| LOCAL_READY | The expected local installation and MCP interface passed the applicable checks. |
| INSTALLED_STOPPED | Installation exists but the owner stop marker prevents restart. |
| TUNNEL_READY | Owned local tunnel and control-plane polling passed; a ChatGPT test is still required. |
| SERVICES_READY | An explicitly requested start passed readiness for the configured services. |
| DIAGNOSIS_ONLY | Repair inspected state; it made no changes. |
| REPAIR_APPLIED | One approved narrow repair was applied; run verify afterward. |
| STOPPED / TASKS_REMOVED | Owned services stopped, or stopped owned tasks removed; data and credentials retained. |
| ATTENTION_REQUIRED / BLOCKED | The requested success condition was not established. Read the error and receipts. |

`localReady`, `tunnelReady`, and `readyForChatGPTVerification` are separate booleans where applicable. A successful `status` call can have a healthy local service but no configured tunnel. A successful diagnostic export only proves that the fixed-field report was written. A result schema describes shape, not authority.

Exit codes: 0 means the requested command reported success; 10 requests owner action/approval or a missing readiness condition; 20 indicates invalid or unsupported input; 21 integrity/binding failure; 22 conflicting ownership, task or path; 23 busy runtime/lock; 24 preparation or platform failure; 25 an uncertain outcome. Inspect the stable error code, not just this category.

Examples of important codes: PLAN_CHANGED, PLAN_STALE, SOURCE_DRIFT, DEPENDENCY_DRIFT, TASK_DRIFT, PORT_OCCUPIED, OWNER_STOPPED, CHILD_OUTCOME_UNCERTAIN, VERIFICATION_OUTCOME_UNCERTAIN, START_OUTCOME_UNCERTAIN and TASK_WRITE_UNCERTAIN. Do not convert an uncertainty into success or automatic replay.

`export-diagnostics` writes a create-only, fixed-field summary. It excludes hostnames, usernames, SIDs, paths, task arguments, raw logs, key material and application contents. Plan/status outputs are local operator records and can include host/path metadata; do not treat them as public support exports.

## DeskSom MCP identity capability extension

The MCP `desksom_status` tool also provides `advertisedToolCount`, `advertisedCapabilities` and `catalogSha256`. The 24 upstream tools are counted in `tools` for backward compatibility; `advertisedToolCount` includes the identity tool itself, totaling 25. The capability summary lists advertised file-mutation and host-execution names plus server-only discovery limits. It cannot see what actions ChatGPT exposed in the current conversation and does not prove authorization. Use `docs/CHAT_DISCOVERY_DIAGNOSTIC.md` to distinguish a client-side omitted tool from an actual server or Windows access error.
