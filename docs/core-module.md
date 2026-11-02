# Core module (Member B): users, investigations, assets, dashboard, security

Scope: tables `roles`, `users`, `investigations`, `investigation_events`, `assets`, `evidence_investigations`, `investigation_assets`, and the summary table `monthly_case_stats`; the views, procedures, function, trigger and event around them; the MongoDB collection `case_notes` (see [mongo-case-notes.md](mongo-case-notes.md)); authentication and RBAC; and the investigation, asset, user and dashboard APIs and pages.

Source files: `db/sql/00_core.sql`, `02_links.sql`, `10_core_advanced.sql`, `90_seed_core.sql`, `92_seed_links.sql`; `db/queries/core_queries.sql`; `db/tests/core_tests.sql`; `db/mongo/case_notes.*`; `lib/auth.ts`, `lib/session-token.ts`, `lib/session-cookie.ts`, `lib/rate-limit.ts`, `middleware.ts`; `lib/core-service.ts`, `lib/case-access.ts`; `app/api/{auth,users,investigations,assets,dashboard}/`; `app/(core)/`.

---

## 1. Data dictionary

All tables are InnoDB, `utf8mb4`.

### 1.1 `roles`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| role_name | VARCHAR(30) | NOT NULL, UNIQUE, CHECK IN ('ADMIN','INVESTIGATOR','ANALYST') | The closed set of roles. A typo cannot create a fourth role |
| description | VARCHAR(255) | NULL | |

### 1.2 `users`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| full_name | VARCHAR(100) | NOT NULL, CHECK (trimmed length >= 2) | |
| email | VARCHAR(150) | NOT NULL, UNIQUE, CHECK (email regex) | Stored lowercase (trigger) |
| password_hash | CHAR(60) | NOT NULL, CHECK `REGEXP '^\$2[aby]\$'` | A bcrypt hash is always exactly 60 characters and starts with `$2a$`, `$2b$` or `$2y$`. The CHECK rejects a plain-text password stored by mistake |
| is_active | BOOLEAN | NOT NULL, DEFAULT TRUE | Deactivated users cannot log in and lose access on their next request |
| created_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | |
| role_id | INT | NOT NULL, FK -> roles(id) ON DELETE RESTRICT, index `idx_users_role` | |

### 1.3 `investigations`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| title | VARCHAR(200) | NOT NULL, CHECK (trimmed length >= 3) | |
| case_code | VARCHAR(20) | NOT NULL, UNIQUE, CHECK `^CASE-[0-9]{4}-[0-9]{3}$` | e.g. CASE-2025-001 |
| severity | VARCHAR(10) | NOT NULL, DEFAULT 'MEDIUM', CHECK IN (LOW, MEDIUM, HIGH, CRITICAL) | |
| status | VARCHAR(10) | NOT NULL, DEFAULT 'OPEN', CHECK IN (OPEN, ACTIVE, ON_HOLD, CLOSED) | |
| opened_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | |
| closed_at | DATETIME | NULL | |
| lead_investigator_id | INT | NOT NULL, FK -> users(id) ON DELETE RESTRICT, index `idx_inv_lead` | |

Table CHECKs: `closed_at IS NULL OR closed_at >= opened_at` (cannot close before opening) and `status <> 'CLOSED' OR closed_at IS NOT NULL` (a CLOSED case always has a close date). Index `idx_inv_status_sev (status, severity)` serves the list filters and dashboard counts.

### 1.4 `investigation_events` (case timeline)
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| event_type | VARCHAR(20) | NOT NULL, CHECK IN (OPENED, STATUS_CHANGED, EVIDENCE_LINKED, EVIDENCE_UNLINKED, ASSET_LINKED, ASSET_UNLINKED, NOTE, CASE_CLOSED) | |
| event_time | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | |
| description | VARCHAR(500) | NOT NULL | Searched by a FULLTEXT index |
| investigation_id | INT | NOT NULL, FK -> investigations(id) **ON DELETE CASCADE** | |
| created_by | INT | NULL, FK -> users(id) ON DELETE RESTRICT | Actor (NULL = system). Added to the original draft so the timeline can show who did what |

Index `idx_event_inv_time (investigation_id, event_time)` returns one case's timeline in order.

### 1.5 `assets`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| asset_type | VARCHAR(10) | NOT NULL, CHECK IN (IP, DOMAIN, DEVICE, EMAIL, ACCOUNT, WALLET) | |
| identifier | VARCHAR(255) | NOT NULL, CHECK (trimmed length >= 2) | IP address, domain, serial, address... |
| description | VARCHAR(255) | NULL | |

`UNIQUE(asset_type, identifier)`: the same IP is one asset however many cases mention it. Extra index `idx_asset_identifier (identifier)` because the unique key starts with `asset_type` and cannot serve identifier-only searches.

### 1.6 `evidence_investigations` and `investigation_assets` (many-to-many)
| Table | Columns | Keys |
|---|---|---|
| evidence_investigations | evidence_id, investigation_id, linked_at | PK (evidence_id, investigation_id); FK -> evidence(id) CASCADE; FK -> investigations(id) CASCADE; index on investigation_id |
| investigation_assets | investigation_id, asset_id, linked_at | PK (investigation_id, asset_id); FK -> investigations(id) CASCADE; FK -> assets(id) CASCADE; index on asset_id |

