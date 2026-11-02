# Requirements checklist

Status key: **Done** = implemented and exercised on a real MySQL 8 during development. **Done (Mongo untested)** = implemented and type-checked, but not run against a live MongoDB on the machine used for testing (see [testing-core.md](testing-core.md)).

| # | Requirement | Where | Status |
|---|---|---|---|
| 1 | ER diagram | [project-report.md](project-report.md) section 5.1 (Mermaid `erDiagram`, all 11 tables) | Done |
| 2 | Relational schema | [project-report.md](project-report.md) section 5.2 | Done |
| 3 | DDL: CREATE | `db/sql/00_core.sql`, `01_evidence.sql`, `02_links.sql`, `10_core_advanced.sql` | Done |
| 3 | DDL: ALTER, DROP | `db/sql/99_alter_drop_demo.sql` (ALTER add/rename/modify column, add/drop constraint, rename/drop index; DROP VIEW, TABLE, TEMPORARY TABLE) | Done |
| 4 | Primary and foreign keys | every table file; composite PKs in `evidence_investigations`, `investigation_assets`; FK RESTRICT on custody, CASCADE on junctions | Done |
| 5 | CHECK / NOT NULL / UNIQUE | e.g. `chk_ev_hash`, `uq_evidence_hash`, `chk_users_hash`, `chk_inv_closed`, `uq_asset`; listed in [core-module.md](core-module.md) section 1 | Done |
| 6 | Indexes | `idx_ev_*`, `idx_tr_evidence_time` (DESC), `idx_audit_target`, `idx_inv_status_sev`, `idx_event_inv_time`, FULLTEXT `ft_inv_title_code`, `ft_event_description` | Done |
| 7 | Views | `v_evidence_current`, `v_chain_of_custody` (`11_evidence_advanced.sql`); `v_case_overview`, `v_investigator_workload` (`10_core_advanced.sql`); summary table `monthly_case_stats` | Done |
| 8 | DML: INSERT | seed files `90_`, `91_`, `92_`; all POST routes | Done |
| 8 | DML: UPDATE / DELETE | PATCH routes (`app/api/evidence/[id]/status`, `investigations/[id]`, `users/[id]`), DELETE routes (unlink evidence/assets, delete note), `99_alter_drop_demo.sql` | Done (note delete: Mongo untested) |
| 9 | SELECT with JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries | `db/queries/evidence_queries.sql` (8), `db/queries/core_queries.sql` (8): includes correlated subquery, `NOT EXISTS`, CTE, window functions `LAG`/`SUM OVER` | Done |
| 10 | At least four advanced features | see the next table | Done |
| 11 | NoSQL with justification and aggregation | `db/mongo/evidence_artifacts.*`, `db/mongo/case_notes.*`; [JUSTIFICATION.md](../db/mongo/JUSTIFICATION.md), [mongo-case-notes.md](mongo-case-notes.md); 7 aggregation pipelines | Done (Mongo untested) |
| 12 | Next.js UI: forms, tables, search, filters, dashboards | `/login`, `/dashboard`, `/investigations` (+ `/new`, `/[id]`), `/assets` (+ `/[id]`), `/admin/users`, `/evidence` (+ `/new`, `/[id]`, `/verify`, `/stats`), `/audit` | Done |
| 13 | API layer | `app/api/**` (23 route files), responses `{ data }` / `{ error }` | Done |
| 14 | Credentials from environment, none hard-coded | `.env.example`, `lib/db.ts`, `lib/mongo.ts`, `lib/session-token.ts` (`JWT_SECRET`), `docker-compose.yml` | Done |
| 15 | Authentication with 2+ roles | ADMIN / INVESTIGATOR / ANALYST: `lib/auth.ts`, `middleware.ts`, `requireRole` in every route | Done |
| 16 | DB-level input validation | CHECK constraints, triggers (`trg_evidence_bi_date`, `trg_evidence_bu_hash`, `trg_audit_*`), procedures with `SIGNAL`; tested in `db/tests/*.sql` | Done |
| 17 | No plain-text passwords | bcrypt (`app/api/auth/login`, `app/api/users`); `chk_users_hash` rejects non-bcrypt values; seed uses hashes from `scripts/hash-password.ts` | Done |
| 18 | Goes beyond basic CRUD | custody procedure with row lock, tamper and audit triggers, full-text search, summary table, browser-side hashing, per-type artifact forms | Done |
| 19 | Git | feature branches `feat/evidence`, `feat/core`; small conventional commits | Done |
| 20 | Documentation | `README.md`, `docs/` (report, module docs, tests, demo script, screenshot list), `db/mongo/JUSTIFICATION.md` | Done |
| 21 | Testing | `db/tests/evidence_tests.sql`, `db/tests/core_tests.sql`, [testing-core.md](testing-core.md) (23 cases; 3 not run, need MongoDB) | Done (Mongo untested) |

## Advanced features (need 4; the project has 7)
| Feature | Where |
|---|---|
| Transactions | `withTransaction` in `lib/db.ts` used by every multi-row write; own transactions inside `transfer_custody`, `close_investigation`, `refresh_monthly_case_stats`; row locks with `SELECT ... FOR UPDATE` |
| Views | the four views above |
| Stored procedures and functions | `transfer_custody`, `get_case_summary` (4 result sets), `close_investigation`, `refresh_monthly_case_stats`, `case_duration_days` |
| Triggers | 9 evidence/audit triggers (`11_evidence_advanced.sql`), `trg_inv_au_status`, `trg_users_bi_email`, `trg_users_bu_email` |
| Indexing | composite, DESC, UNIQUE, FULLTEXT, Mongo multikey and text indexes |
| Full-text search | `MATCH ... AGAINST` on `/investigations` with relevance score and highlighting |
| NoSQL aggregation | `$unwind`/`$group`/`$sort` pipelines in `db/mongo/*.pipelines.ts`, shown on `/evidence/stats` and `/dashboard` |
