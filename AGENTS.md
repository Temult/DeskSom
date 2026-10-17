# DeskSom: instructions for installing and maintaining agents

The task is to make a private Windows MCP connection work for its owner, not to get an installer exit code of zero. Read **AI_INSTALL.md** before installation and **docs/RESULT_CONTRACT.md** before interpreting results.

## Authority and secrets

Use only a computer the owner authorized. Verify the actual host and normal Windows user. Do not infer authorization from a discovered connector. Explain that terminal tools have the full Windows user's permissions and that file-tool roots do not sandbox the terminal. Obtain approval of the exact installation plan and shell-access acknowledgment before installing.

Never ask for an API key in chat or pass one in a command argument, tool payload, environment dump, screenshot, transcript or Git commit. The owner enters the tunnel runtime key in the local masked prompt in scripts/Configure-Tunnel.ps1. Do not borrow another instance's tunnel or credentials. Do not purchase services or expand account permissions silently.

## Entry points

Humans: **Start-DeskSom.cmd**. Agents with terminal access: **scripts/Preflight.ps1**, **Install-DeskSom.ps1**, and the JSON CLI in **DeskSom.ps1** or **scripts/cli.mjs**. These are two front ends to the same installation core, not separate procedures. Prefer absolute paths and `pwsh.exe -NoProfile`; do not use Invoke-Expression or pipe unreviewed downloads into a shell.

Keep the release source folder at its approved path. Source, runtime and private state are separate directories. Work folders must not include runtime or private state. Choose a named instance and unused port when evaluating beside an existing installation. A detected 0.1.x installation is a migration boundary, not permission to overwrite it.

## Failure and continuation

Read-only failures may be retried after inspecting the error. After a write, timeout, lost acknowledgment or interrupted preparation, read current state and receipts before any retry. Do not delete native-active.json, ownership markers or pending receipts to force progress. Completed ordinary setup can resume using the same approved plan; unresolved subprocess outcomes require reconciliation. Never replay application work.

Repair is diagnostic by default. Only `restore-missing-tasks` and `start-stopped` can be explicitly applied. A task with changed identity is not ours to overwrite. A deliberate owner stop must remain stopped until explicitly restarted. Uninstall removes only stopped, verified owned tasks and retains runtime, credentials and work files.

## ChatGPT tool exposure diagnostics

If a conversation reports DeskSom is read-only, first call desksom_status and compare its advertisedToolCount, advertisedCapabilities, bootId and catalogSha256 with the tools actually visible in that conversation. Do not conclude Windows ACL denial from an omitted ChatGPT tool. Classify missing tools, client denials, host rejections, confirmed writes and ambiguous outcomes using docs/CHAT_DISCOVERY_DIAGNOSTIC.md. Do not bypass a genuine client denial through a different transport or process tool.

## Evidence and completion

Use exit codes and structured result fields, not printed success strings alone. `PREPARED`, `LOCAL_READY` and `TUNNEL_READY` are different checkpoints. Local commands deliberately report `setupComplete:false`. End-to-end acceptance requires an observed ChatGPT call to `desksom_status` matching this host, instance, version, installation ID and source fingerprint, followed by an owner-approved disposable file check.

Do not modify source manifests to hide drift. A checksum detects changed bytes; it is not a publisher signature. Only a maintainer preparing a new reviewed release may reseal source. Keep live installations unchanged during development, use isolated test instances, retain negative-test evidence, and read docs/RELEASE_CHECKLIST.md before publishing. Public diagnostic export uses a fixed field allowlist; raw logs remain private.
