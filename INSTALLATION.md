# Set up DeskSom without being a developer

## Before starting

Choose a Windows x64 computer you control and an ordinary Windows login. DeskSom is not currently qualified for ARM, Linux or macOS. You also need an OpenAI account/workspace allowed to create a private Secure MCP Tunnel and a custom MCP connection in ChatGPT. The installer cannot grant those account permissions or promise zero service charges.

Download and extract a prepared DeskSom release from the repository. Keep its source folder in place because the approved plan binds to it. Do not run the ZIP's contents without extraction, and do not run the setup as administrator.

## Double-click setup

Open **Start-DeskSom.cmd**. It first asks you to trust the chosen source and verifies its file hashes. Missing PowerShell 7.4+ or Node.js 22+ can be installed using the official WinGet package IDs after you approve. Windows may show its own permission or license prompts; you must decide those yourself. If prerequisite installation completes, close and reopen the launcher to refresh PATH.

Paste the full path of an existing project folder. Setup then shows where the service and private state will be stored, the allowed folder, and the local port. Type INSTALL only after reviewing that plan and acknowledging terminal access. The installer runs tests before it starts the local service. Its user-scoped logon tasks require that Windows user to be signed in; this is not an unattended boot service while logged out. It may take several minutes and writes progress receipts; closing the window is not a rollback.

If setup is interrupted, open the same launcher again. It uses the existing plan and inspects progress. It does not regenerate keys or overwrite another installation. An uncertain subprocess or changed source stops for inspection; ask your AI to read the reported condition instead of deleting files until it runs.

## Connect your own account

After LOCAL_READY, choose CONNECT to continue. Create or select your own private tunnel, confirm the intended organization and ChatGPT workspace, and enter the API key only in the masked local prompt. Do not paste a key into ChatGPT, an email or GitHub. The key is encrypted using Windows DPAPI for your login.

In ChatGPT, add a custom MCP connection, choose Tunnel, select this tunnel, and use No authentication for this bridge's ChatGPT-facing OAuth setting. DeskSom's local bearer remains enabled. The current [OpenAI guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) covers the account settings and permissions.

Ask ChatGPT to call **desksom_status** and confirm the intended computer and installation. Have it create, read back and delete one disposable file in your project folder. This is the final acceptance test. A local green status is not proof that ChatGPT is connected.

## Everyday controls

At sign-in, Windows starts the DeskSom service tasks and tray icon. Windows Start also contains the instance's DeskSom Control Panel. Use Folders to add/remove approved project directories; Statistics for per-boot counts; Settings for deliberate start/stop and opening private state. An installation can launch the tray immediately with the TRAY prompt.

These non-elevated tasks start when the user logs in, not before Windows sign-in, and request up to 20 one-minute retries after unsuccessful exit. A deliberate stop remains stopped. Terminal permissions remain broader than file-tool directories. See docs/OWNER_CONTROLS.md.

## Later maintenance

For ordinary maintenance, ask your AI to follow AI_INSTALL.md using the installed runtime or the original source. Status and repair diagnosis are read-only. Applying a repair, starting disabled tasks, stopping services or removing tasks requires explicit authorization. A deliberate stop stays stopped. Uninstall retains your work, keys and runtime so nothing valuable is silently deleted.

See [troubleshooting](docs/TROUBLESHOOTING.md) for exact next steps. Keep the connection private: terminal tools can access more than the selected file-tool folder, under your Windows account's permissions.
