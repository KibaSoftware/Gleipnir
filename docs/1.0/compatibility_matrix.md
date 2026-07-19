# Compatibility Matrix

| Surface                      | 0.8.x input                                                                | 0.9.x input                     | 1.0 output                                                | Compatibility decision                             |
| ---------------------------- | -------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| Canonical task               | Recover exact session task where present; brief-only provenance incomplete | Read canonical task directly    | Preserve legacy authority plus run evidence reference     | No silent provenance upgrade                       |
| Session/baseline/budget      | Existing fallback readers                                                  | Existing readers                | New run metadata/events plus legacy session compatibility | Source remains unchanged                           |
| Plan validation              | Read latest/accepted legacy fields                                         | Same                            | Record attempts as policy inferences/events               | Advisory by default unless broad/sensitive         |
| Status prose                 | Read for legacy report compatibility                                       | Same                            | Agent-claim evidence only                                 | Never verified fact                                |
| Report schema 1.0–1.3        | Read with warnings/fallbacks                                               | Read 1.3                        | Final evidence bundle 1.0 plus optional legacy report     | Composite scores hidden by default                 |
| Check cache                  | Existing fingerprint rules                                                 | Existing rules                  | May remain legacy optimization cache                      | Not evidence authority                             |
| Compression store            | Not present                                                                | Preserve/read 0.9 objects/index | Continue exact retrieval; mark experimental               | Never task/review authority                        |
| Config `advisory`            | Accepted                                                                   | Accepted                        | Maps to `passive` behavior                                | Compatibility alias                                |
| Config `strict`/`enterprise` | Accepted but inert                                                         | Accepted but inert              | Accepted as reserved aliases with warning                 | No implied enforcement expansion                   |
| CLI `preflight/start`        | Preserved                                                                  | Preserved                       | Creates/continues 1.0 run and legacy artifacts            | Additive behavior                                  |
| CLI `status/check/report`    | Preserved                                                                  | Preserved                       | Compatibility commands                                    | `finalize` is preferred single bundle command      |
| CLI `run`                    | Not present before 0.9                                                     | Compression wrapper             | Adds attestation without breaking output/exit behavior    | Exact argv and streams retained                    |
| Adapters package             | Placeholder                                                                | Placeholder                     | Explicitly documented compatibility placeholder           | No capability claim                                |
| GitHub Action package        | Placeholder                                                                | Placeholder                     | Explicitly documented compatibility placeholder           | Use CLI `check --ci` until real integration exists |

## Versioning

Package version becomes `1.0.0`. New evidence/event/final-bundle schemas are independently versioned `1.0.0`. Legacy report schema remains readable and may be emitted only by the compatibility `report` command.
