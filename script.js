// Expense & Budget Visualizer - JavaScript
// This is the only JavaScript file in the project.
// Uses vanilla JS, Local Storage, and Chart.js (loaded from CDN in index.html).
// Optional features: dark/light theme, sorting, spending limit.

// ---- Config: categories and their chart colors ----
const CATEGORIES = ["Food", "Transport", "Fun"];
const CATEGORY_COLORS = {
  Food: "#2d6a4f",      // dark green
  Transport: "#52b788", // lighter green
  Fun: "#e07a5f"        // warm contrast color
};

// ---- Local Storage keys ----
const STORAGE_KEY = "expenseBudgetTransactions";
const THEME_KEY = "expenseBudgetTheme";
const LIMIT_KEY = "expenseBudgetLimit";

// ---- State ----
let transactions = [];        // the real list (insertion order is preserved)
let expenseChart = null;      // Chart.js instance
let spendingLimit = 0;        // saved limit, 0 means "no limit"
let currentTotal = 0;         // latest total expenses (used by the limit warning)
let currentSort = "newest";   // current sort option for the list

// ---- DOM element references ----
const form = document.getElementById("transactionForm");
const itemNameInput = document.getElementById("itemName");
const amountInput = document.getElementById("amount");
const categoryInput = document.getElementById("category");
const formMessage = document.getElementById("formMessage");
const totalEl = document.getElementById("totalExpenses");
const listEl = document.getElementById("transactionList");
const listCard = document.querySelector(".list-card");
const chartCard = document.querySelector(".chart-card");
const canvas = document.getElementById("expenseChart");

// Optional feature DOM refs
const themeToggle = document.getElementById("themeToggle");
const sortSelect = document.getElementById("sortSelect");
const spendingLimitInput = document.getElementById("spendingLimit");
const setLimitBtn = document.getElementById("setLimitBtn");
const limitMessage = document.getElementById("limitMessage");
const limitWarning = document.getElementById("limitWarning");

// ---- Initialize the app when the page loads ----
document.addEventListener("DOMContentLoaded", init);

function init() {
  loadTransactions();
  loadLimit();
  initTheme();
  attachFormHandler();
  attachSortHandler();
  attachLimitHandler();
  renderAll();
}

// ---- Local Storage: transactions ----
function loadTransactions() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    transactions = [];
    return;
  }
  try {
    const parsed = JSON.parse(saved);
    // Only keep valid transaction objects
    transactions = Array.isArray(parsed)
      ? parsed.filter(isValidTransaction)
      : [];
  } catch (err) {
    // If stored data is corrupted, start fresh
    transactions = [];
  }
}

function saveTransactions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

function isValidTransaction(t) {
  return (
    t &&
    typeof t.name === "string" &&
    typeof t.amount === "number" &&
    !isNaN(t.amount) &&
    CATEGORIES.includes(t.category)
  );
}

// ---- Theme (dark/light) ----
function initTheme() {
  // The inline <head> script may have already applied the saved theme class.
  updateThemeToggleUI();
  themeToggle.addEventListener("click", toggleTheme);
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle("dark-theme");
  try {
    localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
  } catch (err) {}
  updateThemeToggleUI();
  // Re-render the chart so its legend/text colors match the new theme.
  renderChart();
}

function updateThemeToggleUI() {
  const isDark = document.documentElement.classList.contains("dark-theme");
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.title = isDark ? "Switch to light mode" : "Switch to dark mode";
}

// Chart legend/text color depends on the active theme
function getChartTextColor() {
  return document.documentElement.classList.contains("dark-theme")
    ? "#e7eee9"
    : "#2c3a2e";
}

// ---- Spending limit ----
function loadLimit() {
  const saved = localStorage.getItem(LIMIT_KEY);
  if (saved === null) {
    spendingLimit = 0;
    return;
  }
  const value = parseFloat(saved);
  spendingLimit = isNaN(value) || value < 0 ? 0 : value;
  // Show the saved limit in the input (empty when there is no limit)
  spendingLimitInput.value = spendingLimit > 0 ? spendingLimit : "";
}

