-- 90_seed_core.sql (Member B): roles, users, investigations, events and assets.
-- Runs before 91_seed_evidence.sql, which assumes users 1-8 exist. The evidence links are in 92_seed_links.sql.
--
-- Demo logins (all passwords: Password@123, stored ONLY as bcrypt hashes made with scripts/hash-password.ts):
--   1 admin@shadowtrace.dev         ADMIN
--   2 investigator@shadowtrace.dev  INVESTIGATOR     3-5 other investigators
--   6 analyst@shadowtrace.dev       ANALYST          7-8 other analysts
USE shadowtrace;

INSERT INTO roles (role_name, description) VALUES
  ('ADMIN', 'Manages users and sees everything'),
  ('INVESTIGATOR', 'Leads cases, collects evidence, transfers custody'),
  ('ANALYST', 'Adds artifact metadata and case notes, cannot delete');

INSERT INTO users (full_name, email, password_hash, role_id) VALUES
  ('Asha Menon', 'admin@shadowtrace.dev', '$2b$10$6eeT8EKbyRpm2hvs/b/LWegw.u9o7CVeaWtSH10xQy6q3RyiRC5Va', 1),
  ('Rohan Iyer', 'investigator@shadowtrace.dev', '$2b$10$fiRGPP4Th4vhecHgJ5gUW.P3pCzfztZI2xdGaTacakW6wqCilTh4i', 2),
  ('Meera Nair', 'meera.nair@shadowtrace.dev', '$2b$10$mfMiF4SXlV4oEKtFyn20COjp5XWC07sGZzHacs6Y/y9KvcdChtgWG', 2),
  ('Karthik Rao', 'karthik.rao@shadowtrace.dev', '$2b$10$lIL2ja1mBlOFKzYlrfmgve8TX4QpKyzaeOLreCzhmuQ5dE866h0ZW', 2),
  ('Sneha Pillai', 'sneha.pillai@shadowtrace.dev', '$2b$10$OeYhbAHozhmxuWO1ZCcBq.XTP3XBjaroGrLxr3fF7rIvYbj19eF4.', 2),
  ('Divya Shetty', 'analyst@shadowtrace.dev', '$2b$10$9Io5aiw1mNe77HSHY6bszOU5BXkB3vFzGwidJvdWyf/5sh4csUnrO', 3),
  ('Arjun Pai', 'arjun.pai@shadowtrace.dev', '$2b$10$1ZxCDUkkqUfX6wNYHhR.CeH3OkOym8HadxGYXdYczddWs8T7J2xQe', 3),
  ('Neha Kamath', 'neha.kamath@shadowtrace.dev', '$2b$10$qbwPypN6AmcYZ3n470vSIeeFfmKGQnVbL3kYg9jGQ0xtfDRLDs6Oa', 3);

INSERT INTO investigations (title, case_code, severity, status, opened_at, closed_at, lead_investigator_id) VALUES
  ('Payroll fraud at regional office', 'CASE-2025-001', 'HIGH', 'ACTIVE', '2025-01-10 09:00:00', NULL, 2),
  ('Ransomware on finance file server', 'CASE-2025-002', 'CRITICAL', 'ACTIVE', '2025-01-20 08:30:00', NULL, 3),
  ('Insider data exfiltration in R&D', 'CASE-2025-003', 'HIGH', 'OPEN', '2025-02-03 10:15:00', NULL, 2),
  ('Phishing campaign against HR staff', 'CASE-2025-004', 'MEDIUM', 'CLOSED', '2025-02-12 11:00:00', '2025-04-02 16:00:00', 4),
  ('Unauthorised access to CCTV server', 'CASE-2025-005', 'MEDIUM', 'ON_HOLD', '2025-03-01 09:45:00', NULL, 5),
  ('Counterfeit invoice scheme', 'CASE-2025-006', 'HIGH', 'ACTIVE', '2025-03-18 14:20:00', NULL, 2),
  ('Stolen laptop containing customer data', 'CASE-2025-007', 'LOW', 'CLOSED', '2025-04-05 09:10:00', '2025-05-20 12:00:00', 3),
  ('Cryptocurrency wallet tracing', 'CASE-2025-008', 'CRITICAL', 'OPEN', '2025-05-12 13:00:00', NULL, 5),
  ('Suspicious vendor onboarding', 'CASE-2025-009', 'LOW', 'OPEN', '2025-06-02 10:30:00', NULL, 4),
  ('Website defacement', 'CASE-2025-010', 'MEDIUM', 'CLOSED', '2025-06-15 08:00:00', '2025-07-30 17:30:00', 2);

