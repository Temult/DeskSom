> This branch is the rc.15 development candidate, not a new downloadable installer release. Use qualified release artifacts for installation. The wizard's Node 22.12+ requirement covers ordinary tools; optional filename indexing needs Node 25+. Do not infer that an installed index is ready merely because the core service reconnects.

# Set up DeskSom without being a developer

## Before starting

Choose a Windows x64 computer you control and an ordinary Windows login. DeskSom is not currently qualified for ARM, Linux or macOS. You also need an OpenAI account/workspace allowed to create a private Secure MCP Tunnel and a custom MCP connection in ChatGPT. The installer cannot grant those account permissions or promise zero service charges.

Download and extract a prepared DeskSom release from the repository. Keep its source folder in place because the approved plan binds to it. Do not run the ZIP's contents without extraction, and do not run the setup as administrator.

## Double-click setup

Open **Start-DeskSom.cmd** to display the three-page graphical setup wizard with Back and Next navigation. It verifies the downloaded source and offers installation of missing PowerShell 7.4+ or Node.js 22.12+ through official WinGet package IDs after your approval. Windows may still present its own prompts. If prerequisite installation completes, close and reopen DeskSom Setup to refresh PATH.

Under **Choose a folder ChatGPT can access**, use **Browse** to select an existing project folder. You can add or remove folders afterward. Click **Install DeskSom**, review the selected folder and full Windows-user terminal access, then approve. DeskSom creates and checks the same exact source/host/user-bound plan as the advanced installer. No terminal commands or approval words are required. The installer runs tests before it starts the local service. Its user-scoped logon tasks require that Windows user to be signed in; this is not an unattended boot service while logged out. It may take several minutes and writes progress receipts; closing the window is not a rollback.

If setup is interrupted, open the same launcher again. It uses the existing plan and inspects progress. It does not regenerate keys or overwrite another installation. An uncertain subprocess or changed source stops for inspection; ask your AI to read the reported condition instead of deleting files until it runs.

## Connect your own account

After the local installation succeeds, choose **Connect ChatGPT**. A local window guides you to create/select your private tunnel, paste its ID, and enter a restricted runtime key in a masked field. You can skip this step and return later without uninstalling DeskSom. Do not paste a key into ChatGPT, an email or GitHub. The key is encrypted using Windows DPAPI for your login.

In ChatGPT, add a custom MCP connection, choose Tunnel, select this tunnel, and use No authentication for this bridge's ChatGPT-facing OAuth setting. DeskSom's local bearer remains enabled. The current [OpenAI guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) covers the account settings and permissions.

Ask ChatGPT to call **desksom_status** and confirm the intended computer and installation. Have it create, read back and delete one disposable file in your project folder. This is the final acceptance test. A local green status is not proof that ChatGPT is connected.

## Everyday controls

At sign-in, Windows starts the DeskSom service tasks and tray icon. Windows Start also contains the instance's DeskSom Control Panel. Use Folders to add/remove approved project directories; Statistics for per-boot counts; Settings for deliberate start/stop and opening private state. An installation can launch the tray immediately with the TRAY prompt.

These non-elevated tasks start when the user logs in, not before Windows sign-in, and request up to 20 one-minute retries after unsuccessful exit. A deliberate stop remains stopped. Terminal permissions remain broader than file-tool directories. See docs/OWNER_CONTROLS.md.

## Later maintenance

For ordinary maintenance, ask your AI to follow AI_INSTALL.md using the installed runtime or the original source. Status and repair diagnosis are read-only. Applying a repair, starting disabled tasks, stopping services or removing tasks requires explicit authorization. A deliberate stop stays stopped. Uninstall retains your work, keys and runtime so nothing valuable is silently deleted.

See [troubleshooting](docs/TROUBLESHOOTING.md) for exact next steps. Keep the connection private: terminal tools can access more than the selected file-tool folder, under your Windows account's permissions.