function saveLimit() {
  localStorage.setItem(LIMIT_KEY, String(spendingLimit));
}

function attachLimitHandler() {
  setLimitBtn.addEventListener("click", setLimit);
  // Allow pressing Enter inside the limit input to set it
  spendingLimitInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      setLimit();
    }
  });
}

function setLimit() {
  const raw = spendingLimitInput.value.trim();

  // An empty field clears the limit
  if (raw === "") {
    spendingLimit = 0;
    saveLimit();
    showLimitMessage("Spending limit cleared.", "success");
    renderLimitWarning();
    return;
  }

  const value = parseFloat(raw);

  if (isNaN(value) || value < 0) {
    showLimitMessage("Please enter a valid amount (0 or more).", "error");
    return;
  }

  spendingLimit = value;
  saveLimit();

  if (value === 0) {
    spendingLimitInput.value = "";
    showLimitMessage("Spending limit cleared.", "success");
  } else {
    showLimitMessage("Spending limit set to " + formatIDR(value) + ".", "success");
  }

  renderLimitWarning();
}

function showLimitMessage(message, type) {
  limitMessage.textContent = message;
  limitMessage.className = "limit-message " + type;

  if (type === "success") {
    setTimeout(function () {
      // Only clear if this message is still showing
      if (limitMessage.textContent === message) {
        limitMessage.textContent = "";
        limitMessage.className = "limit-message";
      }
    }, 2500);
  }
}

function renderLimitWarning() {
  const overLimit = spendingLimit > 0 && currentTotal > spendingLimit;

  if (overLimit) {
    limitWarning.hidden = false;
    limitWarning.textContent =
      "⚠ Warning: You have exceeded your spending limit of " +
      formatIDR(spendingLimit) +
      ".";
  } else {
    limitWarning.hidden = true;
    limitWarning.textContent = "";
  }

  // Highlight the total in red when over the limit
  totalEl.classList.toggle("over-limit", overLimit);
}

// ---- Sorting ----
function attachSortHandler() {
  sortSelect.addEventListener("change", function () {
    currentSort = sortSelect.value;
    renderList();
  });
}

// Return a sorted COPY of the transactions. The original array is never changed,
// so deleting by id always works no matter how the list is displayed.
function getSortedTransactions() {
  const copy = transactions.slice();

  switch (currentSort) {
    case "amount-asc":
      copy.sort(function (a, b) {
        return a.amount - b.amount;
      });
      break;
    case "amount-desc":
      copy.sort(function (a, b) {
        return b.amount - a.amount;
      });
      break;
    case "category":
      copy.sort(function (a, b) {
        if (a.category === b.category) {
          return a.name.localeCompare(b.name);
        }
        return a.category.localeCompare(b.category);
      });
      break;
    case "newest":
    default:
      // Newest first = highest id (Date.now) comes first
      copy.sort(function (a, b) {
        return b.id - a.id;
      });
      break;
  }

  return copy;
}

// ---- Form handling ----
function attachFormHandler() {
  form.addEventListener("submit", handleSubmit);
}

function handleSubmit(event) {
  event.preventDefault();

  const name = itemNameInput.value.trim();
  const amount = parseFloat(amountInput.value);
  const category = categoryInput.value;

  // Validate item name
  if (!name) {
    showFormMessage("Please enter an item name.", "error");
    itemNameInput.focus();
    return;
  }

  // Validate amount: must be a number greater than zero
  if (isNaN(amount) || amount <= 0) {
    showFormMessage("Amount must be a number greater than zero.", "error");
    amountInput.focus();
    return;
  }

  // Validate category (defensive, should always match a select option)
  if (!CATEGORIES.includes(category)) {
    showFormMessage("Please choose a valid category.", "error");
    return;
  }

  // Create and store the new transaction
  const newTransaction = {
    id: Date.now(),
    name: name,
    amount: amount,
    category: category
  };

  transactions.push(newTransaction);
  saveTransactions();
  renderAll();

  // Reset the form for the next entry
  form.reset();
  itemNameInput.focus();
  showFormMessage("Transaction added.", "success");
}

