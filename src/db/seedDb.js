const pool = require("../config/db");

const firstNames = ["Alex", "Jordan", "Taylor", "Morgan", "Avery", "Riley", "Casey", "Drew", "Skyler", "Jamie"];
const lastNames = ["Smith", "Johnson", "Lee", "Brown", "Davis", "Wilson", "Clark", "Lewis", "Walker", "Hall"];
const cities = [
  { city: "New York", state: "NY" },
  { city: "San Francisco", state: "CA" },
  { city: "Seattle", state: "WA" },
  { city: "Austin", state: "TX" },
  { city: "Chicago", state: "IL" },
  { city: "Boston", state: "MA" },
];
const categories = {
  Electronics: ["Phones", "Laptops", "Accessories"],
  Fashion: ["Men", "Women", "Shoes"],
  Home: ["Kitchen", "Furniture", "Decor"],
  Beauty: ["Skincare", "Makeup", "Haircare"],
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDateInYear(year) {
  const start = new Date(`${year}-01-01T00:00:00`);
  const end = new Date(`${year}-12-31T00:00:00`);
  const ts = randomInt(start.getTime(), end.getTime());
  return new Date(ts);
}

function toIsoDate(d) {
  return d.toISOString().split("T")[0];
}

function monthName(m) {
  return new Date(2000, m - 1, 1).toLocaleString("en-US", { month: "long" });
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query("TRUNCATE fact_sales, dim_customers, dim_products, dim_time RESTART IDENTITY CASCADE");

    // 365 records in time dimension.
    for (let day = 0; day < 365; day += 1) {
      const date = new Date("2025-01-01T00:00:00");
      date.setDate(date.getDate() + day);
      const m = date.getMonth() + 1;
      await client.query(
        `INSERT INTO dim_time (full_date, day_of_week, month, month_name, quarter, year)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          toIsoDate(date),
          date.toLocaleString("en-US", { weekday: "long" }),
          m,
          monthName(m),
          Math.ceil(m / 3),
          date.getFullYear(),
        ]
      );
    }

    // 200 customers
    for (let i = 0; i < 200; i += 1) {
      const loc = pick(cities);
      const name = `${pick(firstNames)} ${pick(lastNames)}`;
      const ageGroup = pick(["18-24", "25-34", "35-44", "45-54", "55+"]);
      const gender = pick(["male", "female", "non-binary"]);
      const signupDate = toIsoDate(randomDateInYear(2024));
      await client.query(
        `INSERT INTO dim_customers
          (name, city, state, country, age_group, gender, signup_date, segment_label)
         VALUES ($1, $2, $3, 'USA', $4, $5, $6, 'new')`,
        [name, loc.city, loc.state, ageGroup, gender, signupDate]
      );
    }

    // 100 products
    for (let i = 1; i <= 100; i += 1) {
      const category = pick(Object.keys(categories));
      const subcategory = pick(categories[category]);
      const productName = `${subcategory} Item ${i}`;
      const basePrice = Number((Math.random() * 450 + 20).toFixed(2));
      await client.query(
        `INSERT INTO dim_products (product_name, category, subcategory, base_price)
         VALUES ($1, $2, $3, $4)`,
        [productName, category, subcategory, basePrice]
      );
    }

    // 2000 fact rows
    for (let i = 0; i < 2000; i += 1) {
      const customerId = randomInt(1, 200);
      const productId = randomInt(1, 100);
      const timeId = randomInt(1, 365);
      const quantity = randomInt(1, 5);
      const unitPrice = Number((Math.random() * 450 + 20).toFixed(2));
      const discountPct = Number((Math.random() * 20).toFixed(2));
      const gross = quantity * unitPrice;
      const salesAmount = Number((gross * (1 - discountPct / 100)).toFixed(2));
      await client.query(
        `INSERT INTO fact_sales
          (customer_id, product_id, time_id, quantity, unit_price, discount_pct, sales_amount, order_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')`,
        [customerId, productId, timeId, quantity, unitPrice, discountPct, salesAmount]
      );
    }

    await client.query("COMMIT");
    console.log("Seed completed with warehouse-shaped synthetic data.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
