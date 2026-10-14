/**
 * ============================================================================
 * WAREHOUSE DASHBOARD PREVIEW
 * Standalone demo with realistic sample data & 2s random walk updates
 * No BroadcastChannel, no localStorage, completely self-contained.
 * ============================================================================
 */

/* ============================================================================
   CONFIG & SAMPLE DATA OBJECT (Easily tunable before client presentations)
   ============================================================================ */
const CONFIG = {
  // Live update interval in ms
  UPDATE_INTERVAL_MS: 2000,

  // Temperature dynamics
  TEMP_MIN: 5.0,
  TEMP_MAX: 10.5,
  TEMP_STEP_MAX: 0.3,
  COOLING_LIMIT: 10.0,
  COOLING_HYSTERESIS_OFF: 8.0,

  // Humidity dynamics
  HUMIDITY_MIN: 78,
  HUMIDITY_MAX: 94,
  HUMIDITY_STEP_MAX: 0.8,

  // Sparkline history buffer size
  CHART_POINTS: 30,

  // Colors
  COLORS: {
    green: "#2E7D32",
    red: "#D32F2F",
    amber: "#F9A825",
    blue: "#1E88E5",
    brandOrange: "#F57C00"
  }
};

function getVegetableSvg(name, size = 16) {
  switch (name) {
    case "Tomatoes":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="#EF4444" style="vertical-align:middle;flex-shrink:0;"><circle cx="12" cy="13" r="8"/><path d="M12 5v3M10 5c1 1 2 1 4 0" stroke="#15803D" stroke-width="2" fill="none"/></svg>`;
    case "Potatoes":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="#D97706" style="vertical-align:middle;flex-shrink:0;"><ellipse cx="12" cy="12" rx="9" ry="7"/><circle cx="9" cy="10" r="1" fill="#78350F"/><circle cx="14" cy="13" r="1" fill="#78350F"/></svg>`;
    case "Onions":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="#A855F7" style="vertical-align:middle;flex-shrink:0;"><path d="M12 3c-4 5-7 8-7 12a7 7 0 0 0 14 0c0-4-3-7-7-12z"/><path d="M12 3v4" stroke="#15803D" stroke-width="2"/></svg>`;
    case "Spinach":
    case "Cabbage":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="#10B981" style="vertical-align:middle;flex-shrink:0;"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6" stroke="#047857" stroke-width="2" fill="none"/></svg>`;
    case "Carrots":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="#F97316" style="vertical-align:middle;flex-shrink:0;"><polygon points="7,21 3,21 3,17 17,3 21,7"/><path d="M17 3l4-2M19 5l3 2" stroke="#15803D" stroke-width="1.8" fill="none"/></svg>`;
    default:
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="#64748B" style="vertical-align:middle;flex-shrink:0;"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>`;
  }
}

const SAMPLE_DATA = {
  // Starting values
  initialTemp: 6.0,
  initialHumidity: 85.0,

  // Default: All 24 cartons start Fresh. Cartons only spoil when triggered in simulation.
  spoiledCartons: {},

  // Vegetable mapping per rack:
  // Rack A = Tomatoes
  // Rack B = Potatoes & Onions (alternate)
  // Rack C = Spinach & Cabbage (alternate)
  // Rack D = Carrots
  racks: [
    {
      id: "A",
      name: "Rack A",
      hint: "Tomatoes",
      category: "Vine Produce",
      getVeg: (idx) => ({ name: "Tomatoes" })
    },
    {
      id: "B",
      name: "Rack B",
      hint: "Potatoes & Onions",
      category: "Root Vegetables",
      getVeg: (idx) => idx % 2 === 0 ? { name: "Potatoes" } : { name: "Onions" }
    },
    {
      id: "C",
      name: "Rack C",
      hint: "Spinach & Cabbage",
      category: "Leafy Greens",
      getVeg: (idx) => idx % 2 === 0 ? { name: "Spinach" } : { name: "Cabbage" }
    },
    {
      id: "D",
      name: "Rack D",
      hint: "Carrots",
      category: "Root Crops",
      getVeg: (idx) => ({ name: "Carrots" })
    }
  ],

  // 6 Monitored areas for Liquid Spill Detection (All clean by default)
  areas: [
    { id: "rack-a", name: "Rack A Aisle", cam: "CAM-1", hasSpill: false, lastChecked: "Just now" },
    { id: "rack-b", name: "Rack B Aisle", cam: "CAM-2", hasSpill: false, lastChecked: "Just now" },
    { id: "rack-c", name: "Rack C Aisle", cam: "CAM-3", hasSpill: false, lastChecked: "Just now" },
    { id: "rack-d", name: "Rack D Aisle", cam: "CAM-4", hasSpill: false, lastChecked: "Just now" },
    { id: "loading-dock", name: "Loading Dock", cam: "CAM-5", hasSpill: false, lastChecked: "Just now" },
    { id: "entrance", name: "Entrance", cam: "CAM-6", hasSpill: false, lastChecked: "Just now" }
  ],

  // Cooling Units static metadata
  coolingUnits: [
    { id: 1, name: "Cooling Unit 1", location: "North wall", health: "Working normally", healthType: "green" },
    { id: 2, name: "Cooling Unit 2", location: "East wall",  health: "Working normally", healthType: "green" },
    { id: 3, name: "Cooling Unit 3", location: "West wall",  health: "Working normally", healthType: "green" }
  ],

  // Spill History (past resolved spills)
  spillHistory: [
    { area: "Entrance", cam: "CAM-6", time: "Cleaned at 9:20 AM", thumbSeed: 101 },
    { area: "Rack A Aisle", cam: "CAM-1", time: "Cleaned yesterday", thumbSeed: 102 }
  ],

  // Initial Activity Feed entries (clean baseline state)
  initialActivities: [
    { type: "cleaned", message: "Facility inspection passed. All 24 cartons verified fresh.", time: "11:00 AM", unread: false },
    { type: "cooling-off", message: "Morning facility cycle complete. Target temperature met.", time: "10:30 AM", unread: false },
    { type: "cleaned", message: "All 6 aisles inspected. Zero liquid hazards detected.", time: "09:45 AM", unread: false }
  ]
};

/* ============================================================================
   STATE CONTAINER
   ============================================================================ */
const STATE = {
  temp: SAMPLE_DATA.initialTemp,
  displayedTemp: SAMPLE_DATA.initialTemp,
  humidity: SAMPLE_DATA.initialHumidity,
  displayedHumidity: SAMPLE_DATA.initialHumidity,
  
  power: 46.8,
  displayedPower: 46.8,
  powerHistory: [],

  coolingOn: false,
  coolingRunningSeconds: 0,
  
  tempHistory: [],
  humidityHistory: [],

  cartons: {},
  activeFilter: "all",
  
  spillImages: {}, // Data URLs generated via Canvas

  lastUpdateTimestamp: Date.now(),
  isLiveLinked: false,
  lastSimSyncTime: 0,

  historyTab: "temp" // "temp" | "power"
};

/* ============================================================================
   SIMULATION LIVE LINK BRIDGE
   Listens for live state changes from the main simulation tab (BroadcastChannel + localStorage)
   ============================================================================ */
let dashSyncChannel = null;

function initSimulationSyncBridge() {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      dashSyncChannel = new BroadcastChannel("warehouse_simulation_sync");
      dashSyncChannel.onmessage = (event) => {
        if (event.data && event.data.type === "SIM_STATE_UPDATE") {
          applySimulationSyncData(event.data);
        }
      };
    }
  } catch (err) {
    console.warn("BroadcastChannel error:", err);
  }

  // Also listen for cross-tab storage events
  window.addEventListener("storage", (e) => {
    if (e.key === "warehouse_sim_state" && e.newValue) {
      try {
        const payload = JSON.parse(e.newValue);
        applySimulationSyncData(payload);
      } catch (err) {}
    }
  });

  // Send an immediate handshake request to simulation tab
  requestSimulationState();

  // Check initial state from localStorage if simulation was already active
  try {
    const cached = localStorage.getItem("warehouse_sim_state");
    if (cached) {
      const payload = JSON.parse(cached);
      // Retain state if updated within last hour
      if (Date.now() - payload.timestamp < 3600000) {
        applySimulationSyncData(payload);
      }
    }
  } catch (err) {}

  // Periodic heartbeat checker and request state ping
  setInterval(checkSimLinkHealth, 2000);

  // Active polling fallback for localStorage (every 250ms) to ensure instant sync
  // even if BroadcastChannel or storage events are suppressed in incognito windows
  let lastSeenSyncTimestamp = 0;
  setInterval(() => {
    try {
      const raw = localStorage.getItem("warehouse_sim_state");
      if (raw) {
        const payload = JSON.parse(raw);
        if (payload && payload.timestamp && payload.timestamp > lastSeenSyncTimestamp) {
          lastSeenSyncTimestamp = payload.timestamp;
          applySimulationSyncData(payload);
        }
      }
    } catch (err) {}
  }, 250);
}

function requestSimulationState() {
  if (dashSyncChannel) {
    try {
      dashSyncChannel.postMessage({ type: "REQUEST_STATE", timestamp: Date.now() });
    } catch (e) {}
  }
}

function checkSimLinkHealth() {
  const pill = document.getElementById("sim-sync-pill");
  const text = document.getElementById("sync-status-text");
  const isRecent = (Date.now() - STATE.lastSimSyncTime) < 4500;
  STATE.isLiveLinked = isRecent;

  if (pill && text) {
    if (isRecent) {
      pill.classList.remove("disconnected");
      text.textContent = "Sim Live";
    } else {
      pill.classList.add("disconnected");
      text.textContent = "Autonomous";
    }
  }
}

function applySimulationSyncData(data) {
  if (!data) return;
  STATE.lastSimSyncTime = Date.now();
  STATE.isLiveLinked = true;

  // 1. Live Temperature & Cooling
  if (typeof data.temp === "number") {
    STATE.temp = Math.round(data.temp * 10) / 10;
    animateValue("temp-big-val", STATE.displayedTemp, STATE.temp, 400, 1);
    STATE.displayedTemp = STATE.temp;

    STATE.tempHistory.push(STATE.temp);
    if (STATE.tempHistory.length > CONFIG.CHART_POINTS) STATE.tempHistory.shift();
  }

  if (typeof data.coolingActive === "boolean") {
    const wasCooling = STATE.coolingOn;
    STATE.coolingOn = data.coolingActive;
    if (typeof data.coolingSeconds === "number") {
      STATE.coolingRunningSeconds = Math.round(data.coolingSeconds);
    }
    if (!wasCooling && STATE.coolingOn) {
      addActivity("cooling-on", `Temperature reached ${STATE.temp.toFixed(1)} °C. Cooling units switched ON via simulation.`);
    } else if (wasCooling && !STATE.coolingOn) {
      addActivity("cooling-off", `Temperature normalised (${STATE.temp.toFixed(1)} °C). Cooling units switched OFF.`);
    }
  }

  // 2. Live Humidity
  if (typeof data.humidity === "number") {
    STATE.humidity = Math.round(data.humidity * 10) / 10;
    animateValue("hum-big-val", STATE.displayedHumidity, STATE.humidity, 400, 0);
    STATE.displayedHumidity = STATE.humidity;

    STATE.humidityHistory.push(STATE.humidity);
    if (STATE.humidityHistory.length > CONFIG.CHART_POINTS) STATE.humidityHistory.shift();
  }

  // 3. Live Power Consumption
  if (typeof data.power === "number") {
    STATE.power = Math.round(data.power * 10) / 10;
  } else {
    const baseTarget = STATE.coolingOn ? 82.5 : 46.5;
    STATE.power = Math.round((baseTarget + (Math.random() - 0.5) * 0.6) * 10) / 10;
  }
  animateValue("power-big-val", STATE.displayedPower, STATE.power, 400, 1);
  STATE.displayedPower = STATE.power;
  STATE.powerHistory.push(STATE.power);
  if (STATE.powerHistory.length > CONFIG.CHART_POINTS) STATE.powerHistory.shift();

  // 4. Update Cartons States Dynamically
  if (data.cartons) {
    Object.keys(data.cartons).forEach(cid => {
      const simC = data.cartons[cid];
      const dashC = STATE.cartons[cid];
      if (dashC) {
        const newStatus = simC.state === "spoiled" ? "spoiled" : "fresh";
        if (dashC.status !== newStatus) {
          dashC.status = newStatus;
          if (newStatus === "spoiled") {
            dashC.spoiledInfo = {
              spoiledTime: data.simTime || formatClockTime(new Date()),
              reason: "Gas detection alert triggered in simulation"
            };
            addActivity("spoil", `Carton ${cid} (${dashC.vegetable}) spoiled in simulation.`);
          } else {
            dashC.spoiledInfo = null;
            addActivity("cleaned", `Carton ${cid} (${dashC.vegetable}) replaced with fresh stock in simulation.`);
          }
        }
        updateSingleCartonTile(cid);
      }
    });
  }

  // 4. Update Spills Dynamically from Simulation across all 6 areas
  if (data.activeSpill) {
    const rackId = (data.activeSpill.nearestRack || "C").toLowerCase();
    const activeAreaId = `rack-${rackId}`;
    
    SAMPLE_DATA.areas.forEach(area => {
      if (area.id === activeAreaId) {
        if (!area.hasSpill) {
          area.hasSpill = true;
          area.detectedTime = data.activeSpill.timestamp || formatClockTime(new Date());
          if (data.activeSpill.snapshotUrl) {
            STATE.spillImages[activeAreaId] = data.activeSpill.snapshotUrl;
          }
          addActivity("spill", `Liquid spill detected near Rack ${data.activeSpill.nearestRack || "C"}.`, activeAreaId);
        }
        updateSpillSvgArea(area.id, true);
        updateSpillAlertCard(area.id, true);
      } else if (area.hasSpill) {
        area.hasSpill = false;
        updateSpillSvgArea(area.id, false);
        updateSpillAlertCard(area.id, false);
      }
    });
    renderAreasTable();
  } else {
    // If no active spill in simulation, clear all area spill alerts
    SAMPLE_DATA.areas.forEach(area => {
      if (area.hasSpill) {
        area.hasSpill = false;
        updateSpillSvgArea(area.id, false);
        updateSpillAlertCard(area.id, false);
      }
    });
    renderAreasTable();
  }

  // 5. Render Metric Visuals, Donut & UI
  renderMetrics();
  renderSparklines();
  renderCoolingCard();
  updateHealthSummary();

  const updatedTag = document.getElementById("last-updated-text");
  if (updatedTag) updatedTag.textContent = "Telemetry synced";
  STATE.lastUpdateTimestamp = Date.now();
  checkSimLinkHealth();
}

