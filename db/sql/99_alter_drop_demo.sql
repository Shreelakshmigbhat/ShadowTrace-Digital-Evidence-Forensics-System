-- 99_alter_drop_demo.sql: demonstrates ALTER TABLE and DROP (the "A" and "D" of DDL).
-- Run it by hand AFTER everything else is built (npm run db:init skips files starting with 99_):
--   docker exec -i -e MYSQL_PWD=<password> shadowtrace-mysql mysql -u<user> shadowtrace < db/sql/99_alter_drop_demo.sql
-- It is safe: part 1 works on a scratch table, part 2 changes a real table and then changes it back,
-- part 3 uses a TEMPORARY table (visible only to this session). When it finishes the schema is exactly as before.
-- Part 1 and 3 can be re-run any number of times; run part 2 once per freshly rebuilt database.
USE shadowtrace;

-- ===========================================================================
-- PART 1: ALTER TABLE on a scratch copy (every kind of change, one statement each)
-- ===========================================================================
DROP VIEW  IF EXISTS v_demo_open_cases;
DROP TABLE IF EXISTS demo_cases;

-- CREATE TABLE ... AS SELECT copies the rows but NOT the keys or constraints, so we add them with ALTER.
CREATE TABLE demo_cases AS
  SELECT id, case_code, title, severity, status FROM investigations;
DESCRIBE demo_cases;                                              -- no PRIMARY KEY yet

ALTER TABLE demo_cases ADD PRIMARY KEY (id);                      -- add a primary key
ALTER TABLE demo_cases ADD COLUMN risk_score INT NOT NULL DEFAULT 0 AFTER severity;   -- add a column
ALTER TABLE demo_cases ADD CONSTRAINT chk_demo_risk CHECK (risk_score BETWEEN 0 AND 100);  -- add a CHECK
ALTER TABLE demo_cases ADD CONSTRAINT uq_demo_code UNIQUE (case_code);                     -- add a UNIQUE key
ALTER TABLE demo_cases ADD INDEX idx_demo_sev (severity);                                  -- add an index
ALTER TABLE demo_cases RENAME INDEX idx_demo_sev TO idx_demo_severity;                     -- rename an index
ALTER TABLE demo_cases RENAME COLUMN title TO case_title;                                  -- rename a column
ALTER TABLE demo_cases MODIFY COLUMN case_title VARCHAR(300) NOT NULL;                     -- change a column's type/size
ALTER TABLE demo_cases ADD CONSTRAINT fk_demo_case
  FOREIGN KEY (id) REFERENCES investigations(id) ON DELETE CASCADE;                        -- add a foreign key

SHOW CREATE TABLE demo_cases\G

-- The new CHECK is enforced. Run this by hand to see it fail (left commented so the script does not stop):
--   UPDATE demo_cases SET risk_score = 150 WHERE id = 1;   -- ERROR 3819: Check constraint 'chk_demo_risk' is violated.
UPDATE demo_cases SET risk_score = 90 WHERE severity = 'CRITICAL';  -- allowed (within 0-100)

-- A view over the scratch table, then DROP VIEW.
CREATE VIEW v_demo_open_cases AS
  SELECT id, case_code, case_title, risk_score FROM demo_cases WHERE status IN ('OPEN', 'ACTIVE');
SELECT * FROM v_demo_open_cases ORDER BY risk_score DESC, id;
DROP VIEW v_demo_open_cases;

-- Taking things away again with ALTER ... DROP
ALTER TABLE demo_cases DROP FOREIGN KEY fk_demo_case;
ALTER TABLE demo_cases DROP INDEX idx_demo_severity;
ALTER TABLE demo_cases DROP CHECK chk_demo_risk;
ALTER TABLE demo_cases DROP COLUMN risk_score;

DROP TABLE demo_cases;                                            -- remove the scratch table

-- ===========================================================================
-- PART 2: ALTER a REAL table, then put it back (the application keeps working throughout)
-- ===========================================================================
ALTER TABLE assets ADD COLUMN risk_level VARCHAR(10) NOT NULL DEFAULT 'LOW' AFTER description;
-- Rename BEFORE adding the CHECK: MySQL refuses to rename or drop a column that a CHECK constraint uses (ERROR 3959).
ALTER TABLE assets RENAME COLUMN risk_level TO risk;
ALTER TABLE assets ADD CONSTRAINT chk_asset_risk CHECK (risk IN ('LOW', 'MEDIUM', 'HIGH'));
UPDATE assets SET risk = 'HIGH' WHERE asset_type = 'WALLET';
SELECT asset_type, identifier, risk FROM assets WHERE risk <> 'LOW';

-- change it back (drop the CHECK first, for the same reason as above)
ALTER TABLE assets DROP CHECK chk_asset_risk;
ALTER TABLE assets DROP COLUMN risk;
SHOW COLUMNS FROM assets;                                         -- id, asset_type, identifier, description again

-- ===========================================================================
-- PART 3: TEMPORARY table (lives only for this connection) and DROP TEMPORARY TABLE
-- ===========================================================================
CREATE TEMPORARY TABLE tmp_case_counts AS
  SELECT lead_investigator_id, COUNT(*) AS cases FROM investigations GROUP BY lead_investigator_id;
SELECT u.full_name, t.cases
FROM tmp_case_counts t JOIN users u ON u.id = t.lead_investigator_id
ORDER BY t.cases DESC, u.full_name;
DROP TEMPORARY TABLE tmp_case_counts;