The composite primary key stops the same link being stored twice. `ON DELETE CASCADE` sits on the junction side: removing a case, asset or evidence row also removes its links, never the other record.

### 1.7 `monthly_case_stats` (summary table)
`stat_month CHAR(7)` PK ('YYYY-MM', CHECK regex), `cases_opened`, `cases_closed`, `critical_opened` (INT >= 0), `avg_days_to_close DECIMAL(7,1) NULL`, `refreshed_at`. MySQL has no materialized views, so this plain table is rebuilt by `refresh_monthly_case_stats()` (on demand from the dashboard, and nightly by an EVENT). Reads are instant; the price is slightly stale data, shown on the dashboard as "last refreshed".

---

## 2. Views

| View | Purpose |
|---|---|
| `v_case_overview` | One row per case: lead name, evidence/asset/event counts, last event time, `duration_days`. Uses scalar subqueries rather than joins so the counts are not multiplied by each other's rows |
| `v_investigator_workload` | Per investigator: open, on-hold and closed cases, high-priority open cases, evidence in their open cases, evidence in their custody. `LEFT JOIN`s keep investigators with no cases; `COUNT(DISTINCT CASE WHEN ...)` counts conditionally and removes join duplicates |

## 3. Routines, trigger and event

| Object | Kind | What it does |
|---|---|---|
| `refresh_monthly_case_stats()` | procedure | In one transaction: `DELETE` the summary, re-insert one row per month (opened, closed, critical, average days to close). Exit handler rolls back and re-raises |
| `case_duration_days(p_id)` | function | Whole days a case has been open (or was open, if closed). `READS SQL DATA`; not DETERMINISTIC because an open case's age depends on `NOW()`. `NULL` for an unknown id |
| `get_case_summary(p_case_code)` | procedure | Returns **four result sets**: the case (with `days_open`), its timeline, its evidence, its assets. `SIGNAL 'Case not found'` for an unknown code. mysql2 returns it as `[cases, events, evidence, assets, okPacket]` |
| `close_investigation(p_id, p_user)` | procedure | Atomic close: locks the case row (`FOR UPDATE`), checks that it exists, is not already closed, and that the acting user is active and is the lead or an ADMIN (`SIGNAL SQLSTATE '45000'` with a clear message for each rule), then sets `CLOSED` + `closed_at` and inserts a `CASE_CLOSED` event. Exit handler rolls back everything on any error |
| `trg_inv_au_status` | AFTER UPDATE trigger on `investigations` | When `status` changes, inserts a `STATUS_CHANGED` event "Status changed from X to Y" with `created_by = @app_user_id` |
| `trg_users_bi_email`, `trg_users_bu_email` | BEFORE INSERT / UPDATE triggers on `users` | Lower-case and trim the email. (MySQL allows one event per trigger, hence two triggers) |
| `evt_refresh_monthly_case_stats` | EVENT | Runs the refresh procedure daily. Creating it succeeds even when the scheduler is off; it then simply does not fire until `SET GLOBAL event_scheduler = ON` |

**Calling rule.** `refresh_monthly_case_stats` and `close_investigation` start their own transaction. In MySQL a `START TRANSACTION` inside an open transaction silently commits the outer one, so the API calls them on a plain pooled connection (`SET @app_user_id = ?` then `CALL ...`), never inside `withTransaction`. After the call the variable is reset to NULL so a reused connection cannot inherit the previous user.

## 4. Full-text search
- `FULLTEXT INDEX ft_inv_title_code (title, case_code)` on `investigations` and `FULLTEXT INDEX ft_event_description (description)` on `investigation_events`.
- `GET /api/investigations?q=...` uses `MATCH(...) AGAINST(? IN NATURAL LANGUAGE MODE)` for a relevance score and also finds cases whose **timeline** mentions the words (`o.id IN (SELECT ... MATCH(description) ...)`). The best match comes first; matching words are highlighted in the UI.
- A query that is exactly a case code (`CASE-2025-003`) is looked up with `=`, because splitting it into tokens would match every case.
- InnoDB ignores words shorter than 3 characters and its stop-word list; the search page says so.

