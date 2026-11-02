# ShadowTrace - Digital Evidence Forensics System

DBMS Level 3 mini project. ShadowTrace tracks digital evidence, its chain of custody, the investigations it belongs to, and the notes investigators write about it. Integrity-critical data lives in **MySQL 8** (foreign keys, constraints, transactions, triggers, procedures); flexible, per-evidence-type metadata and free-form case notes live in **MongoDB 7**.

## Tech stack
- Next.js 14 (App Router, TypeScript, Tailwind CSS); route handlers are the API layer
- MySQL 8.0 via `mysql2/promise` with raw parameterised SQL (no ORM, so the SQL is visible)
- MongoDB 7 via the official `mongodb` driver
- bcrypt password hashing, `jose` JWT in an httpOnly cookie, zod validation, recharts
- Docker Compose for the two databases

## Prerequisites
- Node.js 20+ (Node 24 recommended: the Mongo scripts are TypeScript files run directly by Node)
- Docker Desktop (for MySQL and MongoDB)

## Setup
```bash
npm install
cp .env.example .env.local       # Windows: copy .env.example .env.local
# edit .env.local: choose MYSQL_PASSWORD and MYSQL_ROOT_PASSWORD, and set JWT_SECRET to 32+ random characters:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

npm run db:up                    # start MySQL 8 and MongoDB 7 in Docker
npm run db:reset                 # rebuild MySQL: drop + create the database, then run every db/sql/*.sql file in order
npm run mongo:setup              # create the Mongo collections, validators and indexes
npm run mongo:seed               # insert sample artifacts and case notes
npm run dev                      # http://localhost:3000
```

### One-command database rebuild
`npm run db:reset` feeds `00_core`, `01_evidence`, `02_links`, `10_core_advanced`, `11_evidence_advanced`, `90_seed_core`, `91_seed_evidence`, `92_seed_links` (in that order) to the `mysql` client inside the Docker container, so `DELIMITER $$` blocks (procedures, triggers) work. `npm run db:init` runs the same files without dropping the database first. `99_alter_drop_demo.sql` is not run automatically; run it by hand to demonstrate ALTER and DROP:
```bash
docker exec -i -e MYSQL_PWD=<MYSQL_PASSWORD> shadowtrace-mysql mysql -u<MYSQL_USER> shadowtrace < db/sql/99_alter_drop_demo.sql
```

### Without Docker (optional)
Install MySQL 8 and MongoDB locally, create the `shadowtrace` database and a user with all privileges on it, and run `SET GLOBAL log_bin_trust_function_creators = 1;` once as root (needed so a non-root user can create triggers). Put the path of `mysql.exe` in `.env.local` as `MYSQL_CLI_PATH`; `npm run db:reset` then uses it instead of Docker.

### Running the tests
```bash
docker exec -i -e MYSQL_PWD=<pw> shadowtrace-mysql mysql --force --table -u<user> shadowtrace < db/tests/evidence_tests.sql
docker exec -i -e MYSQL_PWD=<pw> shadowtrace-mysql mysql --force --table -u<user> shadowtrace < db/tests/core_tests.sql
```
`--force` keeps going after an error so every expected failure is shown. Rebuild (`npm run db:reset`) between runs. See [docs/testing-core.md](docs/testing-core.md).

## Default logins
Every demo user has the password **`Password@123`** (stored only as a bcrypt hash).

| Role | Email |
|---|---|
| ADMIN | admin@shadowtrace.dev |
| INVESTIGATOR | investigator@shadowtrace.dev (also meera.nair@, karthik.rao@, sneha.pillai@shadowtrace.dev) |
| ANALYST | analyst@shadowtrace.dev (also arjun.pai@, neha.kamath@shadowtrace.dev) |

Change or remove these accounts before any real use.

## Folder structure
```
app/
  (core)/            login, dashboard, investigations, assets, admin/users      (Member B)
  (evidence)/        evidence list/detail/new/verify/stats, audit               (Member A)
  api/               auth, users, investigations, assets, dashboard             (B)
                     evidence, transfers, audit                                 (A)
components/          core/ (B) and evidence/ (A) UI pieces
lib/                 db.ts, mongo.ts, auth.ts + session/rate-limit helpers, *-service.ts read layers
middleware.ts        JWT check for pages and APIs
db/sql/              00_core, 01_evidence, 02_links, 10_core_advanced, 11_evidence_advanced,
                     90_seed_core, 91_seed_evidence, 92_seed_links, 99_alter_drop_demo
db/queries/          analytical SELECTs for each module
db/tests/            SQL test scripts (expected failures and successes)
db/mongo/            collection setup, seed and aggregation scripts
scripts/             run-sql.mjs (database rebuild), hash-password.ts (bcrypt for seeds)
docs/                project report, module docs, test cases, checklist, demo script
```

## Documentation
- [Project report](docs/project-report.md) (problem, ER diagram, schema, architecture)
- [Core module](docs/core-module.md) and [testing](docs/testing-core.md)
- [Requirements checklist](docs/requirements-checklist.md), [demo script](docs/demo-script.md), [screenshots to take](docs/screenshots-todo.md)
- MongoDB justification: [evidence artifacts](db/mongo/JUSTIFICATION.md), [case notes](docs/mongo-case-notes.md)

## Naming and API rules
`snake_case` columns, plural table names, `<thing>_id` foreign keys; status values in UPPERCASE; every API answers `{ "data": ... }` or `{ "error": "..." }`; all SQL is parameterised; multi-row writes use `withTransaction(userId, ...)` so audit triggers know who acted; procedures that start their own transaction are called on their own connection.

## Contributions
| Member | Student ID | Module |
|---|---|---|
| Shreelakshmi G Bhat | PES2UG24CS478 | Evidence and chain-of-custody module: evidence tables, custody procedure, audit and tamper triggers, evidence artifacts in MongoDB, evidence pages and APIs |
| Aniyath Amrita Pradeep | PES2UG24CS919 | Authentication, investigations and dashboard module: users and roles, login and RBAC, investigations, assets, case notes in MongoDB, dashboard |
