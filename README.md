# Insight Nexus

Full-stack website + PostgreSQL data warehouse for e-commerce analytics, implemented from your Mid-Way Report requirements.

## Tech Stack
- Node.js + Express backend
- PostgreSQL 18 database
- HTML/CSS/JS dashboard frontend

## Features Implemented
- Star schema warehouse:
  - `dim_customers`
  - `dim_products`
  - `dim_time`
  - `fact_sales`
- Referential integrity with PK/FK constraints.
- Performance indexes on key fact and dimension columns.
- Seed generator with report-aligned synthetic volume:
  - 200 customers
  - 100 products
  - 365 dates
  - 2000 sales transactions
- CRUD support:
  - Create + update customers
  - Insert fact sales
  - Cancel sale records
- Analytical APIs:
  - Top customers by total spending
  - Sales by product category
  - Monthly revenue growth with CTE + window function
  - Loyalty segmentation using recency/frequency/monetary logic
- Interactive dashboard showing KPIs and query outputs.

## Setup
1. Create DB in PostgreSQL 18:
   - `CREATE DATABASE insight_nexus;`
2. Copy env:
   - `cp .env.example .env`
3. Update `.env` if needed (username/password/port).
4. Install dependencies:
   - `npm install`
5. Initialize schema:
   - `npm run db:init`
6. Seed data:
   - `npm run db:seed`
7. Start app:
   - `npm run dev` (or `npm start`)

App URL: `http://localhost:4000`

## Core API Endpoints
- `GET /api/health`
- `GET /api/kpis`
- `GET /api/analytics/top-customers`
- `GET /api/analytics/sales-by-category`
- `GET /api/analytics/monthly-growth`
- `GET /api/analytics/segments`
- `POST /api/customers`
- `PUT /api/customers/:id`
- `POST /api/sales`
- `PATCH /api/sales/:id/cancel`
