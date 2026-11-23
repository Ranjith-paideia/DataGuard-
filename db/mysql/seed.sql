-- ============================================================================
-- DataGuard API: MySQL 8.0 Seed Data
-- Engine: MySQL 8.0
-- Idempotent seed data
-- ============================================================================

USE dataguard_test;

-- 1. Seed Admin User
INSERT IGNORE INTO users (email, role, api_token)
VALUES ('admin@dataguard.local', 'admin', 'valid-admin-token');

-- 2. Seed Viewer User
INSERT IGNORE INTO users (email, role, api_token)
VALUES ('viewer@dataguard.local', 'viewer', 'valid-viewer-token');

-- 3. Seed Baseline Order linked to Admin User
INSERT IGNORE INTO orders (user_id, item_name, quantity, amount, status)
SELECT id, 'Baseline Security License', 1, 199.99, 'CONFIRMED'
FROM users
WHERE email = 'admin@dataguard.local'
AND NOT EXISTS (
    SELECT 1 FROM orders
    WHERE item_name = 'Baseline Security License'
    AND user_id = (SELECT id FROM users WHERE email = 'admin@dataguard.local')
);
