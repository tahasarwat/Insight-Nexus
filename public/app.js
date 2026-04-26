async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

let categoryChart;
let revenueChart;
let segmentsChart;
let switchPanel = () => {};

function setupSidebarNavigation() {
  const navButtons = Array.from(document.querySelectorAll(".nav-btn"));
  const panels = Array.from(document.querySelectorAll(".panel"));

  function showPanel(panelId) {
    panels.forEach((panel) => {
      panel.classList.toggle("active", panel.id === panelId);
    });
    navButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.panel === panelId);
    });
  }

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => showPanel(btn.dataset.panel));
  });
  switchPanel = showPanel;
}

function renderTableRows(tbody, rows, mapper) {
  tbody.innerHTML = rows.map(mapper).join("");
}

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateOnly(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : "-";
}

function signalFromZScore(z) {
  const abs = Math.abs(Number(z || 0));
  if (abs >= 3) return "critical";
  if (abs >= 2) return "high";
  return "warning";
}

function upsertChart(current, canvasId, config) {
  if (current) current.destroy();
  const ctx = document.getElementById(canvasId);
  return new Chart(ctx, config);
}

async function loadDashboard() {
  const [health, kpis, topCustomers, byCategory, growth, segments, recentSales, anomalies] = await Promise.all([
    fetchJson("/api/health"),
    fetchJson("/api/kpis"),
    fetchJson("/api/analytics/top-customers?limit=10"),
    fetchJson("/api/analytics/sales-by-category"),
    fetchJson("/api/analytics/monthly-growth"),
    fetchJson("/api/analytics/segments"),
    fetchJson("/api/analytics/recent-sales?limit=12"),
    fetchJson("/api/analytics/anomalies/daily-sales?limit=12"),
  ]);

  document.getElementById("health").textContent = `Connected. DB time: ${new Date(health.dbTime).toLocaleString()}`;

  document.getElementById("kpis").innerHTML = `
    <div class="kpi"><strong>Total Orders</strong><div>${kpis.total_orders}</div></div>
    <div class="kpi"><strong>Active Customers</strong><div>${kpis.active_customers}</div></div>
    <div class="kpi"><strong>Total Revenue</strong><div>${money(kpis.total_revenue)}</div></div>
    <div class="kpi"><strong>Avg Order Value</strong><div>${money(kpis.avg_order_value)}</div></div>
  `;

  renderTableRows(
    document.querySelector("#topCustomersTable tbody"),
    topCustomers,
    (r) => `<tr><td>${r.customer_id}</td><td>${r.name}</td><td>${money(r.total_spending)}</td></tr>`
  );

  const growthExplainer = document.getElementById("growthExplainer");
  const latest = growth[growth.length - 1];
  const previous = growth.length > 1 ? growth[growth.length - 2] : null;
  growthExplainer.innerHTML = latest
    ? `
      <div class="kpi"><strong>What it means</strong><div>Change in monthly revenue vs previous month.</div></div>
      <div class="kpi"><strong>Current Month Revenue</strong><div>${money(latest.revenue)}</div></div>
      <div class="kpi"><strong>Previous Month Revenue</strong><div>${money(latest.prev_revenue)}</div></div>
      <div class="kpi"><strong>Monthly Growth</strong><div>${money(latest.growth)}</div></div>
    `
    : `<div class="kpi"><strong>Monthly Growth</strong><div>No data yet.</div></div>`;

  if (previous) {
    growthExplainer.innerHTML += `<div class="kpi"><strong>Prior Month Growth</strong><div>${money(previous.growth)}</div></div>`;
  }

  renderTableRows(
    document.querySelector("#categoryTable tbody"),
    byCategory,
    (r) => `<tr><td>${r.category}</td><td>${money(r.category_sales)}</td></tr>`
  );

  renderTableRows(
    document.querySelector("#growthTable tbody"),
    growth,
    (r) =>
      `<tr><td>${r.year}</td><td>${r.month}</td><td>${money(r.revenue)}</td><td>${money(r.prev_revenue)}</td><td>${money(r.growth)}</td></tr>`
  );

  renderTableRows(
    document.querySelector("#segmentsTable tbody"),
    segments,
    (r) =>
      `<tr><td>${r.customer_id}</td><td>${r.name}</td><td>${r.recency_days}</td><td>${r.frequency}</td><td>${money(r.monetary)}</td><td>${r.segment}</td></tr>`
  );

  renderTableRows(
    document.querySelector("#recentSalesTable tbody"),
    recentSales,
    (r) =>
      `<tr><td>${r.sale_id}</td><td>${dateOnly(r.full_date)}</td><td>${r.customer_name}</td><td>${r.product_name}</td><td>${r.category}</td><td>${money(r.sales_amount)}</td><td>${r.order_status}</td></tr>`
  );

  renderTableRows(
    document.querySelector("#anomalyTable tbody"),
    anomalies,
    (r) =>
      `<tr><td>${dateOnly(r.full_date)}</td><td>${money(r.revenue)}</td><td>${money(r.avg_revenue)}</td><td>${money(r.std_revenue)}</td><td>${r.z_score}</td><td><span class="badge ${signalFromZScore(r.z_score)}">${signalFromZScore(r.z_score)}</span></td></tr>`
  );

  categoryChart = upsertChart(categoryChart, "categoryChart", {
    type: "bar",
    data: {
      labels: byCategory.map((r) => r.category),
      datasets: [
        {
          label: "Sales ($)",
          data: byCategory.map((r) => Number(r.category_sales)),
          backgroundColor: "#4f46e5",
        },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });

  revenueChart = upsertChart(revenueChart, "revenueChart", {
    type: "line",
    data: {
      labels: growth.map((r) => `${r.year}-${String(r.month).padStart(2, "0")}`),
      datasets: [
        {
          label: "Revenue ($)",
          data: growth.map((r) => Number(r.revenue)),
          borderColor: "#059669",
          backgroundColor: "rgba(5,150,105,0.2)",
          tension: 0.25,
        },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });

  const segmentCounts = segments.reduce((acc, row) => {
    acc[row.segment] = (acc[row.segment] || 0) + 1;
    return acc;
  }, {});
  const segLabels = Object.keys(segmentCounts);
  const segData = segLabels.map((label) => segmentCounts[label]);
  segmentsChart = upsertChart(segmentsChart, "segmentsChart", {
    type: "pie",
    data: {
      labels: segLabels,
      datasets: [
        {
          data: segData,
          backgroundColor: ["#2563eb", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"],
        },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

async function loadProductsIntoSaleForm() {
  const products = await fetchJson("/api/products?limit=500");
  const select = document.getElementById("saleProductSelect");
  const previousValue = select.value;
  select.innerHTML = '<option value="">Select product...</option>';
  for (const p of products) {
    const option = document.createElement("option");
    option.value = p.product_id;
    option.textContent = `#${p.product_id} - ${p.product_name} (${p.category})`;
    select.appendChild(option);
  }
  if (previousValue) {
    select.value = previousValue;
  }
}

async function loadCustomer360(customerId) {
  const data = await fetchJson(`/api/analytics/customer-360/${customerId}`);
  const profile = data.profile;
  const metrics = data.metrics;
  const container = document.getElementById("customer360Profile");

  container.innerHTML = `
    <div class="kpi"><strong>Name</strong><div>${profile.name}</div></div>
    <div class="kpi"><strong>Location</strong><div>${profile.city}, ${profile.state}</div></div>
    <div class="kpi"><strong>Orders</strong><div>${metrics.completed_orders}</div></div>
    <div class="kpi"><strong>LTV</strong><div>${money(metrics.lifetime_value)}</div></div>
    <div class="kpi"><strong>Avg Order</strong><div>${money(metrics.avg_order_value)}</div></div>
    <div class="kpi"><strong>Last Order</strong><div>${dateOnly(metrics.last_order_date)}</div></div>
  `;

  document.getElementById("customer360Msg").textContent = `Loaded profile for customer #${profile.customer_id}`;
}

async function loadForecast(months, growthPct) {
  const data = await fetchJson(`/api/analytics/revenue-forecast?months=${months}&growthPct=${growthPct}`);
  renderTableRows(
    document.querySelector("#forecastTable tbody"),
    data.forecast,
    (r) => `<tr><td>${r.month_index}</td><td>${money(r.projected_revenue)}</td></tr>`
  );
  document.getElementById("forecastMsg").textContent = `Simulation ready: ${data.assumptions.months} months at ${data.assumptions.growthPct}% monthly growth.`;
}

document.getElementById("customerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const body = Object.fromEntries(new FormData(form).entries());
  try {
    await fetchJson("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    document.getElementById("customerMsg").textContent = "Customer created.";
    form.reset();
    await loadDashboard();
  } catch (error) {
    document.getElementById("customerMsg").textContent = error.message;
  }
});

document.getElementById("saleForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const body = Object.fromEntries(new FormData(form).entries());
  try {
    const sale = await fetchJson("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    document.getElementById("saleMsg").textContent = `Sale inserted (Sale ID: ${sale.sale_id}). Redirected to Recent Sales for verification.`;
    form.reset();
    await loadDashboard();
    switchPanel("recentSalesPanel");
    document.getElementById("recentSalesMsg").textContent = `Latest insert success: Sale ID ${sale.sale_id} for Customer ${sale.customer_id}. Check top rows below.`;
  } catch (error) {
    document.getElementById("saleMsg").textContent = error.message;
  }
});

document.getElementById("customer360Form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const customerId = Number(new FormData(form).get("customer_id"));
  try {
    await loadCustomer360(customerId);
  } catch (error) {
    document.getElementById("customer360Msg").textContent = error.message;
  }
});

document.getElementById("forecastForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const months = Number(formData.get("months"));
  const growthPct = Number(formData.get("growthPct"));
  try {
    await loadForecast(months, growthPct);
  } catch (error) {
    document.getElementById("forecastMsg").textContent = error.message;
  }
});

setupSidebarNavigation();
loadProductsIntoSaleForm().catch((error) => {
  document.getElementById("saleMsg").textContent = `Could not load products: ${error.message}`;
});

loadDashboard().catch((error) => {
  document.getElementById("health").textContent = `Failed to load dashboard: ${error.message}`;
});

loadForecast(6, 6).catch((error) => {
  document.getElementById("forecastMsg").textContent = `Failed to run forecast: ${error.message}`;
});
