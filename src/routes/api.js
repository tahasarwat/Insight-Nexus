const express = require("express");
const pool = require("../config/db");
const analytics = require("../services/analyticsService");

const router = express.Router();

router.get("/health", async (_req, res) => {
  const { rows } = await pool.query("SELECT NOW() AS now");
  res.json({ ok: true, dbTime: rows[0].now });
});

router.get("/kpis", async (_req, res) => {
  const query = `
    SELECT
      COUNT(*) FILTER (WHERE order_status = 'completed') AS total_orders,
      COUNT(DISTINCT customer_id) FILTER (WHERE order_status = 'completed') AS active_customers,
      SUM(sales_amount) FILTER (WHERE order_status = 'completed')::numeric(14,2) AS total_revenue,
      AVG(sales_amount) FILTER (WHERE order_status = 'completed')::numeric(12,2) AS avg_order_value
    FROM fact_sales`;
  const { rows } = await pool.query(query);
  res.json(rows[0]);
});

router.get("/analytics/top-customers", async (req, res) => {
  const limit = Number(req.query.limit || 5);
  const rows = await analytics.topCustomers(limit);
  res.json(rows);
});

router.get("/analytics/sales-by-category", async (_req, res) => {
  const rows = await analytics.salesByCategory();
  res.json(rows);
});

router.get("/analytics/monthly-growth", async (_req, res) => {
  const rows = await analytics.monthlyRevenueGrowth();
  res.json(rows);
});

router.get("/analytics/segments", async (_req, res) => {
  const rows = await analytics.customerLoyaltySegments();
  res.json(rows);
});

router.get("/analytics/recent-sales", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 15), 1), 100);
  const rows = await analytics.recentSales(limit);
  res.json(rows);
});

router.get("/analytics/customer-360/:id", async (req, res) => {
  const customerId = Number(req.params.id);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return res.status(400).json({ error: "Invalid customer id" });
  }
  const result = await analytics.customer360(customerId);
  if (!result) return res.status(404).json({ error: "Customer not found" });
  res.json(result);
});

router.get("/analytics/anomalies/daily-sales", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 12), 1), 100);
  const rows = await analytics.dailySalesAnomalies(limit);
  res.json(rows);
});

router.get("/analytics/revenue-forecast", async (req, res) => {
  const months = Number(req.query.months || 6);
  const growthPct = Number(req.query.growthPct || 6);
  const result = await analytics.revenueForecast(months, growthPct);
  res.json(result);
});

router.get("/customers", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 200), 1), 1000);
  const offset = Math.max(Number(req.query.offset || 0), 0);
  const name = (req.query.name || "").trim();

  let query = "SELECT * FROM dim_customers";
  const params = [];

  if (name) {
    params.push(`%${name}%`);
    query += ` WHERE name ILIKE $${params.length}`;
  }

  params.push(limit, offset);
  query += ` ORDER BY customer_id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const { rows } = await pool.query(query, params);
  res.json(rows);
});

router.post("/customers", async (req, res) => {
  const { name, city, state, country, age_group, gender, signup_date } = req.body;
  const q = `
    INSERT INTO dim_customers
      (name, city, state, country, age_group, gender, signup_date, segment_label)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'new')
    RETURNING *`;
  const { rows } = await pool.query(q, [name, city, state, country || "USA", age_group, gender, signup_date]);
  res.status(201).json(rows[0]);
});

router.put("/customers/:id", async (req, res) => {
  const { id } = req.params;
  const { name, city, state, country, age_group, gender, segment_label } = req.body;
  const q = `
    UPDATE dim_customers
    SET name = $1, city = $2, state = $3, country = $4, age_group = $5, gender = $6, segment_label = $7
    WHERE customer_id = $8
    RETURNING *`;
  const { rows } = await pool.query(q, [name, city, state, country, age_group, gender, segment_label, id]);
  if (!rows[0]) return res.status(404).json({ error: "Customer not found" });
  res.json(rows[0]);
});

router.post("/sales", async (req, res) => {
  const { customer_id, product_id, full_date, quantity, unit_price, discount_pct } = req.body;
  const timeResult = await pool.query("SELECT time_id FROM dim_time WHERE full_date = $1", [full_date]);
  if (!timeResult.rows[0]) return res.status(400).json({ error: "Date not found in dim_time" });
  const time_id = timeResult.rows[0].time_id;
  const gross = Number(quantity) * Number(unit_price);
  const sales_amount = Number((gross * (1 - Number(discount_pct || 0) / 100)).toFixed(2));
  const q = `
    INSERT INTO fact_sales
      (customer_id, product_id, time_id, quantity, unit_price, discount_pct, sales_amount, order_status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')
    RETURNING *`;
  const { rows } = await pool.query(q, [customer_id, product_id, time_id, quantity, unit_price, discount_pct || 0, sales_amount]);
  res.status(201).json(rows[0]);
});

router.patch("/sales/:id/cancel", async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    "UPDATE fact_sales SET order_status = 'cancelled' WHERE sale_id = $1 RETURNING *",
    [id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Sale not found" });
  res.json(rows[0]);
});

module.exports = router;
