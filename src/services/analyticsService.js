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

module.exports = {
  topCustomers,
  salesByCategory,
  monthlyRevenueGrowth,
  customerLoyaltySegments,
};
