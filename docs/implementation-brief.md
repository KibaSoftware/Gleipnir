# Implementation Brief

The implementation brief is the main artifact coding agents should read before changing code.

Gleip generates the brief when the agent runs `npx --no-install gleip preflight "<task>"`, using task classification, local repo context, and the preliminary scope budget. It is intentionally concise: it highlights the task, risk, likely files, verification expectations, protected checks, expected scope, approval needs, and pause-and-clarify conditions without dumping raw JSON.

Expected scope is advisory, not exclusive permission. Agents should follow
`.gleip/brief.md`, explain material expansion where needed, then run
the narrowest existing validation while iterating, `npx --no-install gleip check
--incremental`, `npx --no-install gleip status --compact`, and `npx --no-install
gleip report` before the final response. Run complete required validation once for
the final repository state and rerun it only after changes that invalidate it.