/**
 * Updates DOM for an individual carton tile dynamically
 */
function updateSingleCartonTile(cartonId) {
  const c = STATE.cartons[cartonId];
  const tile = document.getElementById(`carton-tile-${cartonId}`);
  if (!c || !tile) return;

  const isSpoiled = c.status === "spoiled";
  tile.className = `carton-tile ${isSpoiled ? "spoiled" : "fresh"}`;

  const statusPill = tile.querySelector(".tile-status-pill");
  if (statusPill) {
    statusPill.className = `tile-status-pill ${isSpoiled ? "spoiled" : "fresh"}`;
    statusPill.textContent = isSpoiled ? "Spoiled" : "Fresh";
  }

  const microFill = tile.querySelector(".carton-micro-fill");
  if (microFill) {
    microFill.className = `carton-micro-fill ${isSpoiled ? "spoiled" : "fresh"}`;
    microFill.style.width = isSpoiled ? "18%" : "96%";
  }

  // Time / status note
  let timeBox = tile.querySelector(".tile-spoiled-time");
  if (isSpoiled) {
    if (!timeBox) {
      timeBox = document.createElement("div");
      tile.appendChild(timeBox);
    }
    timeBox.className = "tile-spoiled-time";
    const spTime = c.spoiledInfo ? c.spoiledInfo.spoiledTime : "Just now";
    timeBox.innerHTML = `
      <span class="pulse-dot-red" style="width:5px;height:5px;"></span>
      <span>Since ${spTime}</span>
    `;
  } else {
    const existing = tile.querySelector(".tile-spoiled-time, .tile-safe-time");
    if (existing) existing.remove();
  }

  if (STATE.activeFilter !== "all") {
    filterCartons(STATE.activeFilter);
  }
}

function updateSpillSvgArea(areaId, hasSpill) {
  const mapZone = document.getElementById(`map-area-${areaId}`);
  if (!mapZone) return;

  if (hasSpill) {
    mapZone.className.baseVal = "map-zone zone-spill selected";
    const badge = mapZone.querySelector(".zone-status-badge");
    if (badge) {
      badge.className.baseVal = "zone-status-badge badge-red";
      const txt = badge.querySelector("text");
      if (txt) txt.textContent = "Spill detected";
    }
  } else {
    mapZone.className.baseVal = "map-zone zone-clear";
    const badge = mapZone.querySelector(".zone-status-badge");
    if (badge) {
      badge.className.baseVal = "zone-status-badge badge-green";
      const txt = badge.querySelector("text");
      if (txt) txt.textContent = "No spill";
    }
  }
}

function updateSpillAlertCard(areaId, hasSpill) {
  const card = document.getElementById(`spill-card-${areaId}`);
  if (card) {
    if (hasSpill) {
      card.style.display = "flex";
      card.style.opacity = "1";
      card.style.pointerEvents = "auto";
      const img = document.getElementById(`spill-img-${areaId}`);
      if (img && STATE.spillImages[areaId]) {
        img.src = STATE.spillImages[areaId];
      }
    } else {
      card.style.display = "none";
      card.style.opacity = "0.5";
      card.style.pointerEvents = "none";
    }
  }
}

/* ============================================================================
   INIT & BOOTSTRAP
   ============================================================================ */
document.addEventListener("DOMContentLoaded", () => {
  // 1. Generate Sparkline initial history
  initHistories();

  // 2. Build Cartons Matrix
  initCartonGrid();

  // 3. Generate CCTV Snapshots for Spills
  generateAllSpillImages();

  // 4. Render Areas & Spill Table
  renderAreasTable();
  renderSpillHistory();

  // 5. Render Initial Activities
  renderActivityFeed();

  // 6. Initial Render of Metrics
  renderMetrics();
  renderSparklines();
  renderCoolingCard();
  updateHealthSummary();

  // 7. Initialize Simulation Live Link Bridge
  initSimulationSyncBridge();

  // 8. Start Live Loop (2s updates) & Clock
  updateLiveClock();
  setInterval(liveTick, CONFIG.UPDATE_INTERVAL_MS);
  setInterval(updateLiveClock, 1000);
  setInterval(updateCoolingTimer, 1000);
});

/* ============================================================================
   LIVE SIMULATION TICK (Every 2 seconds)
   ============================================================================ */
function liveTick() {
  // If receiving live telemetry from simulation tab, let simulation drive values
  if (STATE.isLiveLinked) {
    return;
  }
  // --- TEMPERATURE RANDOM WALK ---
  let tempDelta = (Math.random() * 2 - 1) * CONFIG.TEMP_STEP_MAX;
  
  // If cooling is ON, bias the random walk downward so it visibly falls
  if (STATE.coolingOn) {
    tempDelta -= 0.18;
  } else {
    // If getting close to limit without cooling, subtle upward drift
    if (STATE.temp < 8.5) {
      tempDelta += 0.05;
    }
  }

  STATE.temp += tempDelta;
  // Clamp within bounds
  STATE.temp = Math.max(CONFIG.TEMP_MIN, Math.min(CONFIG.TEMP_MAX, STATE.temp));
  STATE.temp = Math.round(STATE.temp * 10) / 10;

  // --- COOLING ON / OFF THRESHOLDS ---
  if (!STATE.coolingOn && STATE.temp > CONFIG.COOLING_LIMIT) {
    STATE.coolingOn = true;
    STATE.coolingRunningSeconds = 0;
    addActivity("cooling-on", `Temperature reached ${STATE.temp.toFixed(1)} °C. 3 wall coolers started automatically.`);
  } else if (STATE.coolingOn && STATE.temp <= CONFIG.COOLING_HYSTERESIS_OFF) {
    STATE.coolingOn = false;
    const nowStr = formatClockTime(new Date());
    SAMPLE_DATA.coolingUnits.forEach(u => u.lastRanStr = `Last ran at ${nowStr}`);
    addActivity("cooling-off", `Temperature back to normal (${STATE.temp.toFixed(1)} °C). Cooling stopped.`);
  }

  // --- HUMIDITY RANDOM WALK ---
  let humDelta = (Math.random() * 2 - 1) * CONFIG.HUMIDITY_STEP_MAX;
  if (STATE.coolingOn) {
    humDelta -= 0.2; // slight de-humidifying when coolers run
  }
  STATE.humidity += humDelta;
  STATE.humidity = Math.max(CONFIG.HUMIDITY_MIN, Math.min(CONFIG.HUMIDITY_MAX, STATE.humidity));
  STATE.humidity = Math.round(STATE.humidity * 10) / 10;

  // Push to history
  STATE.tempHistory.push(STATE.temp);
  if (STATE.tempHistory.length > CONFIG.CHART_POINTS) STATE.tempHistory.shift();

  STATE.humidityHistory.push(STATE.humidity);
  if (STATE.humidityHistory.length > CONFIG.CHART_POINTS) STATE.humidityHistory.shift();

  // --- POWER RANDOM WALK ---
  const powerTarget = STATE.coolingOn ? 82.5 : 46.5;
  const powerDelta = (Math.random() - 0.5) * 0.8;
  STATE.power = Math.round((powerTarget + powerDelta) * 10) / 10;
  STATE.powerHistory.push(STATE.power);
  if (STATE.powerHistory.length > CONFIG.CHART_POINTS) STATE.powerHistory.shift();

  // Smooth Count Number Animation
  animateValue("temp-big-val", STATE.displayedTemp, STATE.temp, 600, 1);
  animateValue("hum-big-val", STATE.displayedHumidity, STATE.humidity, 600, 0);
  animateValue("power-big-val", STATE.displayedPower, STATE.power, 600, 1);
  STATE.displayedTemp = STATE.temp;
  STATE.displayedHumidity = STATE.humidity;
  STATE.displayedPower = STATE.power;

  // Render Visuals
  renderMetrics();
  renderSparklines();
  renderCoolingCard();
  updateHealthSummary();

  // Update "Last updated: just now"
  const updatedTag = document.getElementById("last-updated-text");
  updatedTag.textContent = "Last updated: just now";
  STATE.lastUpdateTimestamp = Date.now();
}

/**
 * Smoothly interpolates numerical values in DOM
 */
function animateValue(elementId, startVal, endVal, durationMs, decimals) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const startTime = performance.now();

  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    // Ease out cubic
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = startVal + (endVal - startVal) * ease;
    el.textContent = current.toFixed(decimals);
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.textContent = endVal.toFixed(decimals);
    }
  }
  requestAnimationFrame(update);
}

/* ============================================================================
   METRICS & CARD RENDERING
   ============================================================================ */
