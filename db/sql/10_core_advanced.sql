-- 10_core_advanced.sql (Member B): views, summary table, stored routines, FULL-TEXT indexes, trigger.
-- Runs after 02_links.sql (tables) and before the seed files. Run through the mysql CLI so DELIMITER works.
USE shadowtrace;

-- ==== PART 1: VIEWS ========================================================
-- v_case_overview: one row per case with the numbers the list page and dashboard need.
-- Scalar subqueries (not joins) keep it to ONE row per case: joining evidence, assets and events
-- together would multiply the rows (3 evidence x 4 events = 12 rows) and inflate every count.
CREATE VIEW v_case_overview AS
SELECT
  i.id,
  i.case_code,
  i.title,
  i.severity,
  i.status,
  i.opened_at,
  i.closed_at,
  i.lead_investigator_id,
  u.full_name AS lead_investigator,
  (SELECT COUNT(*) FROM evidence_investigations ei WHERE ei.investigation_id = i.id) AS evidence_count,
  (SELECT COUNT(*) FROM investigation_assets    ia WHERE ia.investigation_id = i.id) AS asset_count,
  (SELECT COUNT(*) FROM investigation_events    ev WHERE ev.investigation_id = i.id) AS event_count,
  (SELECT MAX(ev.event_time) FROM investigation_events ev WHERE ev.investigation_id = i.id) AS last_event_at,
  DATEDIFF(COALESCE(i.closed_at, NOW()), i.opened_at) AS duration_days
FROM investigations i
JOIN users u ON u.id = i.lead_investigator_id;

-- v_investigator_workload: how busy each investigator is. LEFT JOINs keep investigators with no cases (all zeros).
-- COUNT(DISTINCT CASE WHEN ...) counts only the rows that match a condition, and DISTINCT undoes the row
-- multiplication caused by also joining the evidence links.
CREATE VIEW v_investigator_workload AS
SELECT
  u.id AS investigator_id,
  u.full_name,
  u.is_active,
  COUNT(DISTINCT CASE WHEN i.status IN ('OPEN','ACTIVE') THEN i.id END) AS open_cases,
  COUNT(DISTINCT CASE WHEN i.status = 'ON_HOLD' THEN i.id END)          AS on_hold_cases,
  COUNT(DISTINCT CASE WHEN i.status = 'CLOSED' THEN i.id END)           AS closed_cases,
  COUNT(DISTINCT CASE WHEN i.status IN ('OPEN','ACTIVE') AND i.severity IN ('HIGH','CRITICAL') THEN i.id END) AS high_priority_open,
  COUNT(DISTINCT CASE WHEN i.status IN ('OPEN','ACTIVE') THEN ei.evidence_id END) AS evidence_in_open_cases,
  (SELECT COUNT(*) FROM evidence e WHERE e.custodian_id = u.id) AS evidence_in_custody
FROM users u
JOIN roles r ON r.id = u.role_id AND r.role_name = 'INVESTIGATOR'
LEFT JOIN investigations i ON i.lead_investigator_id = u.id
LEFT JOIN evidence_investigations ei ON ei.investigation_id = i.id
GROUP BY u.id, u.full_name, u.is_active;

