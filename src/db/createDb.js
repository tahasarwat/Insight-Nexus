const { Client } = require("pg");
require("dotenv").config();

async function createDb() {
  const dbName = process.env.DB_NAME || "insight_nexus";
  const client = new Client({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: "postgres",
  });

  try {
    await client.connect();
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (exists.rowCount > 0) {
      console.log(`Database "${dbName}" already exists.`);
      return;
    }
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`Database "${dbName}" created.`);
  } catch (error) {
    console.error("Failed to create database:", error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

createDb();
