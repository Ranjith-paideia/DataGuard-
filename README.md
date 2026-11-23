# DataGuard API — Microservices Contract & SQL Integrity Engine

[![DataGuard CI](https://github.com/Ranjith-paideia/DataGuard-/actions/workflows/ci.yml/badge.svg)](https://github.com/Ranjith-paideia/DataGuard-/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%20%7C%20ES2022-blue.svg)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-Test-green.svg)](https://playwright.dev/)
[![Microsoft SQL Server](https://img.shields.io/badge/Database-MSSQL%20%2F%20T--SQL-red.svg)](https://www.microsoft.com/sql-server/)

**DataGuard API** is an enterprise-grade automated contract verification and SQL integrity engine. It validates microservice API contracts, latency thresholds, boundary conditions, role-based access control (RBAC), and transactional database state consistency against **Microsoft SQL Server Express** using **TypeScript**, **Node.js**, **Express**, **Zod**, and **Playwright Test**.

---

## 🏗 Architecture Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                      Playwright Test                        │
│               (Contract & Integrity Engine)                 │
└──────────────┬───────────────────────────────┬──────────────┘
               │ (HTTP API Client)             │ (Direct T-SQL Client)
               │ Zod Contract Validation       │ Parameterized Queries
               │ Latency Benchmarks            │ State Verification
               ▼                               ▼
┌──────────────────────────────┐        ┌─────────────────────┐
│    Express Mock Service      │        │ Microsoft SQL Server│
│   (RBAC, Zod, Validation)    │───────▶│    Express (T-SQL)  │
│       Port: 3001             │        │      Port: 1433     │
└──────────────────────────────┘        └─────────────────────┘
```

### Key Engineering Capabilities:
1. **Strict Contract Conformance:** Guarantees response structures match compile-time validated Zod schemas (`OrderSchema`, `OrderListSchema`, `ErrorResponseSchema`).
2. **Dual-Layer SQL Integrity Verification:** Every API mutation (`POST`, `PATCH`, `DELETE`) is immediately cross-checked via direct, parameterized T-SQL queries against `dbo.orders` and `dbo.audit_logs`.
3. **Dirty-Row Prevention:** Boundary and negative tests verify that validation failures (e.g. quantity `<= 0`, 151-char names) return `422` and never commit dirty rows to SQL Server.
4. **Sub-Second Performance Benchmarks:** Reusable `ContractClient` tracks latency using high-resolution timers (`performance.now()`), enforcing that responses stay under defined latency thresholds (default: `500ms`).
5. **Robust RBAC:** Validates token-based authentication (`admin` vs `viewer`), guarding mutation endpoints with `401 Unauthorized` and `403 Forbidden` checks.

---

## 📁 Repository Structure

```text
├── tsconfig.json                   # CommonJS / ES2022 TypeScript configuration
├── playwright.config.ts            # Playwright settings (single worker, webServer)
├── db/
│   ├── schema.sql                  # Idempotent T-SQL DDL (users, orders, audit_logs)
│   └── seed.sql                    # Idempotent T-SQL DML (admin/viewer users, baseline order)
├── mock-service/
│   └── server.ts                   # Express mock microservice with T-SQL backend
├── src/
│   ├── db/
│   │   └── sqlServerClient.ts      # Singleton mssql ConnectionPool & parameterized executor
│   ├── schemas/
│   │   └── order.schema.ts         # Zod schemas for orders, input validation, and errors
│   └── api/
│       └── contractClient.ts       # Reusable Playwright API client with latency timing
├── tests/
│   ├── auth.spec.ts                # RBAC and authentication tests (401, 403, 200)
│   ├── contract-latency.spec.ts    # Schema validation & performance threshold tests
│   ├── boundary-negative.spec.ts   # Boundary input validation & dirty-row prevention
│   └── db-integrity.spec.ts        # End-to-end lifecycle & direct SQL state assertions
├── .github/
│   └── workflows/
│       └── ci.yml                  # GitHub Actions CI workflow (Build, Typecheck, Test)
└── README.md
```

---

## ⚙️ Environment Configuration (`.env`)

Create or update `.env` in the project root:

```ini
API_BASE_URL=http://localhost:3001
SQL_SERVER=localhost
SQL_PORT=1433
SQL_USER=dataguard_user
SQL_PASSWORD=YourStrongPasswordHere!
SQL_DATABASE=DataGuardTest
API_LATENCY_THRESHOLD_MS=500
```

> **Important Driver Note:** SQL Server Express connects via static TCP port `1433`. The database client deliberately avoids passing `instanceName` alongside `port` to avoid Tedious driver conflicts.

---

## 🗄️ Database Setup (SQL Server Management Studio 22)

1. Open **SSMS 22** and connect to your SQL Server instance (`localhost\SQLEXPRESS` or `localhost,1433`).
2. Run [`db/schema.sql`](file:///c:/project/data%20guard/db/schema.sql):
   - Creates `DataGuardTest` database idempotently.
   - Creates `dbo.users`, `dbo.orders`, and `dbo.audit_logs` with all primary keys, foreign keys, constraints, and defaults.
3. Run [`db/seed.sql`](file:///c:/project/data%20guard/db/seed.sql):
   - Seeds `admin@dataguard.local` (`valid-admin-token`).
   - Seeds `viewer@dataguard.local` (`valid-viewer-token`).
   - Seeds baseline `CONFIRMED` order.

Both scripts can be executed repeatedly without errors.

---

## 🚀 Running the Project

### 1. Compile & Typecheck
Ensure zero TypeScript compilation errors:
```bash
npm run typecheck
```

### 2. Start the Mock Microservice
Runs the Express service on port 3001 using `tsx`:
```bash
npm run start:mock
```

To verify the service health:
```bash
curl http://localhost:3001/health
# Response: {"status":"ok","db":"connected"}
```

### 3. Run the Playwright Contract & SQL Integrity Suite
Playwright will automatically launch and manage the mock service via `webServer`:
```bash
npm test
```

### 4. Inspect Test Reports
View interactive execution logs, latencies, and step traces:
```bash
npm run test:report
```

---

## 🛡️ Test Suite Highlights

| Suite | Spec File | Coverage Highlights |
|---|---|---|
| **Auth & RBAC** | [`tests/auth.spec.ts`](file:///c:/project/data%20guard/tests/auth.spec.ts) | Missing header (401), invalid tokens (401), viewer write restrictions (403), admin privileges (200/201). |
| **Contract & Latency** | [`tests/contract-latency.spec.ts`](file:///c:/project/data%20guard/tests/contract-latency.spec.ts) | Strict Zod schema parsing, execution times `<= 500ms`, standard error schema compliance. |
| **Boundary & Negative** | [`tests/boundary-negative.spec.ts`](file:///c:/project/data%20guard/tests/boundary-negative.spec.ts) | Empty/long string inputs, out-of-range quantities (`-5`, `0`, `1001`), negative amounts, SQL dirty-row checks. |
| **Database Integrity** | [`tests/db-integrity.spec.ts`](file:///c:/project/data%20guard/tests/db-integrity.spec.ts) | Full E2E lifecycle (`POST` -> `GET` -> `PATCH` -> `DELETE`), asserting exact parity with SQL Server and `dbo.audit_logs`. |

---

## 🔒 Security & Code Standards

- **Parameterized Queries:** 100% of SQL statements utilize parameter binding via `mssql.request().input()` to eliminate SQL injection vulnerabilities.
- **Connection Lifecycle Management:** Test suites invoke `closePool()` in `test.afterAll` to gracefully release SQL Server connections and prevent worker hangs.
- **Clean Worker Environment:** Playwright runs with `workers: 1` and `fullyParallel: false` to ensure deterministic execution without database race conditions.