function renderMetrics() {
  // 1. Temperature Card Status
  const tempChip = document.getElementById("temp-status-chip");
  if (tempChip) {
    if (STATE.temp > CONFIG.COOLING_LIMIT) {
      tempChip.className = "status-pill-badge pill-red";
      tempChip.innerHTML = `<span class="pill-status-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg></span><span class="pill-status-text">Too warm</span>`;
    } else if (STATE.temp >= 9.0) {
      tempChip.className = "status-pill-badge pill-amber";
      tempChip.innerHTML = `<span class="pill-status-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg></span><span class="pill-status-text">Near limit</span>`;
    } else {
      tempChip.className = "status-pill-badge pill-normal";
      tempChip.innerHTML = `<span class="pill-status-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span><span class="pill-status-text">Normal</span>`;
    }
  }

  // Cooling Chip in Temp Card
  const coolingChip = document.getElementById("temp-cooling-chip");
  const coolingChipText = document.getElementById("temp-cooling-chip-text");
  if (coolingChip && coolingChipText) {
    if (STATE.coolingOn) {
      coolingChip.className = "cooling-inline-chip chip-on";
      coolingChipText.textContent = "Cooling: ON";
    } else {
      coolingChip.className = "cooling-inline-chip chip-off";
      coolingChipText.textContent = "Cooling: OFF";
    }
  }

  // Temperature Gauge Fill & Slider Thumb
  // Range 5.0 to 12.0 °C
  const gaugePct = Math.max(0, Math.min(100, ((STATE.temp - 5.0) / (12.0 - 5.0)) * 100));
  const tempGaugeFill = document.getElementById("temp-gauge-fill");
  if (tempGaugeFill) tempGaugeFill.style.width = `${gaugePct}%`;
  const tempSliderThumb = document.getElementById("temp-slider-thumb");
  if (tempSliderThumb) tempSliderThumb.style.left = `${gaugePct}%`;

  // 2. Humidity Card Status
  const humChip = document.getElementById("hum-status-chip");
  if (humChip) {
    if (STATE.humidity > 92) {
      humChip.className = "status-pill-badge pill-amber";
      humChip.innerHTML = `<span class="pill-status-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg></span><span class="pill-status-text">Slightly high</span>`;
    } else if (STATE.humidity < 80) {
      humChip.className = "status-pill-badge pill-amber";
      humChip.innerHTML = `<span class="pill-status-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg></span><span class="pill-status-text">Slightly low</span>`;
    } else {
      humChip.className = "status-pill-badge pill-normal";
      humChip.innerHTML = `<span class="pill-status-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span><span class="pill-status-text">Good for storage</span>`;
    }
  }

  // Humidity Gauge Fill & Slider Thumb (70 to 100%)
  const humPct = Math.max(0, Math.min(100, ((STATE.humidity - 70) / (100 - 70)) * 100));
  const humGaugeFill = document.getElementById("hum-gauge-fill");
  if (humGaugeFill) humGaugeFill.style.width = `${humPct}%`;
  const humSliderThumb = document.getElementById("hum-slider-thumb");
  if (humSliderThumb) humSliderThumb.style.left = `${humPct}%`;

  // 3. Power Consumption Card Status & Gauge
  const powerChip = document.getElementById("power-status-chip");
  const powerModeBadge = document.getElementById("power-mode-badge");
  const powerSubSummary = document.getElementById("power-sub-summary");
  const powerDailyEst = document.getElementById("power-daily-est");

  if (STATE.power > 75.0) {
    if (powerChip) {
      powerChip.className = "status-pill-badge pill-amber";
      powerChip.innerHTML = `<span class="pill-status-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span><span class="pill-status-text">HVAC Compressors Active</span>`;
    }
    if (powerModeBadge) {
      powerModeBadge.textContent = "Peak HVAC Load";
      powerModeBadge.style.color = "#D97706";
      powerModeBadge.style.background = "#FEF3C7";
    }
    if (powerSubSummary) powerSubSummary.textContent = `Active Load: ${STATE.power.toFixed(1)} kW`;
  } else {
    if (powerChip) {
      powerChip.className = "status-pill-badge pill-normal";
      powerChip.innerHTML = `<span class="pill-status-icon">●</span><span class="pill-status-text">Baseline Facility Load</span>`;
    }
    if (powerModeBadge) {
      powerModeBadge.textContent = "Grid Normal";
      powerModeBadge.style.color = "#F57C00";
      powerModeBadge.style.background = "rgba(245, 124, 0, 0.12)";
    }
    if (powerSubSummary) powerSubSummary.textContent = `Baseline Load: ${STATE.power.toFixed(1)} kW`;
  }

  // Daily estimate: power * 24h
  const dailyKWh = Math.round(STATE.power * 24);
  if (powerDailyEst) powerDailyEst.textContent = `Daily Est: ~${dailyKWh.toLocaleString()} kWh`;

  // Power Gauge Fill & Slider Thumb (20 to 120 kW)
  const powerPct = Math.max(0, Math.min(100, ((STATE.power - 20) / (120 - 20)) * 100));
  const powerGaugeFill = document.getElementById("power-gauge-fill");
  if (powerGaugeFill) powerGaugeFill.style.width = `${powerPct}%`;
  const powerSliderThumb = document.getElementById("power-slider-thumb");
  if (powerSliderThumb) powerSliderThumb.style.left = `${powerPct}%`;
}

/**
 * Dedicated Cooling Units Card Rendering
 */
function renderCoolingCard() {
  const summaryEl = document.getElementById("cooling-units-summary");
  const summaryStatusEl = document.getElementById("summary-cooling-status");

  if (STATE.coolingOn) {
    summaryEl.textContent = "3 of 3 running";
    summaryStatusEl.textContent = "Cooling: Running";
  } else {
    summaryEl.textContent = "All units off";
    summaryStatusEl.textContent = "Cooling: Off";
  }

  for (let i = 1; i <= 3; i++) {
    const tile = document.getElementById(`unit-tile-${i}`);
    const pill = document.getElementById(`unit-pill-${i}`);
    const timeEl = document.getElementById(`unit-time-${i}`);
    const loadFill = document.getElementById(`unit-load-${i}`);
    const unitMeta = SAMPLE_DATA.coolingUnits[i - 1];

    if (STATE.coolingOn) {
      if (tile) tile.classList.add("running");
      if (pill) {
        pill.textContent = "Running";
        pill.className = "unit-pill pill-blue";
      }
      if (loadFill) loadFill.style.width = "100%";

      const mins = Math.floor(STATE.coolingRunningSeconds / 60);
      const secs = STATE.coolingRunningSeconds % 60;
      if (timeEl) timeEl.textContent = `Running for ${mins > 0 ? mins + ' min ' : ''}${secs}s`;
    } else {
      if (tile) tile.classList.remove("running");
      if (pill) {
        pill.textContent = "Off";
        pill.className = "unit-pill pill-grey";
      }
      if (loadFill) loadFill.style.width = "0%";
      if (timeEl) timeEl.textContent = (unitMeta && unitMeta.lastRanStr) ? unitMeta.lastRanStr : "Standby • Ready";
    }
  }
}

function updateCoolingTimer() {
  if (STATE.coolingOn) {
    STATE.coolingRunningSeconds++;
    const mins = Math.floor(STATE.coolingRunningSeconds / 60);
    const secs = STATE.coolingRunningSeconds % 60;
    for (let i = 1; i <= 3; i++) {
      const timeEl = document.getElementById(`unit-time-${i}`);
      if (timeEl) timeEl.textContent = `Running for ${mins > 0 ? mins + ' min ' : ''}${secs}s`;
    }
  }
}

/**
 * Updates the Warehouse Health Summary Card
 */
function updateHealthSummary() {
  let freshCount = 0;
  let spoiledCount = 0;
  Object.values(STATE.cartons).forEach(c => {
    if (c.status === "spoiled") spoiledCount++;
    else freshCount++;
  });

  const totalCartons = Math.max(1, freshCount + spoiledCount);
  const activeSpills = SAMPLE_DATA.areas.filter(a => a.hasSpill).length;
  const freshPct = Math.round((freshCount / totalCartons) * 100);

  const freshEl = document.getElementById("hc-fresh-count");
  const spoiledEl = document.getElementById("hc-spoiled-count");
  const spillsEl = document.getElementById("hc-spills-count");

  if (freshEl) freshEl.textContent = freshCount;
  if (spoiledEl) spoiledEl.textContent = spoiledCount;
  if (spillsEl) spillsEl.textContent = activeSpills;

  // Micro status tags inside health boxes
  const freshSubEl = document.getElementById("hc-fresh-sub");
  const spoiledSubEl = document.getElementById("hc-spoiled-sub");
  const spillsSubEl = document.getElementById("hc-spills-sub");

  if (freshSubEl) freshSubEl.textContent = `${freshPct}% Intact`;
  if (spoiledSubEl) {
    spoiledSubEl.textContent = spoiledCount === 0 ? "Zero Decay" : `${spoiledCount} Decayed`;
    spoiledSubEl.className = `hc-micro-tag ${spoiledCount === 0 ? 'tag-neutral' : 'tag-danger'}`;
  }
  if (spillsSubEl) {
    spillsSubEl.textContent = activeSpills === 0 ? "6 Aisles Dry" : `${activeSpills} Wet`;
    spillsSubEl.className = `hc-micro-tag ${activeSpills === 0 ? 'tag-green' : 'tag-danger'}`;
  }

  // Toggle alert border/background on boxes
  const spoiledBox = document.querySelector(".health-count-box.box-spoiled");
  const spillBox = document.querySelector(".health-count-box.box-spill");
  if (spoiledBox) spoiledBox.classList.toggle("has-alert", spoiledCount > 0);
  if (spillBox) spillBox.classList.toggle("has-alert", activeSpills > 0);

  // Per-Rack Vegetable Health Breakdown (Fills the white space with existing icons)
  const rackCounts = { A: { fresh: 0, spoiled: 0 }, B: { fresh: 0, spoiled: 0 }, C: { fresh: 0, spoiled: 0 }, D: { fresh: 0, spoiled: 0 } };
  Object.values(STATE.cartons).forEach(c => {
    if (rackCounts[c.rack]) {
      if (c.status === "spoiled") rackCounts[c.rack].spoiled++;
      else rackCounts[c.rack].fresh++;
    }
  });

  const tomEl = document.getElementById("h-count-tomatoes");
  const rootEl = document.getElementById("h-count-roots");
  const grnEl = document.getElementById("h-count-greens");
  const carEl = document.getElementById("h-count-carrots");

  if (tomEl) {
    tomEl.textContent = `${rackCounts.A.fresh}/6 Fresh`;
    tomEl.classList.toggle("has-spoiled", rackCounts.A.spoiled > 0);
  }
  if (rootEl) {
    rootEl.textContent = `${rackCounts.B.fresh}/6 Fresh`;
    rootEl.classList.toggle("has-spoiled", rackCounts.B.spoiled > 0);
  }
  if (grnEl) {
    grnEl.textContent = `${rackCounts.C.fresh}/6 Fresh`;
    grnEl.classList.toggle("has-spoiled", rackCounts.C.spoiled > 0);
  }
  if (carEl) {
    carEl.textContent = `${rackCounts.D.fresh}/6 Fresh`;
    carEl.classList.toggle("has-spoiled", rackCounts.D.spoiled > 0);
  }

  const opStatusEl = document.getElementById("summary-operational-status");
  if (opStatusEl) {
    opStatusEl.textContent = STATE.coolingOn ? "3 AC units cooling active" : "3 AC units on standby";
  }

  // Update filter buttons chip counts
  const filterFreshCount = document.querySelector("#filter-fresh .chip-count");
  const filterSpoiledCount = document.querySelector("#filter-spoiled .chip-count");
  if (filterFreshCount) filterFreshCount.textContent = freshCount;
  if (filterSpoiledCount) filterSpoiledCount.textContent = spoiledCount;

  // Calculate comfort / health score (0-100%)
  let comfortScore = 100;
  if (spoiledCount > 0) comfortScore -= spoiledCount * 12;
  if (activeSpills > 0) comfortScore -= activeSpills * 10;
  if (STATE.temp > CONFIG.COOLING_LIMIT) comfortScore -= 15;
  else if (STATE.temp >= 9.0) comfortScore -= 6;
  if (STATE.humidity < 75 || STATE.humidity > 95) comfortScore -= 8;
  comfortScore = Math.max(10, Math.min(100, comfortScore));

  const comfortScoreVal = document.getElementById("comfort-score-val");
  if (comfortScoreVal) comfortScoreVal.textContent = `${comfortScore}%`;

  const comfortArc = document.getElementById("comfort-arc-fill");
  if (comfortArc) {
    // Arc length is 110
    const offset = 110 * (1 - comfortScore / 100);
    comfortArc.style.strokeDashoffset = `${offset}`;
  }

  const overallHealthPill = document.getElementById("overall-health-pill");
  if (overallHealthPill) {
    if (activeSpills === 0 && spoiledCount === 0 && STATE.temp <= CONFIG.COOLING_LIMIT) {
      overallHealthPill.className = "status-pill-badge pill-normal";
      overallHealthPill.innerHTML = `<span class="pill-status-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span><span class="pill-status-text">All Clear</span>`;
    } else if (spoiledCount > 0 || activeSpills > 0) {
      const alertNum = spoiledCount + activeSpills;
      overallHealthPill.className = "status-pill-badge pill-red";
      overallHealthPill.innerHTML = `<span class="pill-status-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg></span><span class="pill-status-text">${alertNum} Alert${alertNum > 1 ? "s" : ""}</span>`;
    } else {
      overallHealthPill.className = "status-pill-badge pill-amber";
      overallHealthPill.innerHTML = `<span class="pill-status-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg></span><span class="pill-status-text">Near Limit</span>`;
    }
  }

  // Update Row 3 spill badges
  const spillPillTag = document.getElementById("pill-active-spills-tag");
  const spillCleanTag = document.getElementById("pill-clean-areas-tag");
  const spillText = document.getElementById("pill-spills-text");
  const noSpillBanner = document.getElementById("no-spills-banner");
  const spillPaneBadge = document.getElementById("spill-pane-status-badge");

  if (activeSpills > 0) {
    if (spillPillTag) spillPillTag.style.display = "inline-flex";
    if (spillText) spillText.textContent = `${activeSpills} Active Spill${activeSpills > 1 ? "s" : ""} Detected`;
    if (spillCleanTag) spillCleanTag.textContent = `${6 - activeSpills} Areas Clear`;
    if (noSpillBanner) noSpillBanner.style.display = "none";
    if (spillPaneBadge) spillPaneBadge.textContent = "Waiting for clean-up";
  } else {
    if (spillPillTag) spillPillTag.style.display = "none";
    if (spillCleanTag) spillCleanTag.textContent = "6 Areas Clear";
    if (noSpillBanner) noSpillBanner.style.display = "block";
    if (spillPaneBadge) spillPaneBadge.textContent = "All Areas Clear";
  }
}

/* ============================================================================
   SPARKLINES GENERATOR (SVG - NO EXTERNAL LIBRARIES)
   ============================================================================ */
