-- core_tests.sql (Member B): statements that SHOULD fail and statements that SHOULD succeed.
-- Run on a freshly rebuilt database (npm run db:reset). Seed facts used below:
--   users 1-8 (1 = ADMIN, 2-5 = INVESTIGATOR, 6-8 = ANALYST); case 1 is led by user 2 and is ACTIVE;
--   case 3 is led by user 2 and is OPEN; case 4 is CLOSED; case 9 has no evidence.
--
-- HOW TO RUN (--force keeps going after an error, so every expected failure is shown):
--   mysql --force --table -u<user> -p shadowtrace < db/tests/core_tests.sql
USE shadowtrace;
SET @app_user_id = 2;   -- pretend user 2 (investigator) is logged in

-- ======================= SHOULD FAIL =======================

-- F1. Malformed email
-- EXPECT: ERROR 3819 Check constraint 'chk_users_email' is violated.
INSERT INTO users (full_name, email, password_hash, role_id)
SELECT 'Bad Email', 'not-an-email', password_hash, 3 FROM users WHERE id = 1;

-- F2. A plain-text password cannot be stored (only a 60-character bcrypt hash passes)
-- EXPECT: ERROR 3819 Check constraint 'chk_users_hash' is violated.
INSERT INTO users (full_name, email, password_hash, role_id) VALUES ('Plain Pw', 'plain@shadowtrace.dev', 'Password@123', 3);
-- 60 characters but not a bcrypt hash:
-- EXPECT: ERROR 3819 Check constraint 'chk_users_hash' is violated.
INSERT INTO users (full_name, email, password_hash, role_id) VALUES ('Plain Pw', 'plain@shadowtrace.dev', REPEAT('x', 60), 3);

-- F3. Duplicate email in a different letter case (the BEFORE INSERT trigger lowercases it first)
-- EXPECT: ERROR 1062 Duplicate entry 'admin@shadowtrace.dev' for key 'users.email'
INSERT INTO users (full_name, email, password_hash, role_id)
SELECT 'Second Admin', 'ADMIN@ShadowTrace.dev', password_hash, 1 FROM users WHERE id = 1;

-- F4. A fourth role
-- EXPECT: ERROR 3819 Check constraint 'chk_role_name' is violated.
INSERT INTO roles (role_name, description) VALUES ('SUPERUSER', 'not allowed');

-- F5. Bad case code format
-- EXPECT: ERROR 3819 Check constraint 'chk_inv_code' is violated.
INSERT INTO investigations (title, case_code, lead_investigator_id) VALUES ('Bad code', 'CASE-25-1', 2);

-- F6. Invalid severity
-- EXPECT: ERROR 3819 Check constraint 'chk_inv_severity' is violated.
INSERT INTO investigations (title, case_code, severity, lead_investigator_id) VALUES ('Bad severity', 'CASE-2026-001', 'URGENT', 2);

-- F7. CLOSED without a close date
-- EXPECT: ERROR 3819 Check constraint 'chk_inv_closed' is violated.
INSERT INTO investigations (title, case_code, status, lead_investigator_id) VALUES ('No close date', 'CASE-2026-002', 'CLOSED', 2);

-- F8. Closed before it was opened
-- EXPECT: ERROR 3819 Check constraint 'chk_inv_dates' is violated.
INSERT INTO investigations (title, case_code, status, opened_at, closed_at, lead_investigator_id)
VALUES ('Time travel', 'CASE-2026-003', 'CLOSED', '2025-06-01 10:00:00', '2025-05-01 10:00:00', 2);

-- F9. Same asset twice, and an invalid asset type
-- EXPECT: ERROR 1062 Duplicate entry 'IP-203.0.113.45' for key 'assets.uq_asset'
INSERT INTO assets (asset_type, identifier) VALUES ('IP', '203.0.113.45');
-- EXPECT: ERROR 3819 Check constraint 'chk_asset_type' is violated.
INSERT INTO assets (asset_type, identifier) VALUES ('FAX', '555-0100');

-- F10. Duplicate junction row (composite primary key)
-- EXPECT: ERROR 1062 Duplicate entry '1-1' for key 'evidence_investigations.PRIMARY'
INSERT INTO evidence_investigations (evidence_id, investigation_id) VALUES (1, 1);

-- F11. Linking evidence to a case that does not exist (foreign key)
-- EXPECT: ERROR 1452 Cannot add or update a child row: a foreign key constraint fails
INSERT INTO evidence_investigations (evidence_id, investigation_id) VALUES (1, 9999);

-- F12. Closing a case as someone who is neither its lead nor an admin (user 3 vs case 1 led by user 2)
-- EXPECT: ERROR 1644 (45000) Only the lead investigator or an admin can close this case; case 1 stays ACTIVE
CALL close_investigation(1, 3);
SELECT status FROM investigations WHERE id = 1;           -- ACTIVE

-- F13. Closing an already closed case
-- EXPECT: ERROR 1644 (45000) Case is already closed
CALL close_investigation(4, 4);

-- F14. Unknown case code / unknown case id
-- EXPECT: ERROR 1644 (45000) Case not found   (both calls)
CALL get_case_summary('CASE-1999-999');
CALL close_investigation(9999, 1);

