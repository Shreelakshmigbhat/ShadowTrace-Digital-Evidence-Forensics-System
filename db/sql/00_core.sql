-- 00_core.sql (Member B): roles and users.
-- Runs first: evidence tables (01_evidence.sql) reference users(id).
-- The investigation tables live in 02_links.sql because they link to evidence.
CREATE DATABASE IF NOT EXISTS shadowtrace CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE shadowtrace;

-- ---------------------------------------------------------------------------
-- roles: the three application roles. A CHECK keeps the set closed: a typo cannot create a 4th role.
-- ---------------------------------------------------------------------------
CREATE TABLE roles (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  role_name   VARCHAR(30)  NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  CONSTRAINT chk_role_name CHECK (role_name IN ('ADMIN','INVESTIGATOR','ANALYST'))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- users: people who can log in.
-- password_hash is CHAR(60): a bcrypt hash is always exactly 60 characters and starts with $2a$, $2b$ or $2y$.
-- The CHECK therefore rejects any plain-text password someone tries to store by mistake.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash CHAR(60)     NOT NULL,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  role_id       INT          NOT NULL,
  CONSTRAINT fk_users_role   FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
  CONSTRAINT chk_users_name  CHECK (CHAR_LENGTH(TRIM(full_name)) >= 2),
  CONSTRAINT chk_users_email CHECK (email REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'),
  CONSTRAINT chk_users_hash  CHECK (password_hash REGEXP '^\\$2[aby]\\$'),
  INDEX idx_users_role (role_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Emails are stored lowercase, so "Admin@X.com" and "admin@x.com" can never be two accounts.
-- (MySQL allows one event per trigger, hence one trigger for INSERT and one for UPDATE.)
-- ---------------------------------------------------------------------------
DELIMITER $$

CREATE TRIGGER trg_users_bi_email
BEFORE INSERT ON users
FOR EACH ROW
BEGIN
  SET NEW.email = LOWER(TRIM(NEW.email));
END$$

CREATE TRIGGER trg_users_bu_email
BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
  SET NEW.email = LOWER(TRIM(NEW.email));
END$$

DELIMITER ;
