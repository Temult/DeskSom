# DeskSom cross-conversation capability diagnostic

Purpose: distinguish server catalog, ChatGPT tool visibility/selection, ChatGPT app permissions, Windows filesystem permissions, and host runtime failures. This is a diagnostic, **not** a mechanism to bypass access controls.

## Paste this into any affected conversation

> Diagnose DeskSom tool exposure before claiming that DeskSom is read-only.
> 1. Call DeskSom `desksom_status`. Record host, bootId, ready, catalogSha256, advertisedToolCount and the advertised file-mutation and host-execution tool names, if supplied.
> 2. Explicitly look for `mcp__DeskSom__write_file`, `mcp__DeskSom__edit_block`, `mcp__DeskSom__create_directory` and `mcp__DeskSom__start_process` in the tools available *to this conversation*. Do not infer absence from the tools previously chosen.
> 3. Distinguish **SERVER_ADVERTISES_WRITE**, **CHAT_HAS_WRITE_TOOL**, **CHAT_CAN_INVOKE_WRITE**, and **WRITE_SUCCEEDED**. These are four separate facts.
> 4. If a write tool truly is not exposed, do not claim Windows or DeskSom denied it. Report **CHAT_TOOL_NOT_EXPOSED**, exact tool name, current model/mode, timestamp and server bootId. Do not use another tool to circumvent a genuine denial.
> 5. If write_file is exposed and there is no platform restriction, create a unique disposable probe under C:\Projects, read it back, and delete only after exact content verification. A failed/ambiguous write requires inspection before any retry.
> 6. If write_file is exposed but call fails, report the exact error unchanged (permission, timeout, schema, or transport). Never call it “read-only” without evidence.

## Classification

| Observation | Classification | What it means |
| --- | --- | --- |
| `desksom_status` says ready=true and advertises write_file; chat cannot find write_file | CHAT_TOOL_NOT_EXPOSED | Client tool discovery, selection, or gating is at issue; host write access untested |
| write_file exposed, but platform blocks invocation before reaching server | CLIENT_ACTION_DENIED | ChatGPT permission/policy gate, not a Windows filesystem rejection |
| write_file invoked, upstream returns access denied | HOST_WRITE_REJECTED | Investigate path, allowed roots, Windows ACL and error |
| write_file invoked and path verified | WRITE_CONFIRMED | Specific operation succeeded, not a universal permission guarantee |
| tool call uncertain | OUTCOME_UNCERTAIN | Inspect disk and logs; do not blindly replay writes |
| server catalog does not include write_file | SERVER_CATALOG_MISMATCH | Inspect server generation and catalog hash |

## What to compare between chats

Run the prompt in **one affected existing chat and one fresh chat**, ideally within five minutes, on the same account and model mode. Record: chat label, observed time, model/mode, whether DeskSom was selected, bootId, catalogSha256, `desksom_status` results, exact tool names exposed, write probe outcome and exact errors.

Matching bootId and hash but different accessible tool sets is strong evidence of client-side inconsistency. It does **not** by itself reveal whether tool omission was platform gating, selective discovery, or model failure to call an available tool.
## Local offline server comparison

The installed release runtime includes isolated catalog tests. After the approved installer prepares a separate runtime and generates its engine overlay, developers can run the catalog and discovery integration tests from that prepared runtime using Node.js. They use a synthetic bearer and an ephemeral local broker, never the production token or port.

Do not copy a contributor's machine-specific workspace path into another owner's installation instructions. The public source is portable, and each owner chooses their own install location.

If a ChatGPT app still exposes an older action snapshot after a server catalog change, eligible workspace owners or admins can refresh the tool list in app settings. A new chat alone may not refresh a published app's frozen metadata, and this control is not available identically on every plan.

Reference: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt

## Security boundary

A status capability listing is *advertisement*, never proof of authorization. Do not expose bearer tokens, bypass ChatGPT denials via terminal commands, or automatically retry an ambiguous write. Maintain the explicit trusted-local authority boundary.