function initHistories() {
  STATE.tempHistory = [];
  STATE.humidityHistory = [];
  STATE.powerHistory = [];

  let t = 7.0;
  let h = 83.0;
  let p = 46.5;
  for (let i = 0; i < CONFIG.CHART_POINTS; i++) {
    t += (Math.random() - 0.48) * 0.15;
    h += (Math.random() - 0.48) * 0.4;
    p += (Math.random() - 0.48) * 0.5;
    STATE.tempHistory.push(Math.round(t * 10) / 10);
    STATE.humidityHistory.push(Math.round(h * 10) / 10);
    STATE.powerHistory.push(Math.round(p * 10) / 10);
  }
  STATE.temp = STATE.tempHistory[STATE.tempHistory.length - 1];
  STATE.humidity = STATE.humidityHistory[STATE.humidityHistory.length - 1];
  STATE.power = STATE.powerHistory[STATE.powerHistory.length - 1];
  STATE.displayedPower = STATE.power;
}

function renderSparklines() {
  drawSvgSparkline("temp-chart-svg", STATE.tempHistory, CONFIG.COLORS.brandOrange, CONFIG.COOLING_LIMIT, true);
  drawSvgSparkline("hum-chart-svg", STATE.humidityHistory, CONFIG.COLORS.blue, null, false);
  drawSvgSparkline("power-chart-svg", STATE.powerHistory, "#D97706", 90.0, true);
}

function drawSvgSparkline(svgId, data, color, thresholdVal, showThreshold) {
  const svg = document.getElementById(svgId);
  if (!svg || data.length < 2) return;

  const width = 280;
  const height = 48;
  const padding = 6;

  let min = Math.min(...data);
  let max = Math.max(...data);

  if (thresholdVal !== null) {
    min = Math.min(min, thresholdVal - 1.5);
    max = Math.max(max, thresholdVal + 1.5);
  }

  if (max - min < 2) {
    max += 1;
    min -= 1;
  }

  const range = max - min;
  const getY = (val) => height - padding - ((val - min) / range) * (height - padding * 2);

  let pathD = "";
  const step = width / (data.length - 1);
  data.forEach((val, i) => {
    const x = i * step;
    const y = getY(val);
    if (i === 0) pathD += `M ${x} ${y}`;
    else pathD += ` L ${x} ${y}`;
  });

  let innerSvg = "";

  // Dashed threshold line
  if (showThreshold && thresholdVal !== null) {
    const threshY = getY(thresholdVal);
    innerSvg += `<line x1="0" y1="${threshY}" x2="${width}" y2="${threshY}" stroke="#EF4444" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.8"/>`;
  }

  // Sparkline stroke path
  innerSvg += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;

  svg.innerHTML = innerSvg;
}

/* ============================================================================
   CARTON STATUS GRID (24 Tiles: 4 Racks x 6 Cartons)
   ============================================================================ */
function initCartonGrid() {
  const container = document.getElementById("carton-grid-matrix");
  container.innerHTML = "";

  SAMPLE_DATA.racks.forEach(rack => {
    const rackRow = document.createElement("div");
    rackRow.className = "rack-row";

    // Left Rack Label Box (Sticky)
    const labelBox = document.createElement("div");
    labelBox.className = "rack-label-box";
    labelBox.innerHTML = `
      <span class="rack-tag">${rack.name}</span>
      <span class="rack-veg-hint">${rack.hint}</span>
    `;

    // Row of 6 Carton Tiles
    const tilesRow = document.createElement("div");
    tilesRow.className = "rack-tiles-row";

    for (let col = 1; col <= 6; col++) {
      const cartonId = `${rack.id}-0${col}`;
      const veg = rack.getVeg(col - 1);
      const isSpoiled = Boolean(SAMPLE_DATA.spoiledCartons[cartonId]);

      STATE.cartons[cartonId] = {
        id: cartonId,
        rackId: rack.id,
        rackName: rack.name,
        vegetable: veg.name,
        category: rack.category,
        status: isSpoiled ? "spoiled" : "fresh",
        spoiledInfo: isSpoiled ? SAMPLE_DATA.spoiledCartons[cartonId] : null
      };

      const tile = document.createElement("div");
      tile.className = `carton-tile ${isSpoiled ? "spoiled" : "fresh"}`;
      tile.id = `carton-tile-${cartonId}`;
      tile.onclick = () => openCartonDrawer(cartonId);

      tile.innerHTML = `
        <div class="tile-top-row">
          <span class="tile-id">${cartonId}</span>
          <span class="tile-status-pill ${isSpoiled ? "spoiled" : "fresh"}">${isSpoiled ? "Spoiled" : "Fresh"}</span>
        </div>
        <div class="tile-veg-name" style="display:flex;align-items:center;gap:6px;">${getVegetableSvg(veg.name, 14)} <span>${veg.name}</span></div>
        
        <!-- Micro Freshness Visual Bar -->
        <div class="carton-micro-meter">
          <div class="carton-micro-fill ${isSpoiled ? "spoiled" : "fresh"}" style="width: ${isSpoiled ? "18%" : "96%"};"></div>
        </div>

        ${isSpoiled ? `
          <div class="tile-spoiled-time">
            <span class="pulse-dot-red" style="width:5px;height:5px;"></span>
            <span>Since ${(SAMPLE_DATA.spoiledCartons[cartonId] && SAMPLE_DATA.spoiledCartons[cartonId].spoiledTime) ? SAMPLE_DATA.spoiledCartons[cartonId].spoiledTime : "Just now"}</span>
          </div>
        ` : ""}
      `;

      tilesRow.appendChild(tile);
    }

    rackRow.appendChild(labelBox);
    rackRow.appendChild(tilesRow);
    container.appendChild(rackRow);
  });
}

function filterCartons(filter) {
  STATE.activeFilter = filter;

  document.getElementById("filter-all").classList.toggle("active", filter === "all");
  document.getElementById("filter-fresh").classList.toggle("active", filter === "fresh");
  document.getElementById("filter-spoiled").classList.toggle("active", filter === "spoiled");

  Object.values(STATE.cartons).forEach(c => {
    const tile = document.getElementById(`carton-tile-${c.id}`);
    if (!tile) return;

    if (filter === "all") {
      tile.classList.remove("hidden-filter");
    } else if (filter === "fresh") {
      tile.classList.toggle("hidden-filter", c.status !== "fresh");
    } else if (filter === "spoiled") {
      tile.classList.toggle("hidden-filter", c.status !== "spoiled");
    }
  });
}

function openCartonDrawer(cartonId) {
  const c = STATE.cartons[cartonId];
  if (!c) return;

  document.getElementById("drawer-carton-id").textContent = c.id;
  document.getElementById("drawer-carton-veg").innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;">${getVegetableSvg(c.vegetable, 18)} <span>${c.vegetable}</span></span>`;
  document.getElementById("drawer-rack-val").textContent = c.rackName;
  document.getElementById("drawer-category-val").textContent = c.category;

  const statusPill = document.getElementById("drawer-status-pill");
  const statusText = document.getElementById("drawer-status-text");
  const actionBox = document.getElementById("drawer-action-box");
  const actionDesc = document.getElementById("drawer-action-desc");
  const gasVal = document.getElementById("drawer-gas-val");

  if (c.status === "spoiled") {
    statusPill.className = "drawer-status-pill spoiled";
    statusText.textContent = "Spoiled";
    gasVal.textContent = "High (0.18 ppm ethylene)";
    if (actionBox) actionBox.classList.remove("hidden");
    const spReason = (c.spoiledInfo && c.spoiledInfo.reason) ? c.spoiledInfo.reason : "Elevated gas detected";
    const spTime = (c.spoiledInfo && c.spoiledInfo.spoiledTime) ? c.spoiledInfo.spoiledTime : "Just now";
    if (actionDesc) actionDesc.textContent = `Recommended: Remove and replace this carton immediately. (${spReason}, flagged at ${spTime}).`;
  } else {
    statusPill.className = "drawer-status-pill fresh";
    statusText.textContent = "Fresh";
    gasVal.textContent = "Normal (< 0.02 ppm)";
    if (actionBox) actionBox.classList.add("hidden");
  }

  document.getElementById("carton-drawer").classList.add("open");
}

function replaceCartonFromDashboard() {
  const cartonId = document.getElementById("drawer-carton-id").textContent.trim();
  const c = STATE.cartons[cartonId];
  if (!c) return;

  c.status = "fresh";
  c.spoiledInfo = null;
  updateSingleCartonTile(cartonId);
  updateHealthSummary();
  addActivity("cleaned", `Carton ${cartonId} (${c.vegetable}) replaced with fresh stock.`);
  closeCartonDrawer();

  // Notify simulation tab via BroadcastChannel & localStorage
  const payload = {
    type: "DASH_REPLACE_CARTON",
    cartonId: cartonId,
    timestamp: Date.now()
  };

  if (dashSyncChannel) {
    try { dashSyncChannel.postMessage(payload); } catch (e) {}
  }
  try {
    localStorage.setItem("warehouse_dash_action", JSON.stringify(payload));
  } catch (e) {}
}

function closeCartonDrawer() {
  document.getElementById("carton-drawer").classList.remove("open");
}

// Click outside drawer dismisses it
document.addEventListener("click", (e) => {
  const drawer = document.getElementById("carton-drawer");
  if (drawer.classList.contains("open") && !drawer.contains(e.target) && !e.target.closest(".carton-tile")) {
    closeCartonDrawer();
  }
});

/* ============================================================================
   CCTV SPILL SNAPSHOT GENERATION (HTML5 CANVAS)
   NOTE: Put in one function so images can be swapped with real photos from
   an /assets/spills/ directory by updating the return value of getSpillPhotoUrl()
   ============================================================================ */
function generateAllSpillImages() {
  // Generate snapshots with different puddle coordinates & shapes
  STATE.spillImages["rack-c"] = generateRealisticCCTVImage({
    camId: "CAM-3",
    timestamp: "07/10/2026 11:15:32",
    zoneTitle: "RACK C AISLE",
    puddleX: 250,
    puddleY: 180,
    puddleRadiusX: 85,
    puddleRadiusY: 50,
    rackSide: "left"
  });

  STATE.spillImages["loading-dock"] = generateRealisticCCTVImage({
    camId: "CAM-5",
    timestamp: "07/10/2026 11:02:14",
    zoneTitle: "LOADING DOCK BAY 2",
    puddleX: 230,
    puddleY: 170,
    puddleRadiusX: 100,
    puddleRadiusY: 58,
    rackSide: "top"
  });

  // Past history thumbnails
  STATE.spillImages["thumb-101"] = generateRealisticCCTVImage({
    camId: "CAM-6",
    timestamp: "07/10/2026 09:18:05",
    zoneTitle: "ENTRANCE CORRIDOR",
    puddleX: 240,
    puddleY: 160,
    puddleRadiusX: 70,
    puddleRadiusY: 42,
    rackSide: "right"
  });

  STATE.spillImages["thumb-102"] = generateRealisticCCTVImage({
    camId: "CAM-1",
    timestamp: "06/10/2026 15:40:22",
    zoneTitle: "RACK A AISLE",
    puddleX: 240,
    puddleY: 160,
    puddleRadiusX: 75,
    puddleRadiusY: 46,
    rackSide: "left"
  });

  // Assign images to DOM if spill is active
  const imgRackC = document.getElementById("spill-img-rack-c");
  if (imgRackC && SAMPLE_DATA.areas.find(a => a.id === "rack-c")?.hasSpill) {
    imgRackC.src = STATE.spillImages["rack-c"];
  }

  const imgDock = document.getElementById("spill-img-loading-dock");
  if (imgDock && SAMPLE_DATA.areas.find(a => a.id === "loading-dock")?.hasSpill) {
    imgDock.src = STATE.spillImages["loading-dock"];
  }
}

/**
 * How to replace with real photos:
 * If you add camera images to an assets folder, simply replace this function
 * or return the asset file path e.g.: return `/assets/spills/${config.camId.toLowerCase()}.jpg`;
 */
