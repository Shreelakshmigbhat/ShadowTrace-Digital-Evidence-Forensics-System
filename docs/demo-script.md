# Demo script (10 minutes, two presenters)

**Before you start:** `npm run db:reset`, `npm run mongo:setup`, `npm run mongo:seed`, `npm run dev`. Open three browser profiles (or private windows) logged in as `admin@shadowtrace.dev`, `investigator@shadowtrace.dev` and `analyst@shadowtrace.dev` (password `Password@123`). Have a MySQL client open on the `shadowtrace` database and a terminal for the Mongo scripts. Keep a small text file ready to use as "evidence".

| Time | Presenter | Screen | What to do and say |
|---|---|---|---|
| 0:00-0:45 | Both | Slide or README | Problem: evidence is only useful if you can prove what it is, who held it, and who touched the records. Two databases: MySQL for integrity-critical data, MongoDB for variable-shaped data |
| 0:45-2:00 | **B** | `/login`, `/dashboard` | Log in as the investigator. Point out: hashed passwords, httpOnly cookie, role shown in the nav. Dashboard: KPIs and charts come from views, the `monthly_case_stats` summary table (MySQL's materialized-view substitute) and MongoDB aggregations |
| 2:00-3:30 | **B** | `/investigations` | Full-text search "ransomware", then "wallet" (matches a timeline entry, not only the title). Filters and sorting. Open CASE-2025-002: stored procedure `get_case_summary` returns four result sets, timeline, linked evidence, assets, notes (Mongo) |
| 3:30-4:30 | **B** | Case page, then `/assets` | Link an asset, show the timeline entry appear. `/assets?shared=true`: assets in 2+ cases connect investigations (GROUP BY / HAVING). Try closing a case as a non-lead (window as analyst or another investigator): the database procedure refuses |
| 4:30-5:15 | **B** | `/admin/users` (admin window) | Create a user: password policy, bcrypt. Deactivate the analyst: switch to the analyst window and refresh, access is gone immediately. Role-based nav in the analyst window |
| 5:15-6:30 | **A** | `/evidence/new` | Choose a file: the SHA-256 is computed in the browser and only the hash is sent. Register it; try the same file again, rejected by UNIQUE. Show the hash CHECK in the SQL client with a malformed hash |
| 6:30-8:00 | **A** | Evidence detail | Chain-of-custody timeline (view with `ROW_NUMBER`). Transfer custody: dialog calls `transfer_custody`. Then the two-session demo from `db/tests/evidence_tests.sql`: Session 2 waits on the row lock, then fails with "not the current custodian". Show the tamper trigger: `UPDATE evidence SET file_hash ...` is refused |
| 8:00-8:45 | **A** | Artifacts tab, `/evidence/verify` | Artifact form changes with evidence type (flexible schema, Mongo `$jsonSchema`). Verify: upload the original file (match) then an edited copy (mismatch) |
| 8:45-9:30 | **A** | `/audit` (admin), SQL client | Audit rows written by triggers with the acting user; try `DELETE FROM audit_logs` and show the append-only error. `/evidence/stats` charts: GROUP BY/HAVING and window function results |
| 9:30-10:00 | Both | Report | Summarise the seven advanced features (transactions, views, procedures/functions, triggers, indexes, full-text search, NoSQL aggregation) and the limitations: in-memory rate limiter, analysts see all cases |

## Tips
- Keep `docs/screenshots-todo.md` open: if anything fails live, show the screenshot.
- If MongoDB is down, say so: the pages degrade (notes and artifact charts show a notice) while everything from MySQL keeps working.
- Likely viva questions: why `ON DELETE RESTRICT` on custody; why a procedure is not called inside `withTransaction`; why the CHECK on the hash uses `REGEXP_LIKE(..., 'c')`; why notes are in MongoDB and custody in MySQL; how a deactivated user is blocked before the token expires.
