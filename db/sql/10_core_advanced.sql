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

-- ==== PART 3: ROUTINES =====================================================
DELIMITER $$

-- Function: whole days a case has been open (or was open, if closed). READS SQL DATA because it queries a table;
-- it is not DETERMINISTIC because an open case's age changes with NOW(). Returns NULL for an unknown id.
CREATE FUNCTION case_duration_days(p_id INT) RETURNS INT
READS SQL DATA
BEGIN
  DECLARE v_days INT;
  SELECT DATEDIFF(COALESCE(closed_at, NOW()), opened_at) INTO v_days FROM investigations WHERE id = p_id;
  RETURN v_days;
END$$

-- Procedure returning FOUR result sets (functions can only return one scalar):
--   1 the case, 2 its timeline (newest first), 3 its evidence, 4 its assets.
-- With mysql2, CALL returns an array: [caseRows, eventRows, evidenceRows, assetRows, okPacket].
CREATE PROCEDURE get_case_summary(IN p_case_code VARCHAR(20))
BEGIN
  DECLARE v_id INT;

  SELECT id INTO v_id FROM investigations WHERE case_code = p_case_code;
  IF v_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Case not found';
  END IF;

  SELECT o.*, case_duration_days(o.id) AS days_open
  FROM v_case_overview o WHERE o.id = v_id;

  SELECT ev.id, ev.event_type, ev.event_time, ev.description, u.full_name AS created_by_name
  FROM investigation_events ev
  LEFT JOIN users u ON u.id = ev.created_by
  WHERE ev.investigation_id = v_id
  ORDER BY ev.event_time DESC, ev.id DESC;

  SELECT e.id, e.file_name, e.status, t.type_name, h.full_name AS custodian_name, ei.linked_at
  FROM evidence_investigations ei
  JOIN evidence e       ON e.id = ei.evidence_id
  JOIN evidence_types t ON t.id = e.evidence_type_id
  JOIN users h          ON h.id = e.custodian_id
  WHERE ei.investigation_id = v_id
  ORDER BY ei.linked_at DESC, e.id;

  SELECT a.id, a.asset_type, a.identifier, a.description, ia.linked_at
  FROM investigation_assets ia
  JOIN assets a ON a.id = ia.asset_id
  WHERE ia.investigation_id = v_id
  ORDER BY a.asset_type, a.identifier;
END$$

-- Closes a case atomically: status + close date + timeline event, or nothing.
-- Only the lead investigator or an ADMIN may close it. Business-rule errors use SIGNAL SQLSTATE '45000'.
-- Call it on its own connection (it runs START TRANSACTION itself): SET @app_user_id = ?; CALL close_investigation(?, ?);
CREATE PROCEDURE close_investigation(IN p_id INT, IN p_user INT)
BEGIN
  DECLARE v_status VARCHAR(10);
  DECLARE v_lead   INT;
  DECLARE v_role   VARCHAR(30);
  DECLARE v_active BOOLEAN;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET @app_user_id = p_user;          -- the status-change trigger records who did it

  START TRANSACTION;

  SELECT status, lead_investigator_id INTO v_status, v_lead
  FROM investigations WHERE id = p_id FOR UPDATE;      -- lock the case row

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Case not found';
  END IF;
  IF v_status = 'CLOSED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Case is already closed';
  END IF;

  SELECT r.role_name, u.is_active INTO v_role, v_active
  FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = p_user;

  IF v_role IS NULL OR v_active = FALSE THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Acting user does not exist or is inactive';
  END IF;
  IF p_user <> v_lead AND v_role <> 'ADMIN' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only the lead investigator or an admin can close this case';
  END IF;

  UPDATE investigations SET status = 'CLOSED', closed_at = NOW() WHERE id = p_id;

  INSERT INTO investigation_events (investigation_id, event_type, description, created_by)
  VALUES (p_id, 'CASE_CLOSED', 'Case closed', p_user);

  COMMIT;
END$$

DELIMITER ;

-- ==== PART 4: FULL-TEXT INDEXES AND TRIGGER ================================
-- FULLTEXT indexes power MATCH(...) AGAINST(...) searches ranked by relevance (much faster than LIKE '%x%').
-- Note: InnoDB ignores words shorter than 3 characters and a built-in list of stop words ("the", "of", ...).
ALTER TABLE investigations       ADD FULLTEXT INDEX ft_inv_title_code (title, case_code);
ALTER TABLE investigation_events ADD FULLTEXT INDEX ft_event_description (description);

DELIMITER $$

-- Every status change leaves a trace on the case timeline. @app_user_id is set by the application (NULL = system).
CREATE TRIGGER trg_inv_au_status
AFTER UPDATE ON investigations
FOR EACH ROW
BEGIN
  IF OLD.status <> NEW.status THEN
    INSERT INTO investigation_events (investigation_id, event_type, description, created_by)
    VALUES (NEW.id, 'STATUS_CHANGED', CONCAT('Status changed from ', OLD.status, ' to ', NEW.status), @app_user_id);
  END IF;
END$$

DELIMITER ;