function generateRealisticCCTVImage(params) {
  const canvas = document.getElementById("cctv-gen-canvas");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  // 1. Concrete floor base with subtle realistic gradient
  const floorGrad = ctx.createLinearGradient(0, 0, w, h);
  floorGrad.addColorStop(0, "#D1D5DB");
  floorGrad.addColorStop(1, "#9CA3AF");
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, 0, w, h);

  // Concrete speckled micro-texture
  ctx.fillStyle = "rgba(0, 0, 0, 0.035)";
  for (let i = 0; i < 400; i++) {
    const rx = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * w;
    const ry = (Math.cos(i * 78.233) * 43758.5453 % 1 + 1) % 1 * h;
    ctx.fillRect(rx, ry, 2, 2);
  }

  // Industrial warehouse floor expansion joints / grid
  ctx.strokeStyle = "rgba(100, 116, 139, 0.4)";
  ctx.lineWidth = 1.2;
  for (let x = 0; x < w; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // High-contrast OSHA yellow safety pedestrian line
  ctx.save();
  ctx.strokeStyle = "#FACC15";
  ctx.lineWidth = 5;
  ctx.setLineDash([16, 8]);
  ctx.beginPath();
  ctx.moveTo(15, h - 30);
  ctx.lineTo(w - 15, h - 30);
  ctx.stroke();
  ctx.restore();

  // 2. Storage shelf edge & corrugated carton boxes
  if (params.rackSide === "left") {
    ctx.fillStyle = "#1E293B";
    ctx.fillRect(0, 0, 65, h);
    // Steel shelf uprights
    ctx.fillStyle = "#F59E0B";
    ctx.fillRect(60, 0, 5, h);
    // Carton boxes stacked on racks
    ctx.fillStyle = "#D97706";
    ctx.fillRect(10, 30, 45, 55);
    ctx.fillRect(10, 110, 45, 55);
    ctx.fillRect(10, 190, 45, 55);
    // Box barcode labels
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(20, 50, 25, 12);
    ctx.fillRect(20, 130, 25, 12);
    ctx.fillRect(20, 210, 25, 12);
  } else if (params.rackSide === "top") {
    ctx.fillStyle = "#1E293B";
    ctx.fillRect(0, 0, w, 50);
    ctx.fillStyle = "#F59E0B";
    ctx.fillRect(0, 46, w, 4);
    // Boxes
    ctx.fillStyle = "#D97706";
    ctx.fillRect(30, 10, 75, 32);
    ctx.fillRect(130, 10, 75, 32);
    ctx.fillRect(230, 10, 75, 32);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(45, 20, 30, 10);
    ctx.fillRect(145, 20, 30, 10);
  } else {
    ctx.fillStyle = "#1E293B";
    ctx.fillRect(w - 65, 0, 65, h);
    ctx.fillStyle = "#F59E0B";
    ctx.fillRect(w - 65, 0, 5, h);
  }

  // 3. Fluid liquid puddle with specular water reflections
  ctx.save();
  // Outer wet sheen
  ctx.fillStyle = "rgba(14, 165, 233, 0.22)";
  ctx.beginPath();
  ctx.ellipse(params.puddleX, params.puddleY, params.puddleRadiusX + 8, params.puddleRadiusY + 6, -0.1, 0, Math.PI * 2);
  ctx.fill();

  // Core volume of liquid
  const puddleGrad = ctx.createRadialGradient(
    params.puddleX - 10, params.puddleY - 8, 5,
    params.puddleX, params.puddleY, params.puddleRadiusX
  );
  puddleGrad.addColorStop(0, "rgba(56, 189, 248, 0.75)");
  puddleGrad.addColorStop(0.7, "rgba(2, 132, 199, 0.65)");
  puddleGrad.addColorStop(1, "rgba(3, 105, 161, 0.5)");

  ctx.fillStyle = puddleGrad;
  ctx.beginPath();
  ctx.ellipse(params.puddleX, params.puddleY, params.puddleRadiusX, params.puddleRadiusY, -0.1, 0, Math.PI * 2);
  ctx.fill();

  // Edge meniscus
  ctx.strokeStyle = "rgba(2, 132, 199, 0.9)";
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Specular glossy reflection ripples
  ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
  ctx.beginPath();
  ctx.ellipse(params.puddleX - 22, params.puddleY - 12, params.puddleRadiusX * 0.38, params.puddleRadiusY * 0.25, -0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.beginPath();
  ctx.ellipse(params.puddleX + 15, params.puddleY + 8, params.puddleRadiusX * 0.25, params.puddleRadiusY * 0.18, -0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 4. Object Detection AI Bounding Box
  ctx.save();
  ctx.strokeStyle = "#EF4444";
  ctx.lineWidth = 1.8;
  ctx.setLineDash([5, 3]);
  const boxX = params.puddleX - params.puddleRadiusX - 14;
  const boxY = params.puddleY - params.puddleRadiusY - 12;
  const boxW = params.puddleRadiusX * 2 + 28;
  const boxH = params.puddleRadiusY * 2 + 24;
  ctx.strokeRect(boxX, boxY, boxW, boxH);
  ctx.setLineDash([]);

  // Minimal AI detection tag
  ctx.fillStyle = "rgba(239, 68, 68, 0.92)";
  ctx.fillRect(boxX, boxY - 16, 126, 16);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "600 9px monospace";
  ctx.fillText("AI DETECT: LIQUID 98.4%", boxX + 5, boxY - 4);
  ctx.restore();

  // 5. Security Camera Vignette (darkened lens corners)
  const vignette = ctx.createRadialGradient(w/2, h/2, w*0.35, w/2, h/2, w*0.65);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(15,23,42,0.45)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  // 6. Security HUD Header Banner
  ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
  ctx.fillRect(0, 0, w, 24);

  // Pulsing red REC indicator
  ctx.fillStyle = "#EF4444";
  ctx.beginPath();
  ctx.arc(14, 12, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "600 10px monospace";
  ctx.fillText(`REC ${params.camId} HD`, 24, 15);

  ctx.fillStyle = "#94A3B8";
  ctx.font = "500 10px monospace";
  ctx.fillText(`${params.timestamp} • ${params.zoneTitle}`, w - 245, 15);

  // Faint scanlines
  ctx.fillStyle = "rgba(0, 0, 0, 0.03)";
  for (let y = 0; y < h; y += 3) {
    ctx.fillRect(0, y, w, 1);
  }

  return canvas.toDataURL("image/jpeg", 0.92);
}

/* ============================================================================
   SPILL MAP & AREAS LIST INTERACTIVITY
   ============================================================================ */
function selectSpillArea(areaId) {
  // Clear previous SVG selections
  document.querySelectorAll(".map-zone").forEach(z => z.classList.remove("selected"));

  // Highlight selected SVG area
  const zoneEl = document.getElementById(`map-area-${areaId}`);
  if (zoneEl) zoneEl.classList.add("selected");

  // Scroll to / highlight relevant alert card if present
  const alertCard = document.getElementById(`spill-card-${areaId}`);
  if (alertCard) {
    alertCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    alertCard.style.outline = "2px solid #F57C00";
    setTimeout(() => {
      alertCard.style.outline = "none";
    }, 2000);
  }
}

function renderAreasTable() {
  const tbody = document.getElementById("areas-table-body");
  tbody.innerHTML = "";

  SAMPLE_DATA.areas.forEach(a => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.onclick = () => selectSpillArea(a.id);

    tr.innerHTML = `
      <td><strong>${a.name}</strong></td>
      <td style="color:#64748B;">${a.cam}</td>
      <td>
        <span class="${a.hasSpill ? "tbl-pill-red" : "tbl-pill-green"}">
          ${a.hasSpill ? "Spill detected" : "No spill"}
        </span>
      </td>
      <td style="color:#64748B;">${a.lastChecked}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderSpillHistory() {
  const list = document.getElementById("spill-history-list");
  list.innerHTML = "";

  SAMPLE_DATA.spillHistory.forEach(item => {
    const div = document.createElement("div");
    div.className = "history-item";
    const thumbUrl = STATE.spillImages[`thumb-${item.thumbSeed}`];

    div.innerHTML = `
      <div class="history-left">
        ${thumbUrl ? `<img src="${thumbUrl}" class="history-thumb" alt="Spill archive" onclick="openPhotoModalDirect('${thumbUrl}', '${item.area} (Resolved)')">` : ""}
        <div>
          <span class="history-text">${item.area}</span>
          <span style="font-size:10px;color:#64748B;display:block;">${item.cam} &bull; ${item.time}</span>
        </div>
      </div>
      <span class="history-pill">Cleaned</span>
    `;
    list.appendChild(div);
  });
}

function acknowledgeClean(areaId) {
  const area = SAMPLE_DATA.areas.find(a => a.id === areaId);
  if (!area) return;

  area.hasSpill = false;
  area.lastChecked = "Just now";

  // Hide alert card
  updateSpillAlertCard(areaId, false);

  // Update SVG Map Area
  const mapZone = document.getElementById(`map-area-${areaId}`);
  if (mapZone) {
    mapZone.className.baseVal = "map-zone zone-clear";
    const badge = mapZone.querySelector(".zone-status-badge");
    if (badge) {
      badge.className.baseVal = "zone-status-badge badge-green";
      badge.querySelector("text").textContent = "No spill";
    }
    const puddleDot = mapZone.querySelector(".map-puddle-dot");
    if (puddleDot) puddleDot.remove();
  }

  // Add to Activity Feed
  addActivity("cleaned", `Liquid spill at ${area.name} marked as cleaned.`);

  renderAreasTable();
  updateHealthSummary();
}

/* ============================================================================
   PHOTO MODAL DIALOG
   ============================================================================ */
function openPhotoModal(areaId) {
  const url = STATE.spillImages[areaId];
  const area = SAMPLE_DATA.areas.find(a => a.id === areaId);
  if (!url || !area) return;

  document.getElementById("modal-enlarged-img").src = url;
  document.getElementById("modal-area-title").textContent = `Liquid Spill • ${area.name}`;
  document.getElementById("modal-cam-badge").textContent = `${area.cam} • CCTV SNAPSHOT`;
  document.getElementById("photo-modal").classList.remove("hidden");
}

function openPhotoModalDirect(url, title) {
  document.getElementById("modal-enlarged-img").src = url;
  document.getElementById("modal-area-title").textContent = title;
  document.getElementById("modal-cam-badge").textContent = "CCTV ARCHIVE";
  document.getElementById("photo-modal").classList.remove("hidden");
}

function inspectCamera(camId, zoneName) {
  const areaKeyMap = {
    "CAM-1": "rack-a",
    "CAM-2": "rack-b",
    "CAM-3": "rack-c",
    "CAM-4": "rack-d",
    "CAM-5": "loading-dock",
    "CAM-6": "entrance"
  };
  const areaKey = areaKeyMap[camId] || "rack-c";

  let imgUrl = STATE.spillImages[areaKey];
  if (!imgUrl) {
    imgUrl = generateRealisticCCTVImage({
      camId: camId,
      timestamp: formatClockTime(new Date()),
      zoneTitle: zoneName.toUpperCase(),
      puddleX: -200,
      puddleY: -200,
      puddleRadiusX: 0,
      puddleRadiusY: 0,
      rackSide: camId === "CAM-5" ? "top" : "left"
    });
    STATE.spillImages[areaKey] = imgUrl;
  }

  document.getElementById("modal-enlarged-img").src = imgUrl;
  document.getElementById("modal-area-title").textContent = `${zoneName} • ${camId}`;
  document.getElementById("modal-cam-badge").textContent = `${camId} • LIVE CCTV INSPECTION`;
  document.getElementById("photo-modal").classList.remove("hidden");
}

function closePhotoModal() {
  document.getElementById("photo-modal").classList.add("hidden");
}

function handleModalBackdropClick(e) {
  if (e.target.id === "photo-modal") {
    closePhotoModal();
  }
}

/* ============================================================================
   RECENT ACTIVITY FEED
   ============================================================================ */
function renderActivityFeed() {
  const list = document.getElementById("activity-feed-list");
  list.innerHTML = "";

  SAMPLE_DATA.initialActivities.forEach(item => {
    const el = createActivityDomItem(item);
    list.appendChild(el);
  });
}

function addActivity(type, message, photoKey = null) {
  const nowStr = formatClockTime(new Date());
  const item = {
    type,
    message,
    time: nowStr,
    hasPhoto: photoKey,
    unread: true
  };

  const list = document.getElementById("activity-feed-list");
  const el = createActivityDomItem(item);
  list.prepend(el);
}

function createActivityDomItem(item) {
  const div = document.createElement("div");
  div.className = `activity-item type-${item.type} ${item.unread ? "unread" : ""}`;

  let iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>`;
  if (item.type === "spill") {
    iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#0284C7"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`;
  } else if (item.type === "spoil") {
    iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#DC2626"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="1" fill="#DC2626"/></svg>`;
  } else if (item.type === "cooling-on") {
    iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0284C7" stroke-width="2"><path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07l14.14-14.14"/></svg>`;
  } else if (item.type === "cooling-off") {
    iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>`;
  } else if (item.type === "cleaned") {
    iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
  }

  const thumbUrl = item.hasPhoto ? STATE.spillImages[item.hasPhoto] : null;

  div.innerHTML = `
    <span class="act-icon" style="display:inline-flex;align-items:center;justify-content:center;">${iconSvg}</span>
    <div class="act-content">
      <div class="act-msg">${item.message}</div>
      <div class="act-time">${item.time}</div>
    </div>
    ${thumbUrl ? `
      <img src="${thumbUrl}" class="act-thumb-img" alt="CCTV Snapshot" title="Click to enlarge" onclick="openPhotoModal('${item.hasPhoto}')">
    ` : ""}
  `;
  return div;
}

/* ============================================================================
   UTILITY HELPERS (CLOCK, TIME STRINGS)
   ============================================================================ */
function updateLiveClock() {
  const now = new Date();
  const clockEl = document.getElementById("dash-clock");
  if (clockEl) clockEl.textContent = formatClockTime(now, true);
}

function formatClockTime(date, withSeconds = false) {
  let hours = date.getHours();
  const mins = date.getMinutes().toString().padStart(2, "0");
  const secs = date.getSeconds().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  if (withSeconds) {
    return `${hours.toString().padStart(2, "0")}:${mins}:${secs} ${ampm}`;
  }
  return `${hours.toString().padStart(2, "0")}:${mins} ${ampm}`;
}

/* ============================================================================
   HISTORICAL TELEMETRY (PREVIOUS YEAR - 2025) & MODAL SYSTEM
   Interactive graph & numerical tabular view for Temperature, Humidity and Power
   ============================================================================ */
const HISTORICAL_DATA_2025 = {
  temperature: [
    { month: "Jan", fullName: "January", avg: 5.2, min: 3.8, max: 6.8, coolingDays: 0, compliance: 100, status: "Optimal", badgeClass: "badge-green" },
    { month: "Feb", fullName: "February", avg: 5.6, min: 4.1, max: 7.2, coolingDays: 0, compliance: 100, status: "Optimal", badgeClass: "badge-green" },
    { month: "Mar", fullName: "March", avg: 6.3, min: 4.7, max: 7.9, coolingDays: 2, compliance: 99.4, status: "Optimal", badgeClass: "badge-green" },
    { month: "Apr", fullName: "April", avg: 7.0, min: 5.2, max: 8.7, coolingDays: 5, compliance: 99.0, status: "Normal", badgeClass: "badge-blue" },
    { month: "May", fullName: "May", avg: 7.8, min: 5.9, max: 9.6, coolingDays: 12, compliance: 98.5, status: "Normal", badgeClass: "badge-blue" },
    { month: "Jun", fullName: "June", avg: 8.8, min: 6.7, max: 10.9, coolingDays: 23, compliance: 97.8, status: "Cooling Active", badgeClass: "badge-amber" },
    { month: "Jul", fullName: "July", avg: 9.5, min: 7.3, max: 11.5, coolingDays: 28, compliance: 97.2, status: "Peak Summer", badgeClass: "badge-red" },
    { month: "Aug", fullName: "August", avg: 9.2, min: 7.1, max: 11.2, coolingDays: 26, compliance: 97.5, status: "Peak Summer", badgeClass: "badge-red" },
    { month: "Sep", fullName: "September", avg: 8.1, min: 6.1, max: 9.9, coolingDays: 16, compliance: 98.2, status: "Normal", badgeClass: "badge-blue" },
    { month: "Oct", fullName: "October", avg: 6.9, min: 5.0, max: 8.5, coolingDays: 4, compliance: 99.1, status: "Normal", badgeClass: "badge-blue" },
    { month: "Nov", fullName: "November", avg: 6.0, min: 4.3, max: 7.4, coolingDays: 1, compliance: 99.6, status: "Optimal", badgeClass: "badge-green" },
    { month: "Dec", fullName: "December", avg: 5.3, min: 3.9, max: 6.7, coolingDays: 0, compliance: 100, status: "Optimal", badgeClass: "badge-green" }
  ],
  humidity: [
    { month: "Jan", fullName: "January", avg: 84.8, min: 81.0, max: 88.5, dehumidDays: 0, compliance: 100, status: "Optimal RH", badgeClass: "badge-green" },
    { month: "Feb", fullName: "February", avg: 85.2, min: 81.5, max: 89.0, dehumidDays: 0, compliance: 100, status: "Optimal RH", badgeClass: "badge-green" },
    { month: "Mar", fullName: "March", avg: 85.9, min: 82.0, max: 90.2, dehumidDays: 1, compliance: 99.7, status: "Optimal RH", badgeClass: "badge-green" },
    { month: "Apr", fullName: "April", avg: 86.4, min: 82.4, max: 91.0, dehumidDays: 3, compliance: 99.2, status: "Normal", badgeClass: "badge-blue" },
    { month: "May", fullName: "May", avg: 87.1, min: 83.0, max: 92.5, dehumidDays: 6, compliance: 98.8, status: "Normal", badgeClass: "badge-blue" },
    { month: "Jun", fullName: "June", avg: 89.5, min: 84.5, max: 94.8, dehumidDays: 14, compliance: 98.1, status: "High Humidity", badgeClass: "badge-amber" },
    { month: "Jul", fullName: "July", avg: 91.2, min: 86.0, max: 96.2, dehumidDays: 22, compliance: 97.4, status: "Monsoon Surge", badgeClass: "badge-red" },
    { month: "Aug", fullName: "August", avg: 90.8, min: 85.5, max: 95.8, dehumidDays: 19, compliance: 97.6, status: "Monsoon Surge", badgeClass: "badge-red" },
    { month: "Sep", fullName: "September", avg: 88.6, min: 83.8, max: 93.4, dehumidDays: 11, compliance: 98.5, status: "Normal", badgeClass: "badge-blue" },
    { month: "Oct", fullName: "October", avg: 86.8, min: 82.2, max: 91.2, dehumidDays: 4, compliance: 99.3, status: "Normal", badgeClass: "badge-blue" },
    { month: "Nov", fullName: "November", avg: 85.5, min: 81.8, max: 89.4, dehumidDays: 1, compliance: 99.8, status: "Optimal RH", badgeClass: "badge-green" },
    { month: "Dec", fullName: "December", avg: 84.9, min: 81.2, max: 88.8, dehumidDays: 0, compliance: 100, status: "Optimal RH", badgeClass: "badge-green" }
  ],
  power: [
    { month: "Jan", fullName: "January", totalKWh: 33400, baseKWh: 27400, hvacKWh: 6000, dailyKWh: 1077, peakKW: 52.4, hvacShare: 18, cost: 4008, status: "High Efficiency", badgeClass: "badge-green" },
    { month: "Feb", fullName: "February", totalKWh: 31800, baseKWh: 25800, hvacKWh: 6000, dailyKWh: 1135, peakKW: 51.8, hvacShare: 19, cost: 3816, status: "High Efficiency", badgeClass: "badge-green" },
    { month: "Mar", fullName: "March", totalKWh: 35200, baseKWh: 26800, hvacKWh: 8400, dailyKWh: 1135, peakKW: 56.2, hvacShare: 24, cost: 4224, status: "High Efficiency", badgeClass: "badge-green" },
    { month: "Apr", fullName: "April", totalKWh: 38900, baseKWh: 27600, hvacKWh: 11300, dailyKWh: 1296, peakKW: 62.0, hvacShare: 29, cost: 4668, status: "Normal Load", badgeClass: "badge-blue" },
    { month: "May", fullName: "May", totalKWh: 44600, baseKWh: 27600, hvacKWh: 17000, dailyKWh: 1438, peakKW: 71.5, hvacShare: 38, cost: 5352, status: "Normal Load", badgeClass: "badge-blue" },
    { month: "Jun", fullName: "June", totalKWh: 54100, baseKWh: 26500, hvacKWh: 27600, dailyKWh: 1803, peakKW: 83.2, hvacShare: 51, cost: 6492, status: "Heavy HVAC Load", badgeClass: "badge-amber" },
    { month: "Jul", fullName: "July", totalKWh: 58200, baseKWh: 25600, hvacKWh: 32600, dailyKWh: 1877, peakKW: 88.6, hvacShare: 56, cost: 6984, status: "Peak Summer Load", badgeClass: "badge-red" },
    { month: "Aug", fullName: "August", totalKWh: 56800, baseKWh: 26100, hvacKWh: 30700, dailyKWh: 1832, peakKW: 86.4, hvacShare: 54, cost: 6816, status: "Heavy HVAC Load", badgeClass: "badge-amber" },
    { month: "Sep", fullName: "September", totalKWh: 45900, baseKWh: 27100, hvacKWh: 18800, dailyKWh: 1530, peakKW: 74.8, hvacShare: 41, cost: 5508, status: "Normal Load", badgeClass: "badge-blue" },
    { month: "Oct", fullName: "October", totalKWh: 37800, baseKWh: 27200, hvacKWh: 10600, dailyKWh: 1219, peakKW: 60.1, hvacShare: 28, cost: 4536, status: "Normal Load", badgeClass: "badge-blue" },
    { month: "Nov", fullName: "November", totalKWh: 34500, baseKWh: 27300, hvacKWh: 7200, dailyKWh: 1150, peakKW: 54.0, hvacShare: 21, cost: 4140, status: "High Efficiency", badgeClass: "badge-green" },
    { month: "Dec", fullName: "December", totalKWh: 33200, baseKWh: 27200, hvacKWh: 6000, dailyKWh: 1070, peakKW: 52.0, hvacShare: 18, cost: 3984, status: "High Efficiency", badgeClass: "badge-green" }
  ]
};

function openHistoryModal(type = "temp") {
  STATE.historyTab = type;
  const modal = document.getElementById("history-modal");
  if (!modal) return;

  modal.classList.remove("hidden");
  switchHistoryTab(type);
}

function closeHistoryModal() {
  const modal = document.getElementById("history-modal");
  if (modal) modal.classList.add("hidden");
}

function handleHistoryModalBackdrop(e) {
  if (e.target.id === "history-modal") {
    closeHistoryModal();
  }
}

// Global escape listener for modals
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeHistoryModal();
    if (typeof closePhotoModal === "function") closePhotoModal();
  }
});

function switchHistoryTab(type) {
  STATE.historyTab = type;

  const btnTemp = document.getElementById("tab-btn-temp");
  const btnHum = document.getElementById("tab-btn-humidity");
  const btnPower = document.getElementById("tab-btn-power");

  if (btnTemp) btnTemp.classList.toggle("active", type === "temp");
  if (btnHum) btnHum.classList.toggle("active", type === "humidity");
  if (btnPower) btnPower.classList.toggle("active", type === "power");

  updateHistoryModalContent();
}

function updateHistoryModalContent() {
  const isTemp = STATE.historyTab === "temp";
  const isHum = STATE.historyTab === "humidity";
  const isPower = STATE.historyTab === "power";

  const iconBadge = document.getElementById("history-modal-icon-badge");
  const headerIcon = document.getElementById("history-header-icon");
  const typeTag = document.getElementById("history-type-tag");
  const titleEl = document.getElementById("history-modal-title");
  const subtitleEl = document.getElementById("history-modal-subtitle");
  const graphTitle = document.getElementById("history-graph-title");
  const graphCaption = document.getElementById("history-graph-caption");
  const tableTitle = document.getElementById("history-table-title");
  const tableCaption = document.getElementById("history-table-caption");

  if (isTemp) {
    if (iconBadge) {
      iconBadge.className = "history-icon-badge temp-theme";
    }
    if (headerIcon) {
      headerIcon.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>`;
    }
    if (typeTag) typeTag.textContent = "COLD-CHAIN THERMAL AUDIT";
    if (titleEl) titleEl.textContent = "Annual Temperature History (Previous Year - 2025)";
    if (subtitleEl) subtitleEl.textContent = "Monthly temperature telemetry, min/max bounds & seasonal cooling thresholds";
    if (graphTitle) graphTitle.textContent = "12-Month Temperature Trend & Target Band (°C)";
    if (graphCaption) graphCaption.textContent = "Safe produce storage range (4.0°C – 8.0°C) with 10.0°C cooling trigger line";
    if (tableTitle) tableTitle.textContent = "Monthly Temperature Telemetry Table (2025)";
    if (tableCaption) tableCaption.textContent = "Historical monthly average, minimum, maximum, cooling runtime days and cold-chain compliance";

    renderTempKPIs();
    renderTempGraph();
    renderTempTable();
  } else if (isHum) {
    if (iconBadge) {
      iconBadge.className = "history-icon-badge humidity-theme";
    }
    if (headerIcon) {
      headerIcon.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`;
    }
    if (typeTag) typeTag.textContent = "HUMIDITY & MOISTURE RETENTION AUDIT";
    if (titleEl) titleEl.textContent = "Annual Relative Humidity History (Previous Year - 2025)";
    if (subtitleEl) subtitleEl.textContent = "Monthly relative humidity (RH %) telemetry, safe vegetable moisture bands & condensation limits";
    if (graphTitle) graphTitle.textContent = "12-Month Relative Humidity Trend & Target Band (% RH)";
    if (graphCaption) graphCaption.textContent = "Target vegetable storage range (80.0% – 92.0% RH) with 95.0% condensation risk threshold";
    if (tableTitle) tableTitle.textContent = "Monthly Humidity Telemetry Table (2025)";
    if (tableCaption) tableCaption.textContent = "Audited monthly average, min/max bounds, dehumidifier operational days and moisture compliance";

    renderHumidityKPIs();
    renderHumidityGraph();
    renderHumidityTable();
  } else {
    if (iconBadge) {
      iconBadge.className = "history-icon-badge power-theme";
    }
    if (headerIcon) {
      headerIcon.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
    }
    if (typeTag) typeTag.textContent = "FACILITY ENERGY & GRID AUDIT";
    if (titleEl) titleEl.textContent = "Annual Power Consumption Records (Previous Year - 2025)";
    if (subtitleEl) subtitleEl.textContent = "Monthly energy consumption breakdown in kWh, peak load demand (kW), and seasonal HVAC share";
    if (graphTitle) graphTitle.textContent = "12-Month Facility Power Consumption Breakdown (kWh)";
    if (graphCaption) graphCaption.textContent = "Base facility grid load (cyan) vs seasonal HVAC AC cooling surge (amber) with 90 kW threshold";
    if (tableTitle) tableTitle.textContent = "Monthly Energy & Power Consumption Table (2025)";
    if (tableCaption) tableCaption.textContent = "Total monthly kWh, daily averages, peak demand kW, HVAC percentage and estimated cost";

    renderPowerKPIs();
    renderPowerGraph();
    renderPowerTable();
  }
}

function renderTempKPIs() {
  const kpiRow = document.getElementById("history-kpi-row");
  if (!kpiRow) return;

  kpiRow.innerHTML = `
    <div class="hist-kpi-card">
      <span class="hist-kpi-label">Annual Average</span>
      <div class="hist-kpi-value-row">
        <span class="hist-kpi-num">6.9</span>
        <span class="hist-kpi-unit">°C</span>
      </div>
      <span class="hist-kpi-hint">Optimal Cold-Chain Mean</span>
    </div>
    <div class="hist-kpi-card">
      <span class="hist-kpi-label">Summer Peak Month</span>
      <div class="hist-kpi-value-row">
        <span class="hist-kpi-num">9.5</span>
        <span class="hist-kpi-unit">°C</span>
      </div>
      <span class="hist-kpi-hint alert">July (28 Cooling Days)</span>
    </div>
    <div class="hist-kpi-card">
      <span class="hist-kpi-label">Winter Low Month</span>
      <div class="hist-kpi-value-row">
        <span class="hist-kpi-num">5.2</span>
        <span class="hist-kpi-unit">°C</span>
      </div>
      <span class="hist-kpi-hint">January (0 Cooling Days)</span>
    </div>
    <div class="hist-kpi-card">
      <span class="hist-kpi-label">Storage Compliance</span>
      <div class="hist-kpi-value-row">
        <span class="hist-kpi-num">99.2</span>
        <span class="hist-kpi-unit">%</span>
      </div>
      <span class="hist-kpi-hint">Within 4.0 – 8.0°C Range</span>
    </div>
  `;
}

function renderHumidityKPIs() {
  const kpiRow = document.getElementById("history-kpi-row");
  if (!kpiRow) return;

  kpiRow.innerHTML = `
    <div class="hist-kpi-card">
      <span class="hist-kpi-label">Annual Average</span>
      <div class="hist-kpi-value-row">
        <span class="hist-kpi-num">87.2</span>
        <span class="hist-kpi-unit">% RH</span>
      </div>
      <span class="hist-kpi-hint">Optimal Vegetable Retention</span>
    </div>
    <div class="hist-kpi-card">
      <span class="hist-kpi-label">Monsoon Peak Month</span>
      <div class="hist-kpi-value-row">
        <span class="hist-kpi-num">91.2</span>
        <span class="hist-kpi-unit">% RH</span>
      </div>
      <span class="hist-kpi-hint alert">July (22 Dehumidifier Days)</span>
    </div>
    <div class="hist-kpi-card">
      <span class="hist-kpi-label">Winter Low Month</span>
      <div class="hist-kpi-value-row">
        <span class="hist-kpi-num">84.8</span>
        <span class="hist-kpi-unit">% RH</span>
      </div>
      <span class="hist-kpi-hint">January (0 Dehumidifier Days)</span>
    </div>
    <div class="hist-kpi-card">
      <span class="hist-kpi-label">Moisture Compliance</span>
      <div class="hist-kpi-value-row">
        <span class="hist-kpi-num">98.9</span>
        <span class="hist-kpi-unit">%</span>
      </div>
      <span class="hist-kpi-hint">Within 80.0 – 92.0% Safe Band</span>
    </div>
  `;
}

function renderPowerKPIs() {
  const kpiRow = document.getElementById("history-kpi-row");
  if (!kpiRow) return;

  kpiRow.innerHTML = `
    <div class="hist-kpi-card">
      <span class="hist-kpi-label">Total Annual Energy</span>
      <div class="hist-kpi-value-row">
        <span class="hist-kpi-num">508.6</span>
        <span class="hist-kpi-unit">MWh</span>
      </div>
      <span class="hist-kpi-hint">508,600 kWh across 2025</span>
    </div>
    <div class="hist-kpi-card">
      <span class="hist-kpi-label">Monthly Average</span>
      <div class="hist-kpi-value-row">
        <span class="hist-kpi-num">42,383</span>
        <span class="hist-kpi-unit">kWh</span>
      </div>
      <span class="hist-kpi-hint">1,393 kWh Daily Average</span>
    </div>
    <div class="hist-kpi-card">
      <span class="hist-kpi-label">Peak Summer Load</span>
      <div class="hist-kpi-value-row">
        <span class="hist-kpi-num">88.6</span>
        <span class="hist-kpi-unit">kW</span>
      </div>
      <span class="hist-kpi-hint alert">July (56% HVAC Share)</span>
    </div>
    <div class="hist-kpi-card">
      <span class="hist-kpi-label">Annual Energy Cost</span>
      <div class="hist-kpi-value-row">
        <span class="hist-kpi-num">$61,032</span>
      </div>
      <span class="hist-kpi-hint">Est. @ $0.12 / kWh blend</span>
    </div>
  `;
}

function renderTempGraph() {
  const legend = document.getElementById("history-graph-legend");
  if (legend) {
    legend.innerHTML = `
      <div class="legend-pill">
        <span class="legend-color-box" style="background: #10B981; opacity: 0.35;"></span>
        <span>Target Band (4.0–8.0°C)</span>
      </div>
      <div class="legend-pill">
        <span class="legend-color-box" style="background: #F57C00;"></span>
        <span>Monthly Avg (°C)</span>
      </div>
      <div class="legend-pill">
        <span class="legend-color-box" style="background: #DC2626; border-top: 2px dashed #DC2626; height: 0;"></span>
        <span>Cooling Limit (10.0°C)</span>
      </div>
    `;
  }

  const svg = document.getElementById("history-svg-chart");
  if (!svg) return;

  const data = HISTORICAL_DATA_2025.temperature;
  const width = 960;
  const height = 250;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 30;
  const padBottom = 35;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Temperature Y scale: 0°C to 12.0°C
  const yMin = 0;
  const yMax = 12.0;
  const scaleY = (v) => padTop + chartH - ((v - yMin) / (yMax - yMin)) * chartH;

  const yTargetMin = scaleY(8.0);
  const yTargetMax = scaleY(4.0);
  const targetH = yTargetMax - yTargetMin;
  const yLimit = scaleY(10.0);

  // Background Grid Lines
  let gridSvg = `
    <!-- Target Safe Zone (4.0 - 8.0°C) -->
    <rect x="${padLeft}" y="${yTargetMin}" width="${chartW}" height="${targetH}" fill="#10B981" fill-opacity="0.12" rx="4"/>
    <line x1="${padLeft}" y1="${scaleY(4.0)}" x2="${width - padRight}" y2="${scaleY(4.0)}" stroke="#10B981" stroke-width="1" stroke-dasharray="3 3"/>
    <line x1="${padLeft}" y1="${scaleY(8.0)}" x2="${width - padRight}" y2="${scaleY(8.0)}" stroke="#10B981" stroke-width="1" stroke-dasharray="3 3"/>
    
    <!-- 10.0°C Cooling Limit Line -->
    <line x1="${padLeft}" y1="${yLimit}" x2="${width - padRight}" y2="${yLimit}" stroke="#DC2626" stroke-width="1.8" stroke-dasharray="5 3"/>
    <text x="${width - padRight - 6}" y="${yLimit - 6}" font-size="10" font-weight="700" fill="#DC2626" text-anchor="end">Limit 10.0°C</text>
  `;

  // Horizontal guide lines & Y labels
  [0, 4, 8, 10, 12].forEach(v => {
    const y = scaleY(v);
    gridSvg += `
      <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="#E2E8F0" stroke-width="1"/>
      <text x="${padLeft - 8}" y="${y + 3}" font-size="10" font-weight="600" fill="#64748B" text-anchor="end">${v}°C</text>
    `;
  });

  // Bars & Points for 12 months
  const colStep = chartW / 12;
  const barW = Math.min(36, colStep * 0.55);

  let barsSvg = "";
  const points = [];

  data.forEach((item, idx) => {
    const cx = padLeft + idx * colStep + colStep / 2;
    const yAvg = scaleY(item.avg);
    const yMinPt = scaleY(item.min);
    const yMaxPt = scaleY(item.max);
    points.push(`${cx},${yAvg}`);

    const barH = (padTop + chartH) - yAvg;
    const barX = cx - barW / 2;
    const isPeak = item.avg > 8.5;
    const fillColor = isPeak ? "url(#grad-bar-warm)" : "url(#grad-bar-normal)";

    barsSvg += `
      <!-- Min-Max range whisker -->
      <line x1="${cx}" y1="${yMinPt}" x2="${cx}" y2="${yMaxPt}" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="${cx - 4}" y1="${yMinPt}" x2="${cx + 4}" y2="${yMinPt}" stroke="#94A3B8" stroke-width="1.5"/>
      <line x1="${cx - 4}" y1="${yMaxPt}" x2="${cx + 4}" y2="${yMaxPt}" stroke="#94A3B8" stroke-width="1.5"/>

      <!-- Bar -->
      <rect x="${barX}" y="${yAvg}" width="${barW}" height="${barH}" fill="${fillColor}" rx="4">
        <title>${item.fullName}: Avg ${item.avg}°C (Min ${item.min}°C, Max ${item.max}°C) • ${item.coolingDays} cooling days</title>
      </rect>

      <!-- Value text on top -->
      <text x="${cx}" y="${yAvg - 8}" font-size="11" font-weight="700" fill="${isPeak ? '#D97706' : '#1E293B'}" text-anchor="middle">${item.avg.toFixed(1)}°</text>

      <!-- Month Label -->
      <text x="${cx}" y="${height - 10}" font-size="11" font-weight="600" fill="#475569" text-anchor="middle">${item.month}</text>
    `;
  });

  // Trendline connecting averages
  const polylineSvg = `
    <polyline points="${points.join(' ')}" fill="none" stroke="#F57C00" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  `;

  svg.innerHTML = `
    <defs>
      <linearGradient id="grad-bar-normal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.85"/>
        <stop offset="100%" stop-color="#0284C7" stop-opacity="0.4"/>
      </linearGradient>
      <linearGradient id="grad-bar-warm" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="#D97706" stop-opacity="0.45"/>
      </linearGradient>
    </defs>
    ${gridSvg}
    ${barsSvg}
    ${polylineSvg}
  `;
}

function renderHumidityGraph() {
  const legend = document.getElementById("history-graph-legend");
  if (legend) {
    legend.innerHTML = `
      <div class="legend-pill">
        <span class="legend-color-box" style="background: #0284C7; opacity: 0.28;"></span>
        <span>Safe Target Band (80–92% RH)</span>
      </div>
      <div class="legend-pill">
        <span class="legend-color-box" style="background: #0284C7;"></span>
        <span>Monthly Avg RH (%)</span>
      </div>
      <div class="legend-pill">
        <span class="legend-color-box" style="background: #DC2626; border-top: 2px dashed #DC2626; height: 0;"></span>
        <span>Mold/Condensation Risk (95% RH)</span>
      </div>
    `;
  }

  const svg = document.getElementById("history-svg-chart");
  if (!svg) return;

  const data = HISTORICAL_DATA_2025.humidity;
  const width = 960;
  const height = 250;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 30;
  const padBottom = 35;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Humidity scale: 60% to 100% RH
  const yMin = 60;
  const yMax = 100;
  const scaleY = (v) => padTop + chartH - ((v - yMin) / (yMax - yMin)) * chartH;

  const yTargetMin = scaleY(92.0);
  const yTargetMax = scaleY(80.0);
  const targetH = yTargetMax - yTargetMin;
  const yLimit = scaleY(95.0);

  // Background Grid Lines
  let gridSvg = `
    <!-- Target Safe Zone (80 - 92% RH) -->
    <rect x="${padLeft}" y="${yTargetMin}" width="${chartW}" height="${targetH}" fill="#0284C7" fill-opacity="0.10" rx="4"/>
    <line x1="${padLeft}" y1="${scaleY(80.0)}" x2="${width - padRight}" y2="${scaleY(80.0)}" stroke="#0284C7" stroke-width="1" stroke-dasharray="3 3"/>
    <line x1="${padLeft}" y1="${scaleY(92.0)}" x2="${width - padRight}" y2="${scaleY(92.0)}" stroke="#0284C7" stroke-width="1" stroke-dasharray="3 3"/>
    
    <!-- 95.0% Mold Risk Line -->
    <line x1="${padLeft}" y1="${yLimit}" x2="${width - padRight}" y2="${yLimit}" stroke="#DC2626" stroke-width="1.8" stroke-dasharray="5 3"/>
    <text x="${width - padRight - 6}" y="${yLimit - 6}" font-size="10" font-weight="700" fill="#DC2626" text-anchor="end">Risk Limit 95.0%</text>
  `;

  // Horizontal guide lines & Y labels
  [60, 70, 80, 90, 95, 100].forEach(v => {
    const y = scaleY(v);
    gridSvg += `
      <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="#E2E8F0" stroke-width="1"/>
      <text x="${padLeft - 8}" y="${y + 3}" font-size="10" font-weight="600" fill="#64748B" text-anchor="end">${v}%</text>
    `;
  });

  // Bars & Points for 12 months
  const colStep = chartW / 12;
  const barW = Math.min(36, colStep * 0.55);

  let barsSvg = "";
  const points = [];

  data.forEach((item, idx) => {
    const cx = padLeft + idx * colStep + colStep / 2;
    const yAvg = scaleY(item.avg);
    const yMinPt = scaleY(item.min);
    const yMaxPt = scaleY(item.max);
    points.push(`${cx},${yAvg}`);

    const barH = (padTop + chartH) - yAvg;
    const barX = cx - barW / 2;
    const isHigh = item.avg > 90.0;
    const fillColor = isHigh ? "url(#grad-hum-high)" : "url(#grad-hum-normal)";

    barsSvg += `
      <!-- Min-Max range whisker -->
      <line x1="${cx}" y1="${yMinPt}" x2="${cx}" y2="${yMaxPt}" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="${cx - 4}" y1="${yMinPt}" x2="${cx + 4}" y2="${yMinPt}" stroke="#94A3B8" stroke-width="1.5"/>
      <line x1="${cx - 4}" y1="${yMaxPt}" x2="${cx + 4}" y2="${yMaxPt}" stroke="#94A3B8" stroke-width="1.5"/>

      <!-- Bar -->
      <rect x="${barX}" y="${yAvg}" width="${barW}" height="${barH}" fill="${fillColor}" rx="4">
        <title>${item.fullName}: Avg ${item.avg}% RH (Min ${item.min}%, Max ${item.max}%) • ${item.dehumidDays} dehumidifier days</title>
      </rect>

      <!-- Value text on top -->
      <text x="${cx}" y="${yAvg - 8}" font-size="11" font-weight="700" fill="${isHigh ? '#D97706' : '#0284C7'}" text-anchor="middle">${item.avg.toFixed(1)}%</text>

      <!-- Month Label -->
      <text x="${cx}" y="${height - 10}" font-size="11" font-weight="600" fill="#475569" text-anchor="middle">${item.month}</text>
    `;
  });

  const polylineSvg = `
    <polyline points="${points.join(' ')}" fill="none" stroke="#0284C7" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  `;

  svg.innerHTML = `
    <defs>
      <linearGradient id="grad-hum-normal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.85"/>
        <stop offset="100%" stop-color="#0284C7" stop-opacity="0.35"/>
      </linearGradient>
      <linearGradient id="grad-hum-high" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FB923C" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#EA580C" stop-opacity="0.4"/>
      </linearGradient>
    </defs>
    ${gridSvg}
    ${barsSvg}
    ${polylineSvg}
  `;
}

function renderPowerGraph() {
  const legend = document.getElementById("history-graph-legend");
  if (legend) {
    legend.innerHTML = `
      <div class="legend-pill">
        <span class="legend-color-box" style="background: #38BDF8;"></span>
        <span>Base Facility Load (kWh)</span>
      </div>
      <div class="legend-pill">
        <span class="legend-color-box" style="background: #F59E0B;"></span>
        <span>HVAC Cooling AC Load (kWh)</span>
      </div>
      <div class="legend-pill">
        <span class="legend-color-box" style="background: #DC2626; border-top: 2px dashed #DC2626; height: 0;"></span>
        <span>Peak Limit (90 kW)</span>
      </div>
    `;
  }

  const svg = document.getElementById("history-svg-chart");
  if (!svg) return;

  const data = HISTORICAL_DATA_2025.power;
  const width = 960;
  const height = 250;
  const padLeft = 55;
  const padRight = 20;
  const padTop = 30;
  const padBottom = 35;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Max scale: 0 to 70,000 kWh
  const yMin = 0;
  const yMax = 70000;
  const scaleY = (v) => padTop + chartH - ((v - yMin) / (yMax - yMin)) * chartH;

  // Background Grid Lines
  let gridSvg = "";
  [0, 20000, 40000, 60000].forEach(v => {
    const y = scaleY(v);
    gridSvg += `
      <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="#E2E8F0" stroke-width="1"/>
      <text x="${padLeft - 8}" y="${y + 3}" font-size="10" font-weight="600" fill="#64748B" text-anchor="end">${v === 0 ? '0' : (v/1000) + 'k'}</text>
    `;
  });

  // Stacked Bars for 12 months
  const colStep = chartW / 12;
  const barW = Math.min(38, colStep * 0.6);

  let barsSvg = "";
  const points = [];

  data.forEach((item, idx) => {
    const cx = padLeft + idx * colStep + colStep / 2;
    const barX = cx - barW / 2;

    const yBase = scaleY(item.baseKWh);
    const baseH = (padTop + chartH) - yBase;

    const yTotal = scaleY(item.totalKWh);
    const hvacH = yBase - yTotal;

    points.push(`${cx},${yTotal}`);

    barsSvg += `
      <!-- Base Load Segment -->
      <rect x="${barX}" y="${yBase}" width="${barW}" height="${baseH}" fill="#38BDF8" rx="2">
        <title>${item.fullName}: Base Load ${item.baseKWh.toLocaleString()} kWh</title>
      </rect>

      <!-- HVAC Cooling Segment (Stacked) -->
      <rect x="${barX}" y="${yTotal}" width="${barW}" height="${hvacH}" fill="#F59E0B" rx="3">
        <title>${item.fullName}: HVAC Cooling ${item.hvacKWh.toLocaleString()} kWh (${item.hvacShare}%) • Total: ${item.totalKWh.toLocaleString()} kWh</title>
      </rect>

      <!-- Value text on top -->
      <text x="${cx}" y="${yTotal - 7}" font-size="10.5" font-weight="700" fill="#0F172A" text-anchor="middle">${(item.totalKWh / 1000).toFixed(1)}k</text>

      <!-- Month Label -->
      <text x="${cx}" y="${height - 10}" font-size="11" font-weight="600" fill="#475569" text-anchor="middle">${item.month}</text>
    `;
  });

  // Trendline connecting monthly totals
  const polylineSvg = `
    <polyline points="${points.join(' ')}" fill="none" stroke="#D97706" stroke-width="2" stroke-dasharray="3 3"/>
  `;

  svg.innerHTML = `
    ${gridSvg}
    ${barsSvg}
    ${polylineSvg}
  `;
}

function renderTempTable() {
  const thead = document.getElementById("history-table-head");
  const tbody = document.getElementById("history-table-body");
  const tfoot = document.getElementById("history-table-foot");

  if (thead) {
    thead.innerHTML = `
      <tr>
        <th>Month</th>
        <th>Avg Temp (°C)</th>
        <th>Min Recorded</th>
        <th>Max Recorded</th>
        <th>Cooling Run Days</th>
        <th>Thermal Compliance</th>
        <th>Quality Rating</th>
      </tr>
    `;
  }

  if (tbody) {
    tbody.innerHTML = HISTORICAL_DATA_2025.temperature.map(row => `
      <tr>
        <td><strong>${row.fullName} (2025)</strong></td>
        <td><span style="font-weight:700; color:#0F172A;">${row.avg.toFixed(1)} °C</span></td>
        <td style="color:#0284C7;">${row.min.toFixed(1)} °C</td>
        <td style="color:#D97706;">${row.max.toFixed(1)} °C</td>
        <td>${row.coolingDays > 0 ? `<strong>${row.coolingDays} days</strong>` : `<span style="color:#64748B;">0 (Idle)</span>`}</td>
        <td><span style="font-weight:600; color:#059669;">${row.compliance.toFixed(1)}%</span></td>
        <td><span class="tbl-badge ${row.badgeClass}">${row.status}</span></td>
      </tr>
    `).join("");
  }

  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td>Annual Mean / Summary</td>
        <td>6.9 °C</td>
        <td style="color:#0284C7;">3.8 °C (Low)</td>
        <td style="color:#D97706;">11.5 °C (High)</td>
        <td>117 Days Total</td>
        <td>99.2% Compliant</td>
        <td><span class="tbl-badge badge-green">Verified A+</span></td>
      </tr>
    `;
  }
}

function renderHumidityTable() {
  const thead = document.getElementById("history-table-head");
  const tbody = document.getElementById("history-table-body");
  const tfoot = document.getElementById("history-table-foot");

  if (thead) {
    thead.innerHTML = `
      <tr>
        <th>Month</th>
        <th>Avg Humidity (RH)</th>
        <th>Min Recorded</th>
        <th>Max Recorded</th>
        <th>Dehumidifier Days</th>
        <th>RH Compliance</th>
        <th>Quality Rating</th>
      </tr>
    `;
  }

  if (tbody) {
    tbody.innerHTML = HISTORICAL_DATA_2025.humidity.map(row => `
      <tr>
        <td><strong>${row.fullName} (2025)</strong></td>
        <td><span style="font-weight:700; color:#0F172A;">${row.avg.toFixed(1)}% RH</span></td>
        <td style="color:#0284C7;">${row.min.toFixed(1)}%</td>
        <td style="color:#D97706;">${row.max.toFixed(1)}%</td>
        <td>${row.dehumidDays > 0 ? `<strong>${row.dehumidDays} days</strong>` : `<span style="color:#64748B;">0 (Idle)</span>`}</td>
        <td><span style="font-weight:600; color:#059669;">${row.compliance.toFixed(1)}%</span></td>
        <td><span class="tbl-badge ${row.badgeClass}">${row.status}</span></td>
      </tr>
    `).join("");
  }

  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td>Annual Mean / Summary</td>
        <td>87.2% RH</td>
        <td style="color:#0284C7;">81.0% (Low)</td>
        <td style="color:#D97706;">96.2% (High)</td>
        <td>64 Days Total</td>
        <td>98.9% Compliant</td>
        <td><span class="tbl-badge badge-green">Verified A+</span></td>
      </tr>
    `;
  }
}

