const pool = require("../config/db");

async function topCustomers(limit = 5) {
  const { rows } = await pool.query(
    `SELECT c.customer_id, c.name, SUM(f.sales_amount)::numeric(12,2) AS total_spending
     FROM fact_sales f
     JOIN dim_customers c ON f.customer_id = c.customer_id
     WHERE f.order_status = 'completed'
     GROUP BY c.customer_id, c.name
     ORDER BY total_spending DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

async function salesByCategory() {
  const { rows } = await pool.query(
    `SELECT p.category, SUM(f.sales_amount)::numeric(12,2) AS category_sales
     FROM fact_sales f
     JOIN dim_products p ON f.product_id = p.product_id
     WHERE f.order_status = 'completed'
     GROUP BY p.category
     ORDER BY category_sales DESC`
  );
  return rows;
}

async function monthlyRevenueGrowth() {
  const { rows } = await pool.query(
    `WITH monthly_sales AS (
        SELECT t.year, t.month, SUM(f.sales_amount)::numeric(12,2) AS revenue
        FROM fact_sales f
        JOIN dim_time t ON f.time_id = t.time_id
        WHERE f.order_status = 'completed'
        GROUP BY t.year, t.month
      )
      SELECT year, month, revenue,
             LAG(revenue) OVER (ORDER BY year, month) AS prev_revenue,
             (revenue - LAG(revenue) OVER (ORDER BY year, month))::numeric(12,2) AS growth
      FROM monthly_sales
      ORDER BY year, month`
  );
  return rows;
}

async function customerLoyaltySegments() {
  const { rows } = await pool.query(
    `WITH customer_metrics AS (
       SELECT
         c.customer_id,
         c.name,
         COALESCE(MAX(t.full_date), c.signup_date) AS last_purchase_date,
         COUNT(f.sale_id) AS frequency,
         COALESCE(SUM(f.sales_amount), 0)::numeric(12,2) AS monetary
       FROM dim_customers c
       LEFT JOIN fact_sales f
         ON c.customer_id = f.customer_id
         AND f.order_status = 'completed'
       LEFT JOIN dim_time t ON f.time_id = t.time_id
       GROUP BY c.customer_id, c.name, c.signup_date
     ),
     scored AS (
       SELECT *,
         (CURRENT_DATE - last_purchase_date) AS recency_days,
         NTILE(4) OVER (ORDER BY (CURRENT_DATE - last_purchase_date) ASC) AS recency_rank,
         NTILE(4) OVER (ORDER BY frequency DESC) AS freq_rank,
         NTILE(4) OVER (ORDER BY monetary DESC) AS monetary_rank
       FROM customer_metrics
     )
     SELECT customer_id, name, recency_days, frequency, monetary,
       CASE
         WHEN recency_rank >= 3 AND freq_rank >= 3 AND monetary_rank >= 3 THEN 'loyal'
         WHEN recency_rank = 1 AND freq_rank = 1 THEN 'at-risk'
         WHEN frequency = 0 THEN 'inactive'
         ELSE 'regular'
       END AS segment
     FROM scored
     ORDER BY monetary DESC, frequency DESC
     LIMIT 50`
  );
  return rows;
}

async function recentSales(limit = 15) {
  const { rows } = await pool.query(
    `SELECT
      f.sale_id,
      f.customer_id,
      c.name AS customer_name,
      p.product_name,
      p.category,
      f.quantity,
      f.sales_amount::numeric(12,2) AS sales_amount,
      f.order_status,
      t.full_date
    FROM fact_sales f
    JOIN dim_customers c ON f.customer_id = c.customer_id
    JOIN dim_products p ON f.product_id = p.product_id
    JOIN dim_time t ON f.time_id = t.time_id
    ORDER BY f.sale_id DESC
    LIMIT $1`,
    [limit]
  );
  return rows;
}

async function customer360(customerId) {
  const profileResult = await pool.query(
    `SELECT customer_id, name, city, state, country, age_group, gender, signup_date, segment_label
     FROM dim_customers
     WHERE customer_id = $1`,
    [customerId]
  );

  if (!profileResult.rows[0]) {
    return null;
  }

  const metricsResult = await pool.query(
    `SELECT
      COUNT(*) FILTER (WHERE f.order_status = 'completed') AS completed_orders,
      COALESCE(SUM(f.sales_amount) FILTER (WHERE f.order_status = 'completed'), 0)::numeric(12,2) AS lifetime_value,
      COALESCE(AVG(f.sales_amount) FILTER (WHERE f.order_status = 'completed'), 0)::numeric(12,2) AS avg_order_value,
      MAX(t.full_date) FILTER (WHERE f.order_status = 'completed') AS last_order_date
     FROM fact_sales f
     LEFT JOIN dim_time t ON f.time_id = t.time_id
     WHERE f.customer_id = $1`,
    [customerId]
  );

  const recentOrdersResult = await pool.query(
    `SELECT
      f.sale_id,
      t.full_date,
      p.product_name,
      p.category,
      f.quantity,
      f.sales_amount::numeric(12,2) AS sales_amount,
      f.order_status
    FROM fact_sales f
    JOIN dim_products p ON f.product_id = p.product_id
    JOIN dim_time t ON f.time_id = t.time_id
    WHERE f.customer_id = $1
    ORDER BY f.sale_id DESC
    LIMIT 10`,
    [customerId]
  );

  return {
    profile: profileResult.rows[0],
    metrics: metricsResult.rows[0],
    recentOrders: recentOrdersResult.rows,
  };
}

async function dailySalesAnomalies(limit = 12) {
  const { rows } = await pool.query(
    `WITH daily AS (
      SELECT
        t.full_date,
        SUM(f.sales_amount)::numeric(12,2) AS revenue
      FROM fact_sales f
      JOIN dim_time t ON f.time_id = t.time_id
      WHERE f.order_status = 'completed'
      GROUP BY t.full_date
    ),
    stats AS (
      SELECT
        AVG(revenue)::numeric(12,2) AS avg_revenue,
        STDDEV_POP(revenue)::numeric(12,2) AS std_revenue
      FROM daily
    )
    SELECT
      d.full_date,
      d.revenue,
      s.avg_revenue,
      s.std_revenue,
      CASE
        WHEN COALESCE(s.std_revenue, 0) = 0 THEN 0
        ELSE ROUND(((d.revenue - s.avg_revenue) / NULLIF(s.std_revenue, 0))::numeric, 2)
      END AS z_score
    FROM daily d
    CROSS JOIN stats s
    WHERE COALESCE(s.std_revenue, 0) > 0
      AND ABS((d.revenue - s.avg_revenue) / NULLIF(s.std_revenue, 0)) >= 1.5
    ORDER BY ABS((d.revenue - s.avg_revenue) / NULLIF(s.std_revenue, 0)) DESC, d.full_date DESC
    LIMIT $1`,
    [limit]
  );
  return rows;
}

async function revenueForecast(months = 6, growthPct = 6) {
  const boundedMonths = Math.min(Math.max(Number(months) || 6, 1), 12);
  const boundedGrowth = Math.min(Math.max(Number(growthPct) || 0, -50), 100);

  const { rows } = await pool.query(
    `WITH monthly AS (
      SELECT
        t.year,
        t.month,
        SUM(f.sales_amount)::numeric(12,2) AS revenue
      FROM fact_sales f
      JOIN dim_time t ON f.time_id = t.time_id
      WHERE f.order_status = 'completed'
      GROUP BY t.year, t.month
    ),
    baseline AS (
      SELECT COALESCE(AVG(revenue), 0)::numeric(12,2) AS base_revenue
      FROM (
        SELECT revenue
        FROM monthly
        ORDER BY year DESC, month DESC
        LIMIT 3
      ) recent
    ),
    forecast AS (
      SELECT
        generate_series(1, $1::int) AS month_index,
        (SELECT base_revenue FROM baseline) AS base_revenue
    )
    SELECT
      month_index,
      ROUND((base_revenue * POWER(1 + ($2::numeric / 100), month_index))::numeric, 2) AS projected_revenue
    FROM forecast`,
    [boundedMonths, boundedGrowth]
  );

  return {
    assumptions: {
      months: boundedMonths,
      growthPct: boundedGrowth,
    },
    forecast: rows,
  };
}

module.exports = {
  topCustomers,
  salesByCategory,
  monthlyRevenueGrowth,
  customerLoyaltySegments,
  recentSales,
  customer360,
  dailySalesAnomalies,
  revenueForecast,
};
