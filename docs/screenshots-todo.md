# Screenshots still to take

These need a running app and databases, so they have to be taken by the team. Save them in a `docs/screenshots/` folder with the suggested names.

## Setup and schema
| File | Show |
|---|---|
| `01-db-reset.png` | Terminal output of `npm run db:reset` listing every SQL file then `done` |
| `02-show-tables.png` | `SHOW TABLES;` and `SHOW TRIGGERS;` |
| `03-procedures.png` | `SHOW PROCEDURE STATUS WHERE Db='shadowtrace';` and `SHOW FUNCTION STATUS ...` |
| `04-indexes.png` | `SHOW INDEX FROM evidence;`, `SHOW INDEX FROM investigations;` and `db.evidence_artifacts.getIndexes()` / `db.case_notes.getIndexes()` in mongosh |
| `05-er-diagram.png` | The Mermaid ER diagram from `docs/project-report.md` rendered |

## Database tests (run `npm run db:reset` first)
| File | Show |
|---|---|
| `10-evidence-tests.png` | Output of `db/tests/evidence_tests.sql` (expected failures) |
| `11-core-tests.png` | Output of `db/tests/core_tests.sql` (expected failures, then the successful statements) |
| `12-lock-demo.png` | The two-terminal lock demo from `evidence_tests.sql` (Session 2 waiting, then failing) |
| `13-alter-drop.png` | Output of `db/sql/99_alter_drop_demo.sql` |
| `14-queries.png` | Results of a few queries from `evidence_queries.sql` and `core_queries.sql` |

## MongoDB
| File | Show |
|---|---|
| `20-mongo-setup-seed.png` | `npm run mongo:setup` and `npm run mongo:seed`, including the three "rejected as expected" lines for each collection |
| `21-mongo-pipelines.png` | `npm run mongo:pipelines` tables |

## Application: authentication and roles
| File | Show |
|---|---|
| `30-login.png` | Login page; also a failed login message |
| `31-rate-limit.png` | The 429 "Too many failed attempts" message |
| `32-nav-admin.png`, `33-nav-investigator.png`, `34-nav-analyst.png` | The navigation bar for each role |
| `35-forbidden.png` | An analyst opening `/admin/users` (administrators only) and an API 403 response |
| `36-admin-users.png` | `/admin/users` with a user created and the password-policy hint |

## Application: investigation module
| File | Show |
|---|---|
| `40-dashboard.png` | KPIs, charts and workload table |
| `41-investigations-search.png` | List with a full-text search and highlighted words |
| `42-case-detail.png` | Case page: overview, timeline, linked evidence, assets, notes |
| `43-case-close.png` | A non-lead trying to close a case (error) and the lead succeeding |
| `44-assets-shared.png` | `/assets?shared=true` and an asset detail page listing its cases |
| `45-notes-edit-history.png` | A note with "edited 1x (show history)" expanded |

## Application: evidence module
| File | Show |
|---|---|
| `50-evidence-list.png` | List with filters, sorting and status badges |
| `51-new-evidence-hash.png` | New evidence form with the computed SHA-256 and the duplicate-hash error |
| `52-evidence-detail.png` | Detail page with custody timeline and the Transfer dialog open |
| `53-artifacts-mobile.png`, `54-artifacts-disk.png` | Artifacts tab for two different evidence types |
| `55-verify-match.png`, `56-verify-mismatch.png` | Hash verification for the original and an edited file |
| `57-audit-log.png` | `/audit` as admin with a filter applied |
| `58-evidence-stats.png` | `/evidence/stats` charts and tables |

## Git
| File | Show |
|---|---|
| `60-git-log.png` | `git log --oneline --graph` showing both feature branches merged |
| `61-github-prs.png` | The GitHub repository page with commits and branches |
