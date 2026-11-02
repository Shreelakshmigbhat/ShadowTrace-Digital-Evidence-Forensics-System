-- core_queries.sql (Member B): analytical SELECTs for the investigation module.
-- Not run by `npm run db:init` (that only runs db/sql/). Paste into a MySQL client after a full rebuild.
USE shadowtrace;

-- Q1. GROUP BY + HAVING: investigators currently leading more than 2 open cases
-- "Open" here means OPEN or ACTIVE. WHERE filters rows BEFORE grouping; HAVING filters groups AFTER counting.
SELECT u.id, u.full_name, COUNT(*) AS open_cases
FROM investigations i
JOIN users u ON u.id = i.lead_investigator_id
WHERE i.status IN ('OPEN', 'ACTIVE')
GROUP BY u.id, u.full_name
HAVING COUNT(*) > 2
ORDER BY open_cases DESC;

-- Q2. JOIN + GROUP BY + HAVING: assets that appear in more than one investigation
-- These are the leads that connect cases to each other (same IP, same account, ...).
SELECT a.id, a.asset_type, a.identifier,
       COUNT(DISTINCT ia.investigation_id) AS cases_involved,
       GROUP_CONCAT(i.case_code ORDER BY i.case_code SEPARATOR ', ') AS case_codes
FROM assets a
JOIN investigation_assets ia ON ia.asset_id = a.id
JOIN investigations i        ON i.id = ia.investigation_id
GROUP BY a.id, a.asset_type, a.identifier
HAVING COUNT(DISTINCT ia.investigation_id) > 1
ORDER BY cases_involved DESC, a.identifier;

-- Q3. Aggregates: average, shortest and longest duration (in days) of CLOSED cases, per severity
-- DATEDIFF counts whole days between two dates.
SELECT severity,
       COUNT(*)                                 AS closed_cases,
       ROUND(AVG(DATEDIFF(closed_at, opened_at)), 1) AS avg_days,
       MIN(DATEDIFF(closed_at, opened_at))      AS shortest_days,
       MAX(DATEDIFF(closed_at, opened_at))      AS longest_days
FROM investigations
WHERE status = 'CLOSED'
GROUP BY severity
ORDER BY FIELD(severity, 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW');   -- FIELD() gives a custom sort order

-- Q4. Correlated subquery (NOT EXISTS): cases with no evidence linked yet
-- The inner query runs once per case and asks "is there any link row for this case?".
SELECT i.case_code, i.title, i.status, i.opened_at
FROM investigations i
WHERE NOT EXISTS (SELECT 1 FROM evidence_investigations ei WHERE ei.investigation_id = i.id)
ORDER BY i.opened_at;

-- Q5. GROUP BY + GROUP_CONCAT: evidence that is used in more than one case
-- Evidence shared between cases is worth a second look: one item, several stories.
SELECT e.id, e.file_name,
       COUNT(*) AS cases_using_it,
       GROUP_CONCAT(i.case_code ORDER BY i.case_code SEPARATOR ', ') AS case_codes
FROM evidence_investigations ei
JOIN evidence e       ON e.id = ei.evidence_id
JOIN investigations i ON i.id = ei.investigation_id
GROUP BY e.id, e.file_name
HAVING COUNT(*) > 1
ORDER BY cases_using_it DESC, e.id;

-- Q6. Scalar subqueries in SELECT: one row per case with its evidence, asset and event counts
-- Each (SELECT COUNT(*) ...) is evaluated per case. Cheaper to write than three LEFT JOINs with GROUP BY,
-- and it avoids the classic mistake of multiplying rows when joining several one-to-many tables.
SELECT i.case_code, i.title, i.severity, i.status, lead_u.full_name AS lead_investigator,
       (SELECT COUNT(*) FROM evidence_investigations ei WHERE ei.investigation_id = i.id) AS evidence_items,
       (SELECT COUNT(*) FROM investigation_assets   ia WHERE ia.investigation_id = i.id) AS assets,
       (SELECT COUNT(*) FROM investigation_events   ev WHERE ev.investigation_id = i.id) AS events
FROM investigations i
JOIN users lead_u ON lead_u.id = i.lead_investigator_id
ORDER BY FIELD(i.severity, 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'), i.opened_at;

-- Q7. Subquery in HAVING: cases with more timeline events than the average case
-- The inner query computes the average ONCE (it does not depend on the outer row).
SELECT i.case_code, i.title, COUNT(ev.id) AS events
FROM investigations i
JOIN investigation_events ev ON ev.investigation_id = i.id
GROUP BY i.id, i.case_code, i.title
HAVING COUNT(ev.id) > (
  SELECT AVG(per_case.n)
  FROM (SELECT COUNT(*) AS n FROM investigation_events GROUP BY investigation_id) AS per_case
)
ORDER BY events DESC, i.case_code;

-- Q8. Window function: cases opened per month, with a running total
-- SUM() OVER (ORDER BY month) accumulates the monthly counts without collapsing the rows.
SELECT opened_month, cases_opened,
       SUM(cases_opened) OVER (ORDER BY opened_month) AS running_total
FROM (
  SELECT DATE_FORMAT(opened_at, '%Y-%m') AS opened_month, COUNT(*) AS cases_opened
  FROM investigations
  GROUP BY DATE_FORMAT(opened_at, '%Y-%m')
) AS monthly
ORDER BY opened_month;
