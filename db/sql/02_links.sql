-- 02_links.sql (Member B): investigations, their events, assets, and the two many-to-many link tables.
-- Runs after 01_evidence.sql because evidence_investigations references evidence(id).
USE shadowtrace;

-- ---------------------------------------------------------------------------
-- investigations: one row per case.
-- ---------------------------------------------------------------------------
CREATE TABLE investigations (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  title                VARCHAR(200) NOT NULL,
  case_code            VARCHAR(20)  NOT NULL UNIQUE,            -- e.g. CASE-2025-001
  severity             VARCHAR(10)  NOT NULL DEFAULT 'MEDIUM',
  status               VARCHAR(10)  NOT NULL DEFAULT 'OPEN',
  opened_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at            DATETIME     NULL,
  lead_investigator_id INT          NOT NULL,
  CONSTRAINT fk_inv_lead FOREIGN KEY (lead_investigator_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_inv_title    CHECK (CHAR_LENGTH(TRIM(title)) >= 3),
  CONSTRAINT chk_inv_code     CHECK (case_code REGEXP '^CASE-[0-9]{4}-[0-9]{3}$'),
  CONSTRAINT chk_inv_severity CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  CONSTRAINT chk_inv_status   CHECK (status IN ('OPEN','ACTIVE','ON_HOLD','CLOSED')),
  CONSTRAINT chk_inv_dates    CHECK (closed_at IS NULL OR closed_at >= opened_at),   -- cannot close before opening
  CONSTRAINT chk_inv_closed   CHECK (status <> 'CLOSED' OR closed_at IS NOT NULL),   -- a CLOSED case must have a close date
  INDEX idx_inv_status_sev (status, severity),   -- list filters and dashboard counts
  INDEX idx_inv_lead (lead_investigator_id)      -- "cases led by X", workload view
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- investigation_events: the timeline of a case. Deleting a case removes its timeline (ON DELETE CASCADE).
-- created_by is the user who caused the event (NULL = system). It is not used in any CHECK,
-- which matters: MySQL forbids CHECKs on columns that have a cascading foreign key.
-- ---------------------------------------------------------------------------
CREATE TABLE investigation_events (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  event_type       VARCHAR(20) NOT NULL,
  event_time       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  description      VARCHAR(500) NOT NULL,
  investigation_id INT         NOT NULL,
  created_by       INT         NULL,
  CONSTRAINT fk_event_inv  FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_user FOREIGN KEY (created_by)       REFERENCES users(id)          ON DELETE RESTRICT,
  CONSTRAINT chk_event_type CHECK (event_type IN
    ('OPENED','STATUS_CHANGED','EVIDENCE_LINKED','EVIDENCE_UNLINKED','ASSET_LINKED','ASSET_UNLINKED','NOTE','CASE_CLOSED')),
  INDEX idx_event_inv_time (investigation_id, event_time)   -- the timeline of one case in time order
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- assets: things an investigation is about (an IP, a domain, a device, ...). Shared between cases.
-- UNIQUE(asset_type, identifier): the same IP is one asset, however many cases mention it.
-- ---------------------------------------------------------------------------
CREATE TABLE assets (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  asset_type  VARCHAR(10)  NOT NULL,
  identifier  VARCHAR(255) NOT NULL,
  description VARCHAR(255) NULL,
  CONSTRAINT chk_asset_type  CHECK (asset_type IN ('IP','DOMAIN','DEVICE','EMAIL','ACCOUNT','WALLET')),
  CONSTRAINT chk_asset_ident CHECK (CHAR_LENGTH(TRIM(identifier)) >= 2),
  UNIQUE KEY uq_asset (asset_type, identifier),
  INDEX idx_asset_identifier (identifier)          -- search by identifier alone (the unique key starts with type)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Junction tables (many-to-many). The composite primary key stops the same link being stored twice.
-- ON DELETE CASCADE on the junction side: removing a case/asset/evidence row also removes its links.
-- ---------------------------------------------------------------------------
CREATE TABLE evidence_investigations (
  evidence_id      INT      NOT NULL,
  investigation_id INT      NOT NULL,
  linked_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (evidence_id, investigation_id),
  CONSTRAINT fk_ei_evidence FOREIGN KEY (evidence_id)      REFERENCES evidence(id)       ON DELETE CASCADE,
  CONSTRAINT fk_ei_inv      FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE CASCADE,
  INDEX idx_ei_inv (investigation_id)               -- "which evidence belongs to this case"
) ENGINE=InnoDB;

CREATE TABLE investigation_assets (
  investigation_id INT      NOT NULL,
  asset_id         INT      NOT NULL,
  linked_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (investigation_id, asset_id),
  CONSTRAINT fk_ia_inv   FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE CASCADE,
  CONSTRAINT fk_ia_asset FOREIGN KEY (asset_id)         REFERENCES assets(id)         ON DELETE CASCADE,
  INDEX idx_ia_asset (asset_id)                     -- "which cases involve this asset"
) ENGINE=InnoDB;
