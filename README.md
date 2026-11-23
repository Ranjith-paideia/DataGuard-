# DataGuard API — Microservices Contract & SQL/MySQL Integrity Engine

[![DataGuard CI](https://github.com/Ranjith-paideia/DataGuard-/actions/workflows/ci.yml/badge.svg)](https://github.com/Ranjith-paideia/DataGuard-/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%20%7C%20ES2022-blue.svg)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-Test-green.svg)](https://playwright.dev/)
[![Microsoft SQL Server](https://img.shields.io/badge/Database-MSSQL%20%2F%20T--SQL-red.svg)](https://www.microsoft.com/sql-server/)
[![MySQL](https://img.shields.io/badge/Database-MySQL%208.0-orange.svg)](https://www.mysql.com/)

**DataGuard API** is an enterprise-grade automated microservices contract verification and relational database integrity engine. It validates API contracts, latency thresholds, boundary conditions, role-based access control (RBAC), standalone JSON Schema contracts (Draft-07), and transactional state consistency across **Microsoft SQL Server Express** and **MySQL 8.0** using **TypeScript**, **Node.js**, **Express**, **Zod**, **Ajv**, **Postman**, and **Playwright Test**.

---

## 🏗 Architecture Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                      Playwright Test                        │
│               (Contract & Integrity Engine)                 │
└──────────────┬───────────────────────────────┬──────────────┘
               │ (HTTP API Client)             │ Dialect-Safe DB Client
               │ Zod & JSON Schema Validation  │ Parameterized Queries
               │ Latency Benchmarks            │ State Verification
               ▼                               ▼
┌──────────────────────────────┐        ┌─────────────────────┐
│    Express Mock Service      │        │ Microsoft SQL Server│
│   (RBAC, Zod, Validation)    │───────▶│    Express (T-SQL)  │
│       Port: 3001             │        │      Port: 1433     │
└──────────────┬───────────────┘        └─────────────────────┘
               │                                   or
               │                        ┌─────────────────────┐
               └───────────────────────▶│      MySQL 8.0      │
                                        │      Port: 3306     │
                                        └─────────────────────┘
```

### Key Engineering Capabilities:
1. **Strict Contract Conformance:** Guarantees response structures match compile-time validated Zod schemas (`OrderSchema`, `OrderListSchema`, `ErrorResponseSchema`) and standalone JSON Schema Draft-07 contracts (`contracts/*.schema.json`) via `Ajv`.
2. **Dual-Layer SQL Integrity Verification:** Every API mutation (`POST`, `PATCH`, `DELETE`) is immediately cross-checked via direct, parameterized SQL queries against `orders` and `audit_logs` in either Microsoft SQL Server (`DB_DIALECT=mssql`) or MySQL (`DB_DIALECT=mysql`).
3. **Dirty-Row Prevention:** Boundary and negative tests verify that validation failures (e.g. quantity `<= 0`, 151-char names) return `422` and never commit dirty rows to the database.
4. **Sub-Second Performance Benchmarks:** Reusable `ContractClient` tracks latency using high-resolution timers (`performance.now()`), enforcing that responses stay under defined latency thresholds (default: `500ms`).
5. **Robust RBAC:** Validates token-based authentication (`admin` vs `viewer`), guarding mutation endpoints with `401 Unauthorized` and `403 Forbidden` checks.
6. **Live Banking API Practice Suite:** Dedicated Playwright project testing live endpoints on **ParaBank** (`https://parabank.parasoft.com/parabank/services/bank/`), validating customer authentication, account listings, balance transfers, and negative/boundary cases.
7. **Postman v2.1.0 Artifacts:** Complete collection and environment in `postman/` with built-in test scripts for manual exploration or automated runs.

---

## 📁 Repository Structure

```text
├── contracts/
│   ├── order.schema.json               # JSON Schema Draft-07 for single Order
│   ├── order-list.schema.json          # JSON Schema Draft-07 for Order array
│   └── error.schema.json               # JSON Schema Draft-07 for Error response
├── db/
│   ├── schema.sql                      # Idempotent T-SQL DDL (MSSQL: users, orders, audit_logs)
│   ├── seed.sql                        # Idempotent T-SQL DML (MSSQL: admin/viewer, baseline order)
│   └── mysql/
│       ├── schema.sql                  # Idempotent MySQL 8.0 DDL
│       └── seed.sql                    # Idempotent MySQL 8.0 DML
├── mock-service/
│   └── server.ts                       # Express mock service using dialect-safe dbClient
├── postman/
│   ├── DataGuard_API.postman_collection.json    # Postman v2.1.0 collection with tests
│   └── DataGuard_Local.postman_environment.json # Postman local environment variables
├── scripts/
│   └── setup-mysql.ts                  # Script to initialize MySQL schema and seed data
├── src/
│   ├── db/
│   │   ├── dbClient.ts                 # Unified repository routing between MSSQL and MySQL
│   │   ├── sqlServerClient.ts          # Singleton mssql ConnectionPool & parameterized executor
│   │   └── mysqlClient.ts              # Singleton mysql2/promise pool with decimalNumbers
│   ├── schemas/
│   │   ├── order.schema.ts             # Zod schemas for orders, input validation, and errors
│   │   └── parabank.schema.ts          # Zod schemas for ParaBank customer and account contracts
│   └── api/
│       └── contractClient.ts           # Reusable Playwright API client with latency timing (GET/POST/PUT/PATCH/DELETE)
├── tests/
│   ├── auth.spec.ts                    # RBAC and authentication tests (401, 403, 200)
│   ├── contract-latency.spec.ts        # Zod & JSON Schema validation + latency threshold tests
│   ├── boundary-negative.spec.ts       # Boundary input validation & dirty-row prevention
│   ├── db-integrity.spec.ts            # End-to-end lifecycle & direct SQL state assertions
│   └── parabank/
│       ├── parabank-auth-accounts.spec.ts      # ParaBank demo login, customer extraction & accounts
│       └── parabank-transfer-negative.spec.ts  # ParaBank account balance transfer & boundary cases
├── .github/
│   └── workflows/
│       └── ci.yml                      # Dual-job CI: MySQL container integrity + ParaBank tests
├── tsconfig.json                       # CommonJS / ES2022 TypeScript configuration
├── playwright.config.ts                # Multi-project Playwright configuration (dataguard-local & parabank)
└── README.md
```

---

## ⚙️ Environment Configuration (`.env`)

Configure `.env` in the project root:

```ini
API_BASE_URL=http://localhost:3001
API_LATENCY_THRESHOLD_MS=500

# Database Dialect Selection: 'mssql' (default) or 'mysql'
DB_DIALECT=mssql

# Microsoft SQL Server (Local Express)
SQL_SERVER=localhost
SQL_PORT=1433
SQL_USER=dataguard_user
SQL_PASSWORD=DataGuard@123
SQL_DATABASE=DataGuardTest

# MySQL 8.0 (Container or Local)
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=dataguard_user
MYSQL_PASSWORD=DataGuard@123
MYSQL_DATABASE=dataguard_test

# ParaBank Live Banking REST API
PARABANK_BASE_URL=https://parabank.parasoft.com/parabank/services/bank
PARABANK_USER=john
PARABANK_PASSWORD=demo
PARABANK_LATENCY_THRESHOLD_MS=5000
```

---

## 🗄️ Database Setup

### Option A: Microsoft SQL Server (SSMS 22 / SQL Server Express)
1. Open **SSMS 22** and connect to your SQL Server instance (`localhost\SQLEXPRESS` or `localhost,1433`).
2. Run [`db/schema.sql`](file:///c:/project/data%20guard/db/schema.sql) (creates `DataGuardTest` database and tables idempotently).
3. Run [`db/seed.sql`](file:///c:/project/data%20guard/db/seed.sql) (seeds admin, viewer, and baseline order).

### Option B: MySQL 8.0
1. Ensure MySQL 8.0 is running locally or in Docker.
2. Run the automated TypeScript setup script:
   ```bash
   npm run db:setup:mysql
   ```

---

## 🚀 Running the Project

### 1. Compile & Typecheck
Ensure zero TypeScript compilation errors:
```bash
npm run typecheck
```

### 2. Start the Mock Microservice Manually
Runs the Express service on port 3001 using `tsx`:
```bash
npm run start:mock
```

To verify the service health:
```bash
curl http://localhost:3001/health
# Response: {"status":"ok","db":"connected"}
```

### 3. Run the Playwright Test Suites

**DataGuard Local Suite** (automatically launches the mock service and asserts against SQL Server or MySQL based on `DB_DIALECT`):
```bash
npm run test:dataguard
# or default: npm test
```

**ParaBank Practice Suite** (tests live remote ParaBank Banking API):
```bash
npm run test:parabank
```

### 4. Inspect Test Reports
View interactive execution logs, latencies, and step traces:
```bash
npm run test:report
```

---

## 📮 Postman Collection & Environment

Import the preconfigured artifacts into Postman:
1. **Collection:** [`postman/DataGuard_API.postman_collection.json`](file:///c:/project/data%20guard/postman/DataGuard_API.postman_collection.json)
2. **Environment:** [`postman/DataGuard_Local.postman_environment.json`](file:///c:/project/data%20guard/postman/DataGuard_Local.postman_environment.json)

The collection covers health check, unauthorized access (401), authorized reading (200), viewer restriction (403), boundary payload validation (422), admin order creation (201, dynamically captures `orderId`), status update (200), and cleanup deletion (200).
