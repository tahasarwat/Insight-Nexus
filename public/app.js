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

function renderTableRows(tbody, rows, mapper) {
  tbody.innerHTML = rows.map(mapper).join("");
}

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function upsertChart(current, canvasId, config) {
  if (current) current.destroy();
  const ctx = document.getElementById(canvasId);
  return new Chart(ctx, config);
}

async function loadDashboard() {
  const [health, kpis, topCustomers, byCategory, growth, segments] = await Promise.all([
    fetchJson("/api/health"),
    fetchJson("/api/kpis"),
    fetchJson("/api/analytics/top-customers?limit=10"),
    fetchJson("/api/analytics/sales-by-category"),
    fetchJson("/api/analytics/monthly-growth"),
    fetchJson("/api/analytics/segments"),
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
    await fetchJson("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    document.getElementById("saleMsg").textContent = "Sale inserted.";
    form.reset();
    await loadDashboard();
  } catch (error) {
    document.getElementById("saleMsg").textContent = error.message;
  }
});

loadDashboard().catch((error) => {
  document.getElementById("health").textContent = `Failed to load dashboard: ${error.message}`;
});
