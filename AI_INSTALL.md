# AI-directed installation

Use this runbook when the owner has authorized terminal access to their Windows computer. Without that access, direct them to extract a trusted release and double-click **Start-DeskSom.cmd**. Do not pretend browser chat alone can install local software.

## 1. Inspect before changing anything

Confirm Windows x64, the intended machine, a non-elevated user, PowerShell 7.4+, Node.js 22+, and npm. Use a prepared release with release-manifest.json; do not reseal a downloaded release to suppress a checksum error. Inspect existing DeskSom installations, tasks, paths and the requested port. Do not stop or replace another instance. Preflight independently repeats these checks.

Ask which existing work folder the owner wants available. Default runtime/state locations are per-user under LocalAppData. They must remain outside work-folder roots. Explain the full-user terminal capability. Ask the owner to confirm access to custom MCP connections and Secure MCP Tunnels before assuming the remote portion is available or free.

## 2. Create and review a plan

Write a small JSON request to an owner-approved local location outside the release. Only instance, installRoot, stateRoot, allowedDirectories and port are accepted. allowedDirectories is required; the other fields may be omitted to use reviewed per-user defaults. See examples/install-request.json; substitute real existing folders rather than using it unchanged.

    pwsh.exe -NoProfile -File "<release>\scripts\Preflight.ps1" -SpecFile "<request.json>" -OutFile "<plan.json>" -Json

Read the result's status, checks and plan. Present the selected host, folders, task names, port, pinned downloads, shell permissions and planSha256 to the owner. Creating a plan does not install the service. Plan output is create-only: choose a new filename instead of overwriting an existing plan.

## 3. Install exactly what was approved

    pwsh.exe -NoProfile -File "<release>\Install-DeskSom.ps1" -PlanFile "<plan.json>" -ApprovePlanSha256 "<approved digest>" -AcceptShellAccess -Json

Use `-PrepareOnly` for a rehearsal that downloads and qualifies an isolated runtime without registering service tasks. The same approved install command without that switch subsequently starts its local service. A repeated valid install preserves the installation ID and key. On a failure, inspect the saved phase, pending step and native-active.json; a missing acknowledgment is not permission to repeat a subprocess.

The installer returns an installation ID and state root. Save those nonsecret references in the handoff. LOCAL_READY is not a working ChatGPT connection. The original release path is bound into the plan; after installation, management commands may also be run from the installed runtime.

## 4. Verify locally

    pwsh.exe -NoProfile -File "<release>\scripts\Verify.ps1" -StateRoot "<state>" -Deep -Exercise -Json

`-Deep` checks every sealed dependency. `-Exercise` is an explicit mutation: it writes a unique fixture in the first allowed folder, reads it via MCP, checks bytes independently and removes only that verified fixture. Without `-Exercise`, verification is read-only. An unresolved verification receipt blocks another disposable exercise until reconciled; retain the receipt and investigate, rather than deleting it.

## 5. Owner-only tunnel setup

The owner creates/selects a private OpenAI tunnel associated with the intended Platform organization and ChatGPT workspace. The administrator needs Tunnels Read + Manage; the runtime key and selecting operator need Read + Use. Account/workspace policies can still restrict use. Check the current [official guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels), reviewed October 17, 2026.

Ask the owner to run this in a local interactive terminal, not in a secret-capturing remote tool session:

    pwsh.exe -NoProfile -File "<release>\scripts\Configure-Tunnel.ps1" -StateRoot "<state>" -OpenSettings

Do not collect the API key yourself. There is intentionally no key parameter. The prompt saves a DPAPI-protected key and resumes a previously saved association without overwriting it. A partial secret/association mismatch is a stop-and-inspect condition. The script verifies the owned local service before permitting configuration.

## 6. The actual ChatGPT acceptance boundary

Keep the tunnel running. In ChatGPT, add a custom MCP connection using **Connection: Tunnel**, select the same private tunnel, and choose **No authentication** for this bridge's ChatGPT-facing OAuth setting. This does not turn off the locally authenticated bearer. Follow current account UI and permissions instead of assuming every account is entitled.

Invoke `desksom_status` through the newly connected DeskSom, not through another desktop operator or a direct local HTTP substitute. Match host, instance, version, installationId and sourceFingerprint to the approved installation. Obtain permission for a disposable create/read/delete test in an allowed folder and observe its cleanup. Record exactly which tool connection supplied the evidence. Only then report end-to-end setup complete; no local installer output proves it.

## 7. Diagnose, resume or stop

    pwsh.exe -NoProfile -File "<runtime>\DeskSom.ps1" repair --state "<state>" --json
    pwsh.exe -NoProfile -File "<runtime>\DeskSom.ps1" repair --state "<state>" --apply --operation restore-missing-tasks --json
    pwsh.exe -NoProfile -File "<runtime>\DeskSom.ps1" start --state "<state>" --enable --json
    pwsh.exe -NoProfile -File "<runtime>\DeskSom.ps1" stop --state "<state>" --confirm-stop --json

Apply only an operation the owner authorized after inspecting the diagnosis. Do not force-stop an unknown process, reset a credential, enlarge work roots, buy access, downgrade integrity rules, or silently fall back to a paid relay. The stop command can interrupt jobs and therefore requires explicit confirmation. For uncertainty or drift, use docs/TROUBLESHOOTING.md.

Before sharing a problem, run `export-diagnostics --state "<state>" --out "<new-file.json>" --json`. It exports a fixed-field summary, not raw logs. Review it before sending. Finish with the verified stage, remaining account actions, installation references, test evidence and any unresolved limitation; avoid burying a pending remote connection beneath a generic success label.
