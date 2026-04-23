const pool = require("../config/db");

const ddl = `
CREATE TABLE IF NOT EXISTS dim_customers (
  customer_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'USA',
  age_group TEXT NOT NULL,
  gender TEXT NOT NULL,
  signup_date DATE NOT NULL,
  segment_label TEXT NOT NULL DEFAULT 'new'
);

CREATE TABLE IF NOT EXISTS dim_products (
  product_id SERIAL PRIMARY KEY,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  base_price NUMERIC(10,2) NOT NULL CHECK (base_price >= 0)
);

CREATE TABLE IF NOT EXISTS dim_time (
  time_id SERIAL PRIMARY KEY,
  full_date DATE NOT NULL UNIQUE,
  day_of_week TEXT NOT NULL,
  month INT NOT NULL,
  month_name TEXT NOT NULL,
  quarter INT NOT NULL,
  year INT NOT NULL
);

CREATE TABLE IF NOT EXISTS fact_sales (
  sale_id BIGSERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES dim_customers(customer_id),
  product_id INT NOT NULL REFERENCES dim_products(product_id),
  time_id INT NOT NULL REFERENCES dim_time(time_id),
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  sales_amount NUMERIC(12,2) NOT NULL CHECK (sales_amount >= 0),
  order_status TEXT NOT NULL DEFAULT 'completed' CHECK (order_status IN ('completed', 'cancelled')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fact_sales_customer_id ON fact_sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_fact_sales_product_id ON fact_sales(product_id);
CREATE INDEX IF NOT EXISTS idx_fact_sales_time_id ON fact_sales(time_id);
CREATE INDEX IF NOT EXISTS idx_dim_products_category ON dim_products(category);
CREATE INDEX IF NOT EXISTS idx_dim_time_year_month ON dim_time(year, month);
`;

async function initDb() {
  try {
    await pool.query(ddl);
    console.log("Schema initialized.");
  } catch (error) {
    console.error("Failed to initialize schema:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

initDb();
