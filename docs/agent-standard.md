# Gleip Agent Standard

Generated Gleip agent instruction files include this working standard so coding agents have a consistent local workflow regardless of target file.

## Think before coding

Agents must not assume, hide confusion, or silently choose between ambiguous interpretations. Before editing, they state assumptions, ask when scope is unclear, present competing interpretations, and push back on overcomplicated or risky approaches.

## Simplicity first

Agents implement the minimum code that solves the requested problem. They avoid speculative features, single-use abstractions, unnecessary configurability, and error handling for impossible scenarios.

## Surgical changes

Agents touch only what the task requires. They preserve nearby style, avoid unrelated refactors and formatting churn, and remove only code made obsolete by their own changes.

## Goal-driven execution

Agents turn the task into verifiable goals before implementing. Bug fixes should reproduce the issue with a focused test when practical, broad fixes should define concrete success criteria, and refactors should verify behavior before and after the change.

For multi-step tasks, generated instructions ask agents to state a brief plan with a verification check for each step.
