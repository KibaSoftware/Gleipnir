# Gleip Agent Standard Examples

These examples are reference material for Gleip's generated working standard. Generated `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` files include the standard itself, not this full example set.

## Hidden assumptions

Anti-pattern: A request says "add export support" and the agent implements CSV, JSON, filters, and scheduling without asking which export matters.

Better: Name the ambiguity first: "Do you want CSV only, or should this include JSON and scheduling?"

## Multiple interpretations

Anti-pattern: A request says "make search faster" and the agent optimizes render performance when the user meant database latency.

Better: State the possible dimensions: query latency, UI responsiveness, bundle size, or perceived loading time. Ask which one is the target before broad changes.

## Over-abstraction

Anti-pattern: A one-off conditional becomes a strategy registry, factory, plugin interface, and config schema.

Better: Use the direct conditional until there is real repeated behavior that benefits from an abstraction.

## Speculative features

Anti-pattern: While adding a small validation rule, the agent adds caching, notifications, configurable thresholds, and extra validation modes.

Better: Add the requested rule and tests only. Mention future options separately if they are useful.

## Drive-by refactoring

Anti-pattern: While fixing one bug, the agent rewrites adjacent validation, renames helpers, and changes unrelated control flow.

Better: Reproduce the bug, make the narrow behavior change, and remove only code made obsolete by that fix.

## Style drift

Anti-pattern: A patch changes quote style, typing style, docstrings, imports, or formatting in untouched areas.

Better: Match the local style in the edited lines and leave unrelated style preferences alone.

## Vague execution plans

Anti-pattern: "Fix the data flow and clean up the component."

Better: Define concrete success criteria: which inputs fail today, which behavior should change, which tests or manual checks prove it.

## Test-first bug reproduction

Anti-pattern: Change behavior first, then add a broad snapshot or only manual verification.

Better: When practical, add a focused failing test that reproduces the bug, then change the minimum code needed to pass it.
