# Implementation Brief

The implementation brief is a derived navigation aid. Agents should read
`.gleip/canonical-task.json` first because it is the authoritative task contract.

Gleip generates the brief when the agent runs `npx --no-install gleip preflight
"<task>"`, using the canonical task, task classification, local repo context, the
requirement ledger, and the preliminary scope budget. It is intentionally concise:
it highlights the task, risk, likely files, verification expectations, protected
checks, expected scope, approval needs, and pause-and-clarify conditions without
dumping raw JSON.

The brief is explicitly marked as derived and non-authoritative. It includes
machine-readable metadata that references the canonical task ID, active revision,
content hash, and requirement coverage. If the brief omits or conflicts with a
canonical requirement, the canonical task wins.

Expected scope is advisory, not exclusive permission. Agents should follow
`.gleip/canonical-task.json`, use `.gleip/brief.md` as an index, explain material
expansion where needed, then run the narrowest existing validation while iterating,
`npx --no-install gleip check --incremental`, `npx --no-install gleip status
--compact`, and `npx --no-install gleip report` before the final response. Run
complete required validation once for the final repository state and rerun it only
after changes that invalidate it.

For long tasks, prefer `preflight --file task.md` so the exact received content is
preserved in the canonical task artifact without relying on shell quoting limits.
