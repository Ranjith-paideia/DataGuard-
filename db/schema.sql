-- ============================================================================
-- DataGuard API: Database Schema Definition
-- Engine: Microsoft SQL Server (T-SQL)
-- Idempotent schema initialization for SSMS 22 / SQL Server Express
-- ============================================================================

IF DB_ID(N'DataGuardTest') IS NULL
BEGIN
    CREATE DATABASE DataGuardTest;
END;
GO

USE DataGuardTest;
GO

-- 1. dbo.users table
IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        email NVARCHAR(255) NOT NULL UNIQUE,
        role NVARCHAR(50) NOT NULL CHECK (role IN ('admin', 'viewer')),
        api_token NVARCHAR(255) NOT NULL UNIQUE,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;
GO

-- 2. dbo.orders table
IF OBJECT_ID(N'dbo.orders', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.orders (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT NOT NULL FOREIGN KEY REFERENCES dbo.users(id),
        item_name NVARCHAR(150) NOT NULL,
        quantity INT NOT NULL CHECK (quantity > 0),
        amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
        status NVARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED')),
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;
GO

-- 3. dbo.audit_logs table
IF OBJECT_ID(N'dbo.audit_logs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.audit_logs (
        id INT IDENTITY(1,1) PRIMARY KEY,
        entity_type NVARCHAR(50) NOT NULL,
        entity_id INT NOT NULL,
        action NVARCHAR(50) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;
GO