function showFormMessage(message, type) {
  formMessage.textContent = message;
  formMessage.className = "form-message " + type;

  // Success messages auto-clear after a short delay
  if (type === "success") {
    setTimeout(function () {
      formMessage.textContent = "";
      formMessage.className = "form-message";
    }, 2500);
  }
}

// ---- Render everything ----
function renderAll() {
  renderTotal();
  renderList();
  renderChart();
  renderLimitWarning();
}

// ---- Total expenses ----
function renderTotal() {
  currentTotal = transactions.reduce(function (sum, t) {
    return sum + t.amount;
  }, 0);
  totalEl.textContent = formatIDR(currentTotal);
}

// ---- Transaction list ----
function renderList() {
  // Clear the current list
  listEl.innerHTML = "";

  if (transactions.length === 0) {
    // Show empty state, hide the list
    listCard.classList.remove("has-data");
    return;
  }

  // Has data: show list, hide empty message
  listCard.classList.add("has-data");

  // Render from a sorted copy so the original data order is preserved.
  const sorted = getSortedTransactions();

  sorted.forEach(function (t) {
    const li = document.createElement("li");
    li.className = "transaction-item";

    // Build item info (name + category badge)
    const info = document.createElement("div");
    info.className = "tx-info";

    const nameSpan = document.createElement("span");
    nameSpan.className = "tx-name";
    nameSpan.textContent = t.name;

    const categorySpan = document.createElement("span");
    categorySpan.className = "tx-category";
    categorySpan.textContent = t.category;

    info.appendChild(nameSpan);
    info.appendChild(categorySpan);

    // Amount
    const amountSpan = document.createElement("span");
    amountSpan.className = "tx-amount";
    amountSpan.textContent = formatIDR(t.amount);

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.setAttribute("aria-label", "Delete " + t.name);
    // Delete by id, so it works no matter how the list is sorted.
    deleteBtn.addEventListener("click", function () {
      deleteTransaction(t.id);
    });

    li.appendChild(info);
    li.appendChild(amountSpan);
    li.appendChild(deleteBtn);
    listEl.appendChild(li);
  });
}

// ---- Delete a transaction ----
function deleteTransaction(id) {
  transactions = transactions.filter(function (t) {
    return t.id !== id;
  });
  saveTransactions();
  renderAll();
}

// ---- Pie chart ----
function renderChart() {
  // Total spending per category
  const totals = { Food: 0, Transport: 0, Fun: 0 };
  transactions.forEach(function (t) {
    totals[t.category] += t.amount;
  });

  // Determine if there is any data to chart
  const hasData = CATEGORIES.some(function (c) {
    return totals[c] > 0;
  });

  if (!hasData) {
    // Empty state: destroy any existing chart and show the message
    if (expenseChart) {
      expenseChart.destroy();
      expenseChart = null;
    }
    chartCard.classList.remove("has-data");
    return;
  }

  // Show the chart
  chartCard.classList.add("has-data");

  const chartData = {
    labels: CATEGORIES,
    datasets: [
      {
        data: CATEGORIES.map(function (c) {
          return totals[c];
        }),
        backgroundColor: CATEGORIES.map(function (c) {
          return CATEGORY_COLORS[c];
        }),
        borderColor: "#ffffff",
        borderWidth: 2
      }
    ]
  };

  if (expenseChart) {
    // Update existing chart in place and keep legend color in sync with theme
    expenseChart.data = chartData;
    expenseChart.options.plugins.legend.labels.color = getChartTextColor();
    expenseChart.update();
  } else {
    // Create a new chart
    expenseChart = new Chart(canvas, {
      type: "pie",
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: getChartTextColor(),
              padding: 16
            }
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const value = context.parsed;
                const label = context.label || "";
                return label + ": " + formatIDR(value);
              }
            }
          }
        }
      }
    });
  }
}

// ---- Currency formatting: Indonesian Rupiah (IDR) ----
function formatIDR(value) {
  // Round to whole rupiah and add thousands separators using id-ID locale
  const rounded = Math.round(value);
  return "Rp " + rounded.toLocaleString("id-ID");
}