-- F15. A deactivated user cannot close a case
UPDATE users SET is_active = FALSE WHERE id = 5;
-- EXPECT: ERROR 1644 (45000) Acting user does not exist or is inactive
CALL close_investigation(8, 5);
UPDATE users SET is_active = TRUE WHERE id = 5;           -- restore

-- ======================= SHOULD SUCCEED =======================

-- S1. New user: the email is stored lowercase by the trigger
-- EXPECT: Query OK; the SELECT shows 'new.person@shadowtrace.dev'
INSERT INTO users (full_name, email, password_hash, role_id)
SELECT 'New Person', '  New.Person@ShadowTrace.dev ', password_hash, 3 FROM users WHERE id = 1;
SELECT id, email FROM users WHERE full_name = 'New Person';

-- S2. New case, then a status change leaves a timeline event written by the trigger
-- (close_investigation sets @app_user_id itself, even when it fails, so set it again here)
SET @app_user_id = 2;
-- EXPECT: Query OK, one STATUS_CHANGED event "Status changed from OPEN to ACTIVE" with created_by = 2
INSERT INTO investigations (title, case_code, severity, lead_investigator_id) VALUES ('Test case', 'CASE-2026-100', 'LOW', 2);
SET @t = LAST_INSERT_ID();
UPDATE investigations SET status = 'ACTIVE' WHERE id = @t;
SELECT event_type, description, created_by FROM investigation_events WHERE investigation_id = @t;

-- S3. Close it as its lead
-- EXPECT: Query OK. status CLOSED, closed_at filled; events: STATUS_CHANGED (ACTIVE to CLOSED) and CASE_CLOSED
CALL close_investigation(@t, 2);
SELECT status, closed_at IS NOT NULL AS has_close_date FROM investigations WHERE id = @t;
SELECT event_type, description FROM investigation_events WHERE investigation_id = @t ORDER BY id;

-- S4. An ADMIN may close someone else's case (case 3 is led by user 2)
-- EXPECT: Query OK; case 3 becomes CLOSED
CALL close_investigation(3, 1);
SELECT case_code, status FROM investigations WHERE id = 3;

-- S5. The function
-- EXPECT: 49 for case 4 (opened 2025-02-12, closed 2025-04-02); NULL for an unknown id. (Open cases return their age until today.)
SELECT case_duration_days(4) AS case_4_days, case_duration_days(9999) AS unknown_case;

-- S6. get_case_summary returns four result sets (case, events, evidence, assets)
-- EXPECT: four tables of output for CASE-2025-002 (4 evidence items, 4 assets, 5 events)
CALL get_case_summary('CASE-2025-002');

-- S7. Full-text search, ranked by relevance
-- EXPECT: CASE-2025-002 (ransomware) first with a score > 0
SELECT case_code, title, MATCH(title, case_code) AGAINST('ransomware server' IN NATURAL LANGUAGE MODE) AS score
FROM investigations
WHERE MATCH(title, case_code) AGAINST('ransomware server' IN NATURAL LANGUAGE MODE)
ORDER BY score DESC;
-- EXPECT: timeline events mentioning "wallet" (cases 8)
SELECT investigation_id, description FROM investigation_events
WHERE MATCH(description) AGAINST('wallet' IN NATURAL LANGUAGE MODE);

-- S8. Summary table refresh (MySQL's materialized-view substitute)
-- EXPECT: one row per month from 2025-01 to 2025-07 and a refreshed_at timestamp; the new 2026 test case adds a 2026 month
CALL refresh_monthly_case_stats();
SELECT stat_month, cases_opened, cases_closed, critical_opened, avg_days_to_close FROM monthly_case_stats ORDER BY stat_month;

-- S9. Views
-- EXPECT: user 2 (Rohan Iyer) at the top of the workload view with the most open cases
SELECT investigator_id, full_name, open_cases, on_hold_cases, closed_cases, evidence_in_open_cases FROM v_investigator_workload ORDER BY open_cases DESC;
SELECT case_code, status, evidence_count, asset_count, event_count, duration_days FROM v_case_overview ORDER BY id;

-- S10. ON DELETE CASCADE: deleting a case removes its events and links, but not the evidence or assets themselves
-- EXPECT: 0 events and 0 links left for the test case; evidence 1 and asset 1 still exist
INSERT INTO investigations (title, case_code, lead_investigator_id) VALUES ('Cascade test', 'CASE-2026-101', 2);
SET @c = LAST_INSERT_ID();
INSERT INTO investigation_events (investigation_id, event_type, description) VALUES (@c, 'NOTE', 'to be deleted');
INSERT INTO evidence_investigations (evidence_id, investigation_id) VALUES (1, @c);
INSERT INTO investigation_assets (investigation_id, asset_id) VALUES (@c, 1);
DELETE FROM investigations WHERE id = @c;
SELECT (SELECT COUNT(*) FROM investigation_events WHERE investigation_id = @c)  AS events_left,
       (SELECT COUNT(*) FROM evidence_investigations WHERE investigation_id = @c) AS evidence_links_left,
       (SELECT COUNT(*) FROM investigation_assets WHERE investigation_id = @c)  AS asset_links_left,
       (SELECT COUNT(*) FROM evidence WHERE id = 1) AS evidence_1_still_exists,
       (SELECT COUNT(*) FROM assets WHERE id = 1)   AS asset_1_still_exists;
