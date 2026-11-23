-- ============================================================================
-- DataGuard API: Seed Data
-- Engine: Microsoft SQL Server (T-SQL)
-- Idempotent seed data for SSMS 22 / SQL Server Express
-- ============================================================================

USE DataGuardTest;
GO

-- 1. Seed Admin User
IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE email = 'admin@dataguard.local')
BEGIN
    INSERT INTO dbo.users (email, role, api_token)
    VALUES ('admin@dataguard.local', 'admin', 'valid-admin-token');
END;
GO

-- 2. Seed Viewer User
IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE email = 'viewer@dataguard.local')
BEGIN
    INSERT INTO dbo.users (email, role, api_token)
    VALUES ('viewer@dataguard.local', 'viewer', 'valid-viewer-token');
END;
GO

-- 3. Seed Baseline Order linked to Admin User
DECLARE @adminUserId INT;
SELECT @adminUserId = id FROM dbo.users WHERE email = 'admin@dataguard.local';

IF @adminUserId IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM dbo.orders 
    WHERE item_name = 'Baseline Security License' 
      AND user_id = @adminUserId
)
BEGIN
    INSERT INTO dbo.orders (user_id, item_name, quantity, amount, status)
    VALUES (@adminUserId, 'Baseline Security License', 1, 199.99, 'CONFIRMED');
END;
GO
