## rc.14 optional-feature requirement

Core DeskSom retains Node.js 22+. Native filename indexing separately requires Node.js 25+ and is exercised on 25.2.1 in this candidate. A newer major is not automatically qualified. The installer test runner explicitly selects core versus index suites; it does not silently claim index coverage on Node 22. Project inspection also needs a trusted Git executable and still lacks a general installed-owner activation UI.

# Prerequisites and the first connection

This release targets **Windows x64**, PowerShell **7.4+**, Node.js **22+** with npm, and a normal, non-elevated interactive Windows user. These are the enforced baseline, not a claim that every supported version has been separately tested. Read the release qualification report for the actual tested environment.

## Owner bootstrap

An AI needs an existing authorized terminal/computer-control connection to execute commands. Before DeskSom exists, that connection must come from another trusted tool. Without it, the owner can extract a trusted release and double-click Start-DeskSom.cmd. Git is optional when using the prepared ZIP.

The launcher uses built-in Windows PowerShell to inspect source and prerequisites. It uses a process-local execution-policy setting for that explicitly launched setup; it does not change machine policy or override organizational Group Policy. Do not use it to evade an administrator's restriction. If policy blocks it, ask the administrator for an approved installation route.

After explicit owner approval, missing prerequisites can be installed through official WinGet package IDs:

    winget install --id Microsoft.PowerShell --exact --source winget
    winget install --id OpenJS.NodeJS.LTS --exact --source winget

The owner handles licensing, download, restart and UAC prompts. DeskSom does not silently agree to those prompts, install a new package manager, or elevate its own service. If WinGet is unavailable, use Microsoft's PowerShell instructions and Node.js's official download page. Close and reopen the launcher after prerequisite installation so its PATH reflects the installed applications.

Official references: https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows · https://nodejs.org/en/download · https://learn.microsoft.com/windows/package-manager/winget/

## Account and network prerequisites

The owner must be allowed to use a private Secure MCP Tunnel and custom MCP connections in the intended OpenAI Platform organization and ChatGPT workspace. Tunnel management and use are different permissions. Availability, UI labels, service limits and charges may change; verify them in the current official guide rather than assuming a plan entitlement from this repository.

https://developers.openai.com/api/docs/guides/secure-mcp-tunnels

The host needs outbound connectivity to the selected upstream package publishers during installation and to OpenAI's tunnel control plane during use. DeskSom does not open a public inbound listener, change a firewall rule or buy an account upgrade. Each friend/recipient uses their own tunnel and key, not the maintainer's connection.
