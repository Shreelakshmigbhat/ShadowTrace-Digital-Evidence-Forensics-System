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

-- ==== PART 2: SUMMARY TABLE (MySQL's stand-in for a materialized view) =====
-- MySQL has no materialized views. The usual substitute is a plain table that a procedure
-- rebuilds on demand (or on a schedule). Reads are then instant, at the price of slightly stale data.
CREATE TABLE monthly_case_stats (
  stat_month        CHAR(7)       NOT NULL PRIMARY KEY,         -- 'YYYY-MM'
  cases_opened      INT           NOT NULL DEFAULT 0,
  cases_closed      INT           NOT NULL DEFAULT 0,
  critical_opened   INT           NOT NULL DEFAULT 0,
  avg_days_to_close DECIMAL(7,1)  NULL,                          -- NULL when nothing closed that month
  refreshed_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_mcs_month CHECK (stat_month REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT chk_mcs_counts CHECK (cases_opened >= 0 AND cases_closed >= 0 AND critical_opened >= 0)
) ENGINE=InnoDB;

DELIMITER $$

-- Rebuilds the whole summary in one transaction: readers see either the old rows or the new rows, never half.
-- (DELETE, not TRUNCATE: TRUNCATE commits implicitly and could not be rolled back.)
-- Call it on its own connection: START TRANSACTION here would commit a caller's open transaction.
CREATE PROCEDURE refresh_monthly_case_stats()
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  DELETE FROM monthly_case_stats;

  INSERT INTO monthly_case_stats (stat_month, cases_opened, cases_closed, critical_opened, avg_days_to_close)
  SELECT m.stat_month,
         (SELECT COUNT(*) FROM investigations WHERE DATE_FORMAT(opened_at, '%Y-%m') = m.stat_month),
         (SELECT COUNT(*) FROM investigations WHERE closed_at IS NOT NULL AND DATE_FORMAT(closed_at, '%Y-%m') = m.stat_month),
         (SELECT COUNT(*) FROM investigations WHERE severity = 'CRITICAL' AND DATE_FORMAT(opened_at, '%Y-%m') = m.stat_month),
         (SELECT ROUND(AVG(DATEDIFF(closed_at, opened_at)), 1) FROM investigations
           WHERE closed_at IS NOT NULL AND DATE_FORMAT(closed_at, '%Y-%m') = m.stat_month)
  FROM (
    SELECT DATE_FORMAT(opened_at, '%Y-%m') AS stat_month FROM investigations
    UNION                                                   -- UNION (not ALL) removes duplicate months
    SELECT DATE_FORMAT(closed_at, '%Y-%m') FROM investigations WHERE closed_at IS NOT NULL
  ) AS m;

  COMMIT;
END$$

DELIMITER ;

-- Optional: refresh every night. CREATE EVENT succeeds even if the scheduler is off; the event then simply
-- does not fire until someone runs  SET GLOBAL event_scheduler = ON;  (the Docker MySQL image has it ON).
CREATE EVENT IF NOT EXISTS evt_refresh_monthly_case_stats
  ON SCHEDULE EVERY 1 DAY
  STARTS (CURRENT_TIMESTAMP + INTERVAL 1 DAY)
  COMMENT 'Rebuild monthly_case_stats'
  DO CALL refresh_monthly_case_stats();

