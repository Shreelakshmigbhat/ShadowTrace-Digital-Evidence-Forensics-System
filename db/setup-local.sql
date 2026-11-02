-- ONE-TIME setup for a LOCAL MySQL install (no Docker). Run as root in MySQL Workbench / Shell.
-- 1) Replace CHANGE_ME with the password you will put in .env.local as MYSQL_PASSWORD.
-- 2) Run the whole file.
-- Needed because triggers can only be created by a non-SUPER user when this flag is on (binary logging is on by default).
SET GLOBAL log_bin_trust_function_creators = 1;

CREATE DATABASE IF NOT EXISTS shadowtrace CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'shadowtrace_app'@'localhost' IDENTIFIED BY 'CHANGE_ME';
GRANT ALL PRIVILEGES ON shadowtrace.* TO 'shadowtrace_app'@'localhost';
FLUSH PRIVILEGES;
