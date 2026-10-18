# DeskSom v0.2.0-rc.12 | Windows preview release

DeskSom gives a private Windows-to-ChatGPT connection using an individual OpenAI Secure MCP Tunnel. This is a **pre-release for owner and friend acceptance**, not a signed production installer.

## Downloads

- **DeskSom-Setup-v0.2.0-rc.12.exe**: tiny Windows graphical setup launcher. The exact portable source archive is embedded and verified at runtime. It saves approved source to a stable per-user folder under `%LOCALAPPDATA%\DeskSom\SourcePackages`, then starts the usual three-page DeskSom setup wizard. It runs under the current Windows user, does not require administrator access, and does not overwrite an unrelated installation.
- **DeskSom-v0.2.0-rc.12-portable.zip**: exact source-qualified portable distribution. Extract into a persistent folder, then double-click `Start-DeskSom.cmd`. Do not install from a disposable Temp extraction.
- **DeskSom-v0.2.0-rc.12-DOWNLOADS-SHA256.txt**: integrity checksums for both downloads.

## Setup prerequisites

Windows x64, PowerShell 7.4+, Node.js 22+, a private OpenAI Platform tunnel and a ChatGPT account/workspace with custom MCP support. The wizard can guide you through official WinGet prerequisites with confirmation. Connection setup retains the owner's approval for account permissions and the warning about full Windows-user terminal authority.

### New in rc.12

The final setup stage now provides a six-step guide for creating the custom MCP plugin in ChatGPT, with owner-controlled Open Plugins, Copy tunnel ID and Copy verification message actions. The guide can be reopened from the installer or the DeskSom Control Panel. The owner must still choose the right private tunnel and approve the ChatGPT plugin. The software does not see ChatGPT's UI or read/copy the API key.

## Qualification

Exact source commit `ad3a67e493ebd4f832a221654329e327113458ea`; source fingerprint `830d86bec0eba52e738f94369e7f548b990bd4723b528499834b874331e7bc52`. The source and independently extracted archive passed 52/52 Node/MCP regression tests, nine native Windows groups and 26/26 engine acceptance checks. The executable bootstrap separately passed embedded ZIP/script hash verification and verification-only execution; no new instance was installed during that test.

**Important limits:** The executable is **unsigned**, so Windows SmartScreen may display a warning. This newly packaged executable has **not yet undergone a clean friend-owned machine installation**. The predecessor rc.11 did pass real owner GUI installation, private ChatGPT connection and a disposable file-write/edit/cleanup test. Do not claim that rc.11 acceptance automatically qualifies rc.12's new EXE packaging. No existing DeskSom service, task or credentials were changed by package verification.

The portable ZIP and EXE contain no user credentials, private install receipts or cached dependency trees. Source distribution is not a digitally signed installer.
