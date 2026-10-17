# Contributing to DeskSom

DeskSom is a small Windows MCP bridge. Bug reports and focused pull requests are welcome.

Before submitting a change, run the security tests, modern/legacy MCP integration tests, and 26-check acceptance suite through the documented prepare-only installer. Never test by modifying another user's live instance. Prefer isolated, disposable paths and synthetic credentials.

Preserve the upstream Desktop Commander license and pinned versions. If you change the exposed tool catalog, modern MCP protocol handling, local authorization, task launchers, or credential flow, include focused negative tests and explain what was verified.

**Never include real API keys, DPAPI files, tunnel IDs, private URLs, HAR archives, screenshots containing tokens, personal machine paths, or raw file contents in commits or issues.** Test new installers as an ordinary Windows user without administrator rights.

This is a community project, not an official Desktop Commander or OpenAI release.
