# Discovery resilience in DeskSom v0.2.0-rc.3

DeskSom intentionally distinguishes the **25 tools advertised by its MCP server** from the actions a particular ChatGPT conversation sees, selects, and can execute. A healthy Windows host plus a successful write in another chat does not establish that this chat was offered `write_file`.

## What changed

The qualified Discovery Resilience R1 donor supplied `catalog.mjs`, compact tool descriptions, accurate non-read-only annotations for five file-mutation and four host-execution tools, and `catalogCapabilities`. The v0.2 implementation integrates those helpers without replacing its newer broker, installation identity, source fingerprint, authorization boundary, no-replay behavior, or private tunnel setup.

`desksom_status` adds `advertisedToolCount` and `advertisedCapabilities`, containing `toolCount`, `toolNames`, `fileMutationTools`, `hostExecutionTools`, `advertisesFileWrites`, `advertisesHostExecution`, `clientVisibility`, `permissions`, and `interpretation`. The `catalogSha256` hashes the 24 upstream tool definitions actually served, while `advertisedToolCount` includes the identity tool, totaling 25. `tools` retains its backward-compatible count of 24 upstream tools. Both legacy MCP tools/list and modern 2026-07-28 tools/list advertise precisely the same tools.

No input schemas, tool names, or runtime dispatch implementation are changed. As before, upstream UI resource metadata is suppressed because DeskSom cannot serve those resources. `readOnlyHint:false` on a mutating tool is descriptive metadata, not a privilege grant. An actual tool call still passes the ChatGPT and DeskSom authorization layers.

## Why this does not force ChatGPT to expose write tools

Tool descriptions can help an AI choose an available action, but they do not override app, workspace, model, plan, policy, or per-chat restrictions. Tool catalogs can be cached or snapshot by the client. Modern discovery's `ttlMs:0` and `cacheScope:'private'` are server-protocol metadata; they cannot force ChatGPT to replace an already registered/published tool-action snapshot.

Per OpenAI's custom MCP connection guidance (reviewed October 17, 2026), eligible Business/Enterprise/Edu administrators can **refresh a connected app's tool list** in workspace app settings. Previously approved workspace actions may use a frozen snapshot, and new actions may need explicit re-enabling. A refresh is not automatically performed by a server restart. Availability and exact UI steps vary by account/workspace. Do not promise that refreshing is possible for all accounts.

Reference: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt

## Diagnostic outcome categories

- `CHAT_TOOL_NOT_EXPOSED`: status advertises a mutation tool, but it is genuinely absent from the chat's available tools.
- `CLIENT_ACTION_DENIED`: the tool is exposed but its invocation is denied by the ChatGPT/platform/client layer.
- `HOST_WRITE_REJECTED`: a real invocation reaches the host and is rejected by file-tool roots or Windows permissions.
- `WRITE_CONFIRMED`: an authorized, unique disposable write succeeds and its bytes are independently checked.
- `OUTCOME_UNCERTAIN`: a call had an ambiguous outcome; inspect effects and receipts, never blindly retry.
- `SERVER_CATALOG_MISMATCH`: the server's actual tool list contradicts the capabilities it reports.

See [CHAT_DISCOVERY_DIAGNOSTIC.md](CHAT_DISCOVERY_DIAGNOSTIC.md) for the pasteable chat-side procedure and controlled two-chat comparison.

## Comparison experiment after an owner-approved deployment

Keep production untouched while qualifying this release. When deployed at a maintenance seam, record the exact DeskSom host, bootId, catalogSha256, and version. In both **an existing problematic conversation** and **a fresh conversation on the same account/model/mode**, run the exact same diagnostic within five minutes, preferably against the **same boot ID and catalog hash**.

Record the available names `mcp__DeskSom__write_file`, `mcp__DeskSom__edit_block`, `mcp__DeskSom__create_directory`, and `mcp__DeskSom__start_process`. If the chat exposes write_file and its action is permitted, create a unique disposable file under an explicitly authorized test folder, read it back, verify the exact bytes, and remove only that verified file. If one chat lacks the tool while another exposes it with the same boot ID/hash, report client-side inconsistency rather than asserting Windows read-only permissions.

This is a **hypothesis test**, not proof of the exact platform mechanism. When server-side catalog hashes differ, first diagnose restart or action-snapshot refresh instead of comparing the two chats as if they shared the same metadata. A new conversation alone cannot guarantee a stale published app catalog has refreshed.

## Operational caveats

Changing tool descriptions changes the catalog hash, even if names and schemas stay stable. Plan any production change with active-worker coordination, source and task backups, a rollback route, and a ChatGPT-side rediscovery check. Do not restart production solely for discovery debugging, and do not use terminal commands to circumvent a tool denial. The server remains a trusted-local executor, not a sandbox.