INSERT INTO investigation_events (investigation_id, event_type, event_time, description, created_by) VALUES
  (1, 'OPENED', '2025-01-10 09:00:00', 'Case opened: payroll anomalies reported by finance', 2),
  (1, 'STATUS_CHANGED', '2025-01-12 10:00:00', 'Status changed from OPEN to ACTIVE', 2),
  (1, 'EVIDENCE_LINKED', '2025-01-15 11:30:00', 'Linked workstation disk image to the case', 2),
  (1, 'NOTE', '2025-01-18 15:00:00', 'Payroll export shows 14 duplicate beneficiary accounts', 6),
  (2, 'OPENED', '2025-01-20 08:30:00', 'Case opened: file server encrypted, ransom note found', 3),
  (2, 'STATUS_CHANGED', '2025-01-20 09:15:00', 'Status changed from OPEN to ACTIVE', 3),
  (2, 'EVIDENCE_LINKED', '2025-01-22 10:00:00', 'Linked network capture from the gateway', 3),
  (2, 'ASSET_LINKED', '2025-01-23 12:40:00', 'Linked command-and-control IP 203.0.113.45', 3),
  (2, 'NOTE', '2025-01-25 16:20:00', 'Initial access traced to a service account login at 02:14', 7),
  (3, 'OPENED', '2025-02-03 10:15:00', 'Case opened: large transfers to a personal cloud account', 2),
  (3, 'EVIDENCE_LINKED', '2025-02-05 09:30:00', 'Linked disk image of the employee workstation', 2),
  (3, 'ASSET_LINKED', '2025-02-06 14:00:00', 'Linked external IP 198.51.100.23', 2),
  (3, 'NOTE', '2025-02-10 11:45:00', 'Employee had access to the repository for 6 months', 8),
  (4, 'OPENED', '2025-02-12 11:00:00', 'Case opened: staff received credential-harvesting emails', 4),
  (4, 'STATUS_CHANGED', '2025-02-13 09:00:00', 'Status changed from OPEN to ACTIVE', 4),
  (4, 'NOTE', '2025-03-10 15:30:00', 'Spoofed sender domain identified and reported for takedown', 6),
  (4, 'CASE_CLOSED', '2025-04-02 16:00:00', 'Case closed: domain taken down, passwords reset', 4),
  (5, 'OPENED', '2025-03-01 09:45:00', 'Case opened: repeated logins to the CCTV server from an unknown host', 5),
  (5, 'STATUS_CHANGED', '2025-03-02 10:00:00', 'Status changed from OPEN to ACTIVE', 5),
  (5, 'STATUS_CHANGED', '2025-04-15 13:00:00', 'Status changed from ACTIVE to ON_HOLD', 5),
  (6, 'OPENED', '2025-03-18 14:20:00', 'Case opened: duplicate invoices from a new vendor', 2),
  (6, 'EVIDENCE_LINKED', '2025-03-20 10:10:00', 'Linked scanned invoices and mailbox archive', 2),
  (6, 'ASSET_LINKED', '2025-03-21 11:00:00', 'Linked vendor billing email address', 2),
  (6, 'NOTE', '2025-03-28 17:00:00', 'Bank account on the invoices belongs to a shell company', 7),
  (7, 'OPENED', '2025-04-05 09:10:00', 'Case opened: laptop stolen from a car', 3),
  (7, 'EVIDENCE_LINKED', '2025-04-07 12:00:00', 'Linked mobile device image used with the laptop', 3),
  (7, 'CASE_CLOSED', '2025-05-20 12:00:00', 'Case closed: disk was encrypted, no data exposure confirmed', 3),
  (8, 'OPENED', '2025-05-12 13:00:00', 'Case opened: funds moved to an unknown wallet', 5),
  (8, 'ASSET_LINKED', '2025-05-14 10:30:00', 'Linked suspect wallet address', 5),
  (8, 'NOTE', '2025-05-20 14:15:00', 'Wallet received funds from three other reported cases', 8),
  (9, 'OPENED', '2025-06-02 10:30:00', 'Case opened: vendor documents look altered', 4),
  (9, 'NOTE', '2025-06-05 09:00:00', 'Waiting for original documents from procurement', 4),
  (10, 'OPENED', '2025-06-15 08:00:00', 'Case opened: homepage replaced with a defacement message', 2),
  (10, 'ASSET_LINKED', '2025-06-16 09:30:00', 'Linked attacker IP from the web server log', 2),
  (10, 'CASE_CLOSED', '2025-07-30 17:30:00', 'Case closed: vulnerable plugin patched, access revoked', 2);

INSERT INTO assets (asset_type, identifier, description) VALUES
  ('IP', '203.0.113.45', 'Command-and-control server'),
  ('IP', '198.51.100.23', 'Destination of exfiltrated data'),
  ('IP', '192.0.2.77', 'Internal workstation of the suspect'),
  ('DOMAIN', 'invoices-payments.example.com', 'Domain used on forged invoices'),
  ('DOMAIN', 'secure-login-hr.example.net', 'Credential-harvesting site'),
  ('DOMAIN', 'cdn-update.example.org', 'Malware download host'),
  ('DEVICE', 'SN-LT-4471-XK', 'Stolen laptop'),
  ('DEVICE', 'IMEI 356938035643809', 'Suspect mobile phone'),
  ('DEVICE', 'SN-NAS-0092', 'Network storage unit'),
  ('EMAIL', 'cfo.spoof@example.com', 'Spoofed executive address'),
  ('EMAIL', 'hr-support@example.net', 'Phishing sender'),
  ('EMAIL', 'billing@vendor-example.com', 'Vendor billing contact'),
  ('ACCOUNT', 'svc_backup', 'Service account used for initial access'),
  ('ACCOUNT', 'jdoe.admin', 'Administrator account of the suspect'),
  ('ACCOUNT', 'finance-ro', 'Read-only finance account'),
  ('WALLET', 'bc1q-example-fraud-0001', 'Wallet that received diverted funds'),
  ('WALLET', 'bc1q-example-ransom-0002', 'Ransom payment wallet'),
  ('IP', '203.0.113.99', 'Attacker IP in the web server log'),
  ('DOMAIN', 'paste-mirror.example.com', 'Used to share stolen data'),
  ('DEVICE', 'SN-CAM-SRV-17', 'CCTV recording server');

INSERT INTO investigation_assets (investigation_id, asset_id) VALUES
  (1, 10),
  (1, 15),
  (1, 14),
  (2, 1),
  (2, 13),
  (2, 17),
  (2, 6),
  (3, 2),
  (3, 1),
  (3, 14),
  (3, 19),
  (3, 3),
  (4, 5),
  (4, 11),
  (5, 13),
  (5, 20),
  (5, 3),
  (6, 12),
  (6, 4),
  (6, 10),
  (7, 7),
  (7, 8),
  (8, 16),
  (8, 2),
  (8, 17),
  (10, 18);
