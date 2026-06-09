# Implementation Brief

The implementation brief is the main artifact coding agents should read before changing code.

Gleip generates the brief when the agent runs `npx --no-install gleip preflight "<task>"`, using task classification, local repo context, and the preliminary scope budget. It is intentionally concise: it highlights the task, risk, likely files, tests, hard gates, allowed scope, approval needs, and stop conditions without dumping raw JSON.

Agents should follow `.gleip/brief.md`, keep changes inside the scope budget, and run `npx --no-install gleip status` before the final response.
