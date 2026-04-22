(function () {
  const body = document.body;
  const themeToggle = document.getElementById("themeToggle");
  const menuToggle = document.getElementById("menuToggle");
  const siteNav = document.getElementById("siteNav");
  const prefersNight = window.matchMedia("(prefers-color-scheme: dark)");
  const hasAnalytics =
    Boolean(document.getElementById("trainingChart")) ||
    Boolean(document.getElementById("pokerChart")) ||
    Boolean(document.getElementById("sportsChart"));
  let pokerData = [];
  let sportsData = [];
  let activities = [];
  let currentActivityFilter = "all";

  function setTheme(theme) {
    body.setAttribute("data-theme", theme);
    if (themeToggle) {
      themeToggle.textContent = theme === "night" ? "Paper Edition" : "Night Edition";
    }
  }

  function initializeTheme() {
    const stored = localStorage.getItem("portfolio-theme");
    if (stored === "paper" || stored === "night") {
      setTheme(stored);
      return;
    }
    setTheme(prefersNight.matches ? "night" : "paper");
  }

  function toggleTheme() {
    const nextTheme = body.getAttribute("data-theme") === "night" ? "paper" : "night";
    setTheme(nextTheme);
    localStorage.setItem("portfolio-theme", nextTheme);
    redrawCharts();
  }

  function initializeMenu() {
    if (!menuToggle || !siteNav) return;
    menuToggle.addEventListener("click", function () {
      const isOpen = siteNav.classList.toggle("is-open");
      menuToggle.setAttribute("aria-expanded", String(isOpen));
    });
    siteNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        siteNav.classList.remove("is-open");
        menuToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  function initializeReveal() {
    const elements = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      elements.forEach(function (element) {
        element.classList.add("is-visible");
      });
      return;
    }
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18 }
    );
    elements.forEach(function (element) {
      observer.observe(element);
    });
  }

  function splitCSVRow(row) {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < row.length; i += 1) {
      const char = row[i];
      if (char === "\"") {
        if (inQuotes && row[i + 1] === "\"") {
          current += "\"";
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  async function loadActivities() {
    const response = await fetch("activities.csv");
    const text = await response.text();
    const rows = text.trim().split(/\r?\n/);
    const headers = splitCSVRow(rows[0]);
    const dateIdx = headers.indexOf("Activity Date");
    const typeIdx = headers.indexOf("Activity Type");
    const movingIdx = headers.lastIndexOf("Moving Time");
    let distanceIdx = -1;
    let distanceCount = 0;
    headers.forEach(function (header, index) {
      if (header === "Distance") {
        distanceCount += 1;
        if (distanceCount === 2) {
          distanceIdx = index;
        }
      }
    });

    activities = rows.slice(1).map(function (row) {
      const columns = splitCSVRow(row);
      const date = new Date((columns[dateIdx] || "").replace(/"/g, "").trim());
      const type = (columns[typeIdx] || "").replace(/"/g, "").trim();
      const movingSec = parseFloat(columns[movingIdx] || "0");
      const distanceMeters = parseFloat(columns[distanceIdx] || "0");
      return {
        date: date,
        type: type,
        elapsed: Number.isFinite(movingSec) ? movingSec : 0,
        distanceKm: Number.isFinite(distanceMeters) ? distanceMeters / 1000 : 0
      };
    }).filter(function (activity) {
      return activity.date instanceof Date && !Number.isNaN(activity.date.getTime());
    });
  }

  async function loadSportsData() {
    const response = await fetch("sportsbettingData.json");
    const raw = await response.json();
    sportsData = raw.map(function (entry) {
      return { date: new Date(entry.date), value: entry.value };
    });
  }

  async function loadPokerData() {
    const csvUrl = "https://docs.google.com/spreadsheets/d/1dpwwxn2avkUzymx83_BfbRH2NsWpwYnoeW_-Otkpi_A/export?format=csv";
    const response = await fetch(csvUrl);
    const text = await response.text();
    const rows = text.trim().split(/\r?\n/);
    const headers = rows[0].split(",");
    const dateIdx = headers.indexOf("Date");
    const plIdx = headers.indexOf("P/L");
    let cumulative = 0;
    pokerData = [];
    rows.slice(1).forEach(function (row) {
      const columns = row.split(",");
      const date = new Date(columns[dateIdx]);
      const pl = parseFloat(columns[plIdx] || "0");
      if (!Number.isNaN(date.getTime()) && Number.isFinite(pl)) {
        cumulative += pl;
        pokerData.push({ date: date, value: cumulative });
      }
    });
  }

  function formatRelative(date) {
    const diffDays = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
    if (diffDays >= 365) return Math.floor(diffDays / 365) + "y";
    if (diffDays >= 30) return Math.floor(diffDays / 30) + "m";
    if (diffDays >= 7) return Math.floor(diffDays / 7) + "w";
    return diffDays + "d";
  }

  function getRecentActivities() {
    const recent = activities.slice(-30);
    if (currentActivityFilter === "all") {
      return recent.slice().reverse();
    }
    return recent.filter(function (activity) {
      return activity.type === currentActivityFilter;
    }).reverse();
  }

  function getWeeklyBuckets(items) {
    const buckets = new Map();
    items.forEach(function (activity) {
      const date = new Date(activity.date);
      const day = date.getDay();
      const mondayOffset = (day + 6) % 7;
      date.setDate(date.getDate() - mondayOffset);
      date.setHours(0, 0, 0, 0);
      const key = date.toISOString().slice(0, 10);
      const current = buckets.get(key) || 0;
      buckets.set(key, current + activity.distanceKm);
    });
    return Array.from(buckets.entries())
      .map(function (entry) {
        return { label: entry[0], value: entry[1] };
      })
      .sort(function (left, right) {
        return new Date(left.label) - new Date(right.label);
      })
      .slice(-6);
  }

  function getCssVariable(name, fallback) {
    const value = getComputedStyle(document.body).getPropertyValue(name).trim();
    return value || fallback;
  }

  function drawLineChart(canvasId, series) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.max(280, Math.floor(rect.width));
    canvas.height = Math.max(220, Math.floor(rect.height));
    context.clearRect(0, 0, canvas.width, canvas.height);

    if (!series.length) {
      context.fillStyle = getCssVariable("--ink-faint", "#7d7268");
      context.font = "16px Alegreya Sans";
      context.fillText("No data available", 18, canvas.height / 2);
      return;
    }

    const accent = getCssVariable("--accent", "#6f1d1b");
    const gold = getCssVariable("--gold", "#b8893c");
    const border = getCssVariable("--border", "rgba(0,0,0,0.15)");
    const values = series.map(function (point) { return point.value; });
    const min = Math.min.apply(null, values);
    const max = Math.max.apply(null, values);
    const range = max - min || 1;
    const padding = { top: 18, right: 18, bottom: 18, left: 18 };
    const width = canvas.width - padding.left - padding.right;
    const height = canvas.height - padding.top - padding.bottom;

    context.strokeStyle = border;
    context.lineWidth = 1;
    for (let line = 0; line < 4; line += 1) {
      const y = padding.top + (height * line) / 3;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(canvas.width - padding.right, y);
      context.stroke();
    }

    const points = series.map(function (point, index) {
      const x = padding.left + (width * index) / Math.max(series.length - 1, 1);
      const y = padding.top + height - ((point.value - min) / range) * height;
      return { x: x, y: y };
    });

    const gradient = context.createLinearGradient(0, padding.top, 0, canvas.height);
    gradient.addColorStop(0, accent + "55");
    gradient.addColorStop(1, gold + "08");

    context.beginPath();
    points.forEach(function (point, index) {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.lineTo(points[points.length - 1].x, canvas.height - padding.bottom);
    context.lineTo(points[0].x, canvas.height - padding.bottom);
    context.closePath();
    context.fillStyle = gradient;
    context.fill();

    context.beginPath();
    points.forEach(function (point, index) {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.strokeStyle = accent;
    context.lineWidth = 2.5;
    context.stroke();

    context.fillStyle = accent;
    points.forEach(function (point, index) {
      if (index === points.length - 1 || index % Math.ceil(points.length / 7) === 0) {
        context.beginPath();
        context.arc(point.x, point.y, 3.2, 0, Math.PI * 2);
        context.fill();
      }
    });
  }

  function drawBarChart(canvasId, series) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.max(280, Math.floor(rect.width));
    canvas.height = Math.max(220, Math.floor(rect.height));
    context.clearRect(0, 0, canvas.width, canvas.height);

    if (!series.length) {
      context.fillStyle = getCssVariable("--ink-faint", "#7d7268");
      context.font = "16px Alegreya Sans";
      context.fillText("No recent sessions", 18, canvas.height / 2);
      return;
    }

    const accent = getCssVariable("--accent", "#6f1d1b");
    const gold = getCssVariable("--gold", "#b8893c");
    const border = getCssVariable("--border", "rgba(0,0,0,0.15)");
    const max = Math.max.apply(null, series.map(function (item) { return item.value; })) || 1;
    const width = canvas.width;
    const height = canvas.height;
    const barWidth = width / series.length;

    context.strokeStyle = border;
    for (let line = 0; line < 4; line += 1) {
      const y = 18 + ((height - 36) * line) / 3;
      context.beginPath();
      context.moveTo(12, y);
      context.lineTo(width - 12, y);
      context.stroke();
    }

    series.forEach(function (item, index) {
      const ratio = item.value / max;
      const x = index * barWidth + barWidth * 0.18;
      const y = height - 16 - ratio * (height - 54);
      const currentWidth = barWidth * 0.64;
      const currentHeight = height - 16 - y;
      const barGradient = context.createLinearGradient(0, y, 0, height);
      barGradient.addColorStop(0, accent);
      barGradient.addColorStop(1, gold);
      context.fillStyle = barGradient;
      context.fillRect(x, y, currentWidth, currentHeight);
      context.fillStyle = getCssVariable("--ink-soft", "#463d36");
      context.font = "12px Alegreya Sans";
      context.fillText(item.value.toFixed(1), x, y - 6);
    });
  }

  function updateTraining() {
    const recent = getRecentActivities();
    const totalDistance = recent.reduce(function (sum, activity) { return sum + activity.distanceKm; }, 0);
    const totalHours = recent.reduce(function (sum, activity) { return sum + activity.elapsed / 3600; }, 0);
    const longest = recent.reduce(function (max, activity) {
      return Math.max(max, activity.distanceKm);
    }, 0);

    const distanceEl = document.getElementById("trainingDistance");
    const hoursEl = document.getElementById("trainingHours");
    const countEl = document.getElementById("trainingCount");
    const longestEl = document.getElementById("trainingLongest");
    const listEl = document.getElementById("trainingRecent");

    if (distanceEl) distanceEl.textContent = totalDistance.toFixed(1) + " km";
    if (hoursEl) hoursEl.textContent = totalHours.toFixed(1) + " h";
    if (countEl) countEl.textContent = String(recent.length);
    if (longestEl) longestEl.textContent = longest.toFixed(1) + " km";

    if (listEl) {
      listEl.innerHTML = "";
      recent.slice(0, 5).forEach(function (activity) {
        const item = document.createElement("li");
        const dateText = activity.date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        const durationText = Math.round(activity.elapsed / 60) + " min";
        item.innerHTML =
          '<span class="session-main"><strong>' +
          dateText +
          "</strong><span class=\"session-meta\">" +
          activity.type +
          " / " +
          durationText +
          " / " +
          activity.distanceKm.toFixed(1) +
          " km</span></span><span class=\"session-age\">" +
          formatRelative(activity.date) +
          "</span>";
        listEl.appendChild(item);
      });
    }

    drawBarChart("trainingChart", getWeeklyBuckets(recent.slice().reverse()));
  }

  function filterByDays(series, days) {
    if (!days) return series;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return series.filter(function (point) {
      return point.date >= cutoff;
    });
  }

  function updateSeriesValue(elementId, series) {
    const element = document.getElementById(elementId);
    if (!element) return;
    if (!series.length) {
      element.textContent = "Unavailable";
      return;
    }
    element.textContent = series[series.length - 1].value.toFixed(2);
  }

  function updatePoker(days) {
    const filtered = filterByDays(pokerData, days);
    drawLineChart("pokerChart", filtered);
    updateSeriesValue("pokerValue", filtered);
  }

  function updateSports(days) {
    const filtered = filterByDays(sportsData, days);
    drawLineChart("sportsChart", filtered);
    updateSeriesValue("sportsValue", filtered);
  }

  function setActiveChip(selector, valueAttribute, value) {
    document.querySelectorAll(selector).forEach(function (chip) {
      const chipValue = chip.getAttribute(valueAttribute);
      chip.classList.toggle("is-active", chipValue === value);
    });
  }

  function initializeControls() {
    document.querySelectorAll("[data-activity-filter]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        currentActivityFilter = chip.getAttribute("data-activity-filter") || "all";
        setActiveChip("[data-activity-filter]", "data-activity-filter", currentActivityFilter);
        updateTraining();
      });
    });

    document.querySelectorAll("[data-poker-range]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        const days = parseInt(chip.getAttribute("data-poker-range") || "0", 10);
        setActiveChip("[data-poker-range]", "data-poker-range", String(days));
        updatePoker(days);
      });
    });

    document.querySelectorAll("[data-sports-range]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        const days = parseInt(chip.getAttribute("data-sports-range") || "0", 10);
        setActiveChip("[data-sports-range]", "data-sports-range", String(days));
        updateSports(days);
      });
    });
  }

  function redrawCharts() {
    updateTraining();
    updatePoker(parseInt((document.querySelector("[data-poker-range].is-active") || {}).getAttribute?.("data-poker-range") || "30", 10));
    updateSports(parseInt((document.querySelector("[data-sports-range].is-active") || {}).getAttribute?.("data-sports-range") || "30", 10));
  }

  async function initializeData() {
    if (!hasAnalytics) return;

    try {
      await Promise.all([loadActivities(), loadSportsData()]);
      updateTraining();
      updateSports(30);
    } catch (error) {
      console.error("Failed to initialize local analytics data.", error);
    }

    try {
      await loadPokerData();
      updatePoker(30);
    } catch (error) {
      console.error("Failed to load poker data.", error);
      updatePoker(0);
    }
  }

  initializeTheme();
  if (themeToggle) {
    themeToggle.addEventListener("click", toggleTheme);
  }
  initializeMenu();
  initializeReveal();
  initializeControls();
  initializeData();
  if (hasAnalytics) {
    window.addEventListener("resize", redrawCharts);
  }
})();
