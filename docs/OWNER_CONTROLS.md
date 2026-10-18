# DeskSom owner controls

DeskSom 0.2.0-rc.4 adds supported, owner-approved management of file-tool folders, lightweight statistics, a Windows tray and control panel, and improved task restart settings. The original installation plan remains immutable.

## Everyday use

Windows Start contains **DeskSom-<instance> Control Panel**. The tray icon appears after Windows sign-in, or can be launched immediately from the guided installer's TRAY prompt. Double-click to open the Control Panel; right-click for Overview, Folders, Statistics, Settings, and Exit Tray. Closing the tray never stops the DeskSom service.

The tray uses bundled Windows PowerShell and WinForms. Once per minute it checks the owned service task and loopback readiness, not a cloud endpoint. These checks show local responsiveness, not ChatGPT's tool exposure or authorization. The Control Panel obtains authenticated, source-bound details on demand.

## Finishing the ChatGPT connection

The Overview tab now has **Finish ChatGPT setup**. It opens the owner-only connection flow if not configured, or a read-only guided ChatGPT Plugins checklist if the local tunnel association is already saved. The UI never creates or authorizes a plugin on the owner's behalf and never reads or copies API keys. The owner's browser review and a genuine ChatGPT tool call remain required.

## Adding or removing folders

In **Folders**, select Add Folder or Remove Selected. DeskSom prepares the full proposed list, checks the paths and shows an approval dialogue before restarting the owned local service and tunnel.

For an AI with already authorized local shell access, use the installed DeskSom.ps1 entry point:

    DeskSom.ps1 folders --action list --state "STATE_DIRECTORY" --json

Write a request JSON document containing these fields:

    {"addDirectories":["D:\\NewProject"],"removeDirectories":["C:\\OldProject"]}

Then:

    DeskSom.ps1 folders --action plan --state "STATE_DIRECTORY" --request "REQUEST.json" --out "PROPOSAL.json" --json

The proposal includes a complete before/after directory list and approvalSha256. After reviewing it and obtaining owner approval:

    DeskSom.ps1 folders --action apply --state "STATE_DIRECTORY" --plan "PROPOSAL.json" --approve "EXACT_SHA256" --confirm-restart --json

**When using ChatGPT through this very DeskSom instance, do not run the apply command inside a tool call that depends on the same MCP connection.** Applying the change restarts that server and can sever the call before the client receives its result. Use the local Control Panel, or run an independently launched owner-controlled PowerShell session; afterward reconnect and inspect the exact updated revision. Never use a different tool or transport to evade a genuine client denial.

The private, revisioned folder policy is separate from the original installation plan and installation source hash. The update rejects symlink/junction traversal, missing directories, Windows/program folders, whole-drive roots, runtime/credential overlap, conflicting operations, stale proposals, foreign scheduled tasks and active tool calls. Keep 1 to 20 allowed directories.

A change writes an intent receipt before any service stop or configuration mutation. Startup is blocked while the intent is unfinished. If interrupted or uncertain, do not blindly retry or delete the receipt. Inspect the state/config and reconcile deliberately. The change does not delete folders or project files. An installation deliberately stopped stays stopped after the folder update.

**Security caveat:** These folders restrict Desktop Commander's file tools. Terminal commands retain the entire Windows-user account's permissions. This is not a sandbox.

## Statistics

The DeskSom status response and Control Panel report in-memory statistics scoped to the current broker boot: uptime, attempted and completed/successful calls, failures, uncertainty, active calls, average call duration, and up to 12 frequently used tool names. Counters are updated alongside the existing broker dispatch path and reset on restart. No metrics database, file-content collection, command capture, or background statistics daemon is introduced.

## Sign-in startup and crash recovery

Owned, non-elevated Windows Task Scheduler entries start the local service and configured private tunnel **at user sign-in** and request up to **20 restarts, one minute apart**, after an unsuccessful process exit. StartWhenAvailable and IgnoreNew instance settings remain enabled. The tray has a per-user Startup shortcut; the Control Panel has a Start Menu shortcut. Altered or foreign shortcuts are never silently overwritten or removed.

This does not run DeskSom before Windows login, while the laptop is asleep, or while it is powered off. Pre-login operation would require a different, privileged service/security design. Crash restart does not imply exactly-once application commands: DeskSom never blindly replays an ambiguous tool call. An explicit owner stop stays stopped across sign-ins.

## Investigating problems

The Settings tab offers deliberate Start, Stop, and Open Private State commands. If a folder change becomes ROOTS_CHANGE_UNCERTAIN, startup refuses pending changes. Preserve the intent and inspect the exact installed state, private settings, engine configuration, current tasks and local processes. Do not bypass an active client denial through a shell tool or alternate transport.

Installer, verification and tunnel authority remain in the canonical AI-first v0.2 workflow. The tray is optional UI, not a second backend.