## 5. Authentication and authorisation
| Concern | Design |
|---|---|
| Password storage | bcrypt, cost 10 (2^10 rounds, salt inside the hash). Seed passwords are hashes made by `scripts/hash-password.ts`; no plain text anywhere in the repo. The `password_hash` CHECK rejects anything that is not bcrypt-shaped |
| Login | Parameterised lookup by lower-cased email; `bcrypt.compare`. Unknown email, wrong password and inactive user all return the **same** 401 "Invalid email or password", and unknown emails still run a dummy `bcrypt.compare`, so neither the message nor the response time reveals which accounts exist |
| Session | HS256 JWT (`jose`) signed with `JWT_SECRET` (must be 32+ characters, read only from the environment), 8-hour expiry, algorithm pinned on verify. Stored in an **httpOnly**, `sameSite=lax` cookie (and `secure` in production), so scripts cannot read it and cross-site POSTs do not carry it |
| Live checks | `getSession()` verifies the token, then re-reads `is_active` and the role from MySQL on every call. A deactivated or demoted user is affected on their very next request, not when the token expires |
| Route protection | `middleware.ts` (Edge runtime) rejects pages without a valid token (redirect to `/login?next=...`) and APIs with JSON 401. It cannot query MySQL, so it is only the first gate: every route handler and page still calls `requireRole()`/`getSession()` |
| Role checks | `requireRole(["ADMIN", ...])` at the top of every route; additional row-level rules in the database layer (`lockCaseForChange`: lead or admin; `close_investigation` repeats the rule inside MySQL) |
| Brute force | In-memory limiter: 5 failures per (IP, email) and 20 per IP per 15 minutes, then 429 with `Retry-After`. It resets on server restart and is not shared across instances (a stated limitation; production would use Redis or the database) |
| SQL injection | Every statement uses `?` placeholders. The only text built into SQL is fixed fragments chosen from whitelists (sort columns, which fields to `UPDATE`) and zod-validated integers for `LIMIT`/`OFFSET` |
| Input validation | zod on every request body and query; CHECK/UNIQUE/FK constraints and triggers as the last line of defence; database errors mapped to clear 400/409 responses |
| Admin safety | An admin cannot demote or deactivate themselves, and the last active admin cannot be removed |
| Open redirect | The login `next` parameter is only followed if it is a path on this site |
| Audit | Successful logins and user changes are written to the append-only `audit_logs` table |

## 6. API summary (Member B)

| Route | Roles | Concepts |
|---|---|---|
| POST `/api/auth/login`, `/logout`; GET `/api/auth/me` | public / any | bcrypt, JWT cookie, rate limit, audit row |
| GET/POST `/api/users`, PATCH `/api/users/[id]`, GET `/api/users/investigators` | ADMIN (the last: ADMIN, INVESTIGATOR) | password policy, hashing, transaction, guard rules |
| GET `/api/investigations` | all | view, FULLTEXT `MATCH ... AGAINST`, filters, pagination |
| POST `/api/investigations` | INVESTIGATOR, ADMIN | transaction, next case number under `FOR UPDATE` |
| GET `/api/investigations/[id]` | all | `CALL get_case_summary` (4 result sets) + Mongo notes |
| PATCH `/api/investigations/[id]` | lead or ADMIN | `FOR UPDATE`, status trigger, reopen rule |
| POST `/api/investigations/[id]/close` | lead or ADMIN | `CALL close_investigation` on its own connection |
| POST/DELETE `/api/investigations/[id]/evidence`, `/assets` | lead or ADMIN | junction tables, composite PK, transaction + timeline event |
| GET/POST `/api/investigations/[id]/notes`; PATCH/DELETE `.../notes/[noteId]` | all (edit: author/admin; delete: not ANALYST) | MongoDB CRUD, embedded edit history, `$jsonSchema`, cross-database existence checks |
| GET/POST `/api/assets`, GET `/api/assets/[id]/cases` | all / INVESTIGATOR, ADMIN | `GROUP BY` + `HAVING`, UNIQUE, junction JOIN |
| GET/POST `/api/dashboard` | all / ADMIN | views, summary table, Mongo aggregations, `CALL refresh_monthly_case_stats` |

All responses are `{ data }` or `{ error }`.

## 7. Pages
`/login`, `/dashboard`, `/investigations` (filters + full-text search with highlighting), `/investigations/new`, `/investigations/[id]` (overview, actions, linked evidence, assets, timeline, notes), `/assets`, `/assets/[id]`, `/admin/users`. The shared navigation (`app/layout.tsx`) shows links by role, including Member A's `/evidence`, `/evidence/new`, `/evidence/verify`, `/evidence/stats` and `/audit`.

## 8. Seed data and demo logins
`90_seed_core.sql`: 3 roles, 8 users (1 admin, 2-5 investigators, 6-8 analysts), 10 investigations, 35 timeline events, 20 assets, 26 asset links. `92_seed_links.sql`: 26 evidence links (it runs after `91_seed_evidence.sql`) and the first refresh of `monthly_case_stats`. Every demo user has the password `Password@123` (stored only as a bcrypt hash): `admin@shadowtrace.dev`, `investigator@shadowtrace.dev`, `analyst@shadowtrace.dev`, plus `meera.nair@`, `karthik.rao@`, `sneha.pillai@`, `arjun.pai@`, `neha.kamath@shadowtrace.dev`.

## 9. Known limitations
- The login limiter lives in process memory (see section 5).
- Closing a case through the API is allowed for the lead investigator or an admin; the schema has no "assigned analyst" relation, so analysts cannot be restricted to specific cases and see all cases.
- MongoDB cannot enforce foreign keys; the API checks MySQL (case, author, mentioned evidence ids) before writing a note, but a direct write to Mongo could reference a missing id.
- Attachments on notes are metadata only (name, size, kind); the files are not stored.
