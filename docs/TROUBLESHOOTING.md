# Recovery without blind retries

First use `DeskSom.ps1 status --state "<state directory>" --json`, or `repair` without `--apply`. Use the original approved source or the installed runtime. Do not change file hashes to make integrity checks pass. Preserve the original error, command, time and private receipts before taking action.

## Common conditions

**Missing prerequisite:** Run Start-DeskSom.cmd locally or read PREREQUISITES.md. It can offer official WinGet packages after owner approval. An elevation prompt belongs to Windows and the owner, not to an AI bypass. The DeskSom service itself must run non-elevated.

**Existing 0.1.x service, foreign task, occupied port or directory:** Nothing is overwritten. Inspect the actual owner. Use a distinct instance and an unused port for a separate evaluation. This release does not silently migrate 0.1.x. Do not stop the working service merely to satisfy a new installer.

**Source, settings or dependency drift:** Stop preparation, retain evidence, and obtain a clean reviewed source. Existing runtime files are not automatically replaced or resealed. Do not edit plan.json after approval. A moved or changed source needs a new plan; an installed runtime can manage its own bound instance.

**Preparation failure with a confirmed completed child:** Read the private log and native-active.json. After fixing the cause, the same approved installation may resume completed ordinary setup stages. A failing npm invocation is not evidence that application work was rolled back.

**CHILD_OUTCOME_UNCERTAIN or a RUNNING/INTENT receipt:** Inspect the exact recorded process and the intended stage. The controller may have exited while a child remained. Do not delete the receipt, force an unlock, reinstall dependencies or replay work to make progress. Reconcile the effects explicitly; when uncertain, leave this installation stopped and preserve it for review.

**VERIFICATION_OUTCOME_UNCERTAIN:** A prior disposable write/read/cleanup did not reach a complete receipt. Read the private verification record and compare the unique fixture's path and exact nonce-bearing bytes. Delete only a fixture proven to be that test's file, record its hash and final absence, then add an explicit reconciliation record. Keep the original receipt as evidence. Read-only verification remains available. Never remove an arbitrary similarly named file.

**START_OUTCOME_UNCERTAIN:** The process may still be starting. Repeat read-only status and inspect the exact task/process before deciding on a new start. HTTP 200 alone is insufficient; host, version, instance, installation ID and source fingerprint must match.

**OWNER_STOPPED:** Repair will not reverse an intentional stop. The owner can deliberately run `start --state "<state>" --enable --json`. Stopping requires `--confirm-stop` because it can interrupt jobs; removing tasks requires a preceding verified stop and `--confirm-remove-tasks`.

## Permitted repair operations

`repair` is diagnostic unless `--apply` and an operation are explicitly supplied. `restore-missing-tasks` recreates only missing exactly owned tasks and does not start application work. `start-stopped` respects the owner stop marker and never force-kills a foreign process. Changed task arguments, principal, run level, launch path or ownership marker cause refusal.

## Tunnel and ChatGPT

A runtime key is entered through scripts/Configure-Tunnel.ps1 in a local masked prompt. Existing keys and tunnel association are not silently replaced. Check source/local readiness first, then the tunnel's actual health/polling state, then the ChatGPT connection. Key rotation is not the default response to an MCP setup error.

Official account guidance: https://developers.openai.com/api/docs/guides/secure-mcp-tunnels . Private tunnel support is not permission to submit an unrestricted public ChatGPT plugin. Use `export-diagnostics` for a small reviewed support report. Never upload raw HAR files, logs, credentials or project contents.