function renderPowerTable() {
  const thead = document.getElementById("history-table-head");
  const tbody = document.getElementById("history-table-body");
  const tfoot = document.getElementById("history-table-foot");

  if (thead) {
    thead.innerHTML = `
      <tr>
        <th>Month</th>
        <th>Total Energy (kWh)</th>
        <th>Daily Avg (kWh)</th>
        <th>Peak Demand (kW)</th>
        <th>HVAC AC Share</th>
        <th>Est. Cost ($)</th>
        <th>Grid Efficiency</th>
      </tr>
    `;
  }

  if (tbody) {
    tbody.innerHTML = HISTORICAL_DATA_2025.power.map(row => `
      <tr>
        <td><strong>${row.fullName} (2025)</strong></td>
        <td><span style="font-weight:700; color:#0F172A;">${row.totalKWh.toLocaleString()} kWh</span></td>
        <td>${row.dailyKWh.toLocaleString()} kWh</td>
        <td><span style="font-weight:600; color:#D97706;">${row.peakKW.toFixed(1)} kW</span></td>
        <td><strong>${row.hvacShare}%</strong> (${row.hvacKWh.toLocaleString()} kWh)</td>
        <td>$${row.cost.toLocaleString()}</td>
        <td><span class="tbl-badge ${row.badgeClass}">${row.status}</span></td>
      </tr>
    `).join("");
  }

  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td>Annual Total / Summary</td>
        <td>508,600 kWh</td>
        <td>1,393 kWh/day</td>
        <td style="color:#D97706;">88.6 kW (Jul Peak)</td>
        <td>36.4% HVAC Avg</td>
        <td>$61,032 Total</td>
        <td><span class="tbl-badge badge-green">High Efficiency</span></td>
      </tr>
    `;
  }
}

