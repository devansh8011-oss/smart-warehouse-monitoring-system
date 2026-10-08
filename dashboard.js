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

const SAMPLE_DATA = {
  // Starting values
  initialTemp: 7.4,
  initialHumidity: 84.0,

  // Fixed sample carton status (24 total)
  // Spoiled: A-04, B-02, C-05, D-01. All other 20: Fresh.
  spoiledCartons: {
    "A-04": { spoiledTime: "10:42 AM", reason: "Elevated ethylene gas detected" },
    "B-02": { spoiledTime: "10:18 AM", reason: "Skin browning & gas emission" },
    "C-05": { spoiledTime: "10:05 AM", reason: "Wilting & moisture breakdown" },
    "D-01": { spoiledTime: "09:47 AM", reason: "Surface rot detected by optical sensor" }
  },

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
      getVeg: (idx) => ({ name: "Tomatoes", icon: "🍅" })
    },
    {
      id: "B",
      name: "Rack B",
      hint: "Potatoes & Onions",
      category: "Root Vegetables",
      getVeg: (idx) => idx % 2 === 0 ? { name: "Potatoes", icon: "🥔" } : { name: "Onions", icon: "🧅" }
    },
    {
      id: "C",
      name: "Rack C",
      hint: "Spinach & Cabbage",
      category: "Leafy Greens",
      getVeg: (idx) => idx % 2 === 0 ? { name: "Spinach", icon: "🥬" } : { name: "Cabbage", icon: "🥬" }
    },
    {
      id: "D",
      name: "Rack D",
      hint: "Carrots",
      category: "Root Crops",
      getVeg: (idx) => ({ name: "Carrots", icon: "🥕" })
    }
  ],

  // 6 Monitored areas for Liquid Spill Detection
  areas: [
    { id: "rack-a", name: "Rack A Aisle", cam: "CAM-1", hasSpill: false, lastChecked: "Just now" },
    { id: "rack-b", name: "Rack B Aisle", cam: "CAM-2", hasSpill: false, lastChecked: "Just now" },
    { id: "rack-c", name: "Rack C Aisle", cam: "CAM-3", hasSpill: true,  detectedTime: "11:15 AM", lastChecked: "Just now" },
    { id: "rack-d", name: "Rack D Aisle", cam: "CAM-4", hasSpill: false, lastChecked: "Just now" },
    { id: "loading-dock", name: "Loading Dock", cam: "CAM-5", hasSpill: true, detectedTime: "11:02 AM", lastChecked: "Just now" },
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

  // Initial Activity Feed entries (believable history from earlier today)
  initialActivities: [
    { type: "spill", message: "Spill detected at Rack C Aisle (CAM-3). Maintenance alerted.", time: "11:15 AM", hasPhoto: "rack-c", unread: true },
    { type: "spill", message: "Spill detected at Loading Dock (CAM-5). Vision AI flagged puddle.", time: "11:02 AM", hasPhoto: "loading-dock", unread: true },
    { type: "cooling-off", message: "Temperature back to normal (8.1 °C). Cooling stopped.", time: "10:58 AM", unread: false },
    { type: "spoil", message: "Carton A-04 (Tomatoes) has spoiled. Removal suggested.", time: "10:42 AM", unread: false },
    { type: "cooling-on", message: "Temperature reached 10.3 °C. 3 wall coolers started.", time: "10:31 AM", unread: false },
    { type: "spoil", message: "Carton B-02 (Potatoes) has spoiled.", time: "10:18 AM", unread: false },
    { type: "spoil", message: "Carton C-05 (Spinach) has spoiled.", time: "10:05 AM", unread: false },
    { type: "spoil", message: "Carton D-01 (Carrots) has spoiled.", time: "09:47 AM", unread: false },
    { type: "cleaned", message: "Spill at Entrance cleaned up and area cleared.", time: "09:20 AM", unread: false },
    { type: "cooling-off", message: "Morning facility cycle complete. Target temperature met.", time: "08:50 AM", unread: false }
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
  
  coolingOn: false,
  coolingRunningSeconds: 0,
  
  tempHistory: [],
  humidityHistory: [],

  cartons: {},
  activeFilter: "all",
  
  spillImages: {}, // Data URLs generated via Canvas

  lastUpdateTimestamp: Date.now(),
  isLiveLinked: false,
  lastSimSyncTime: 0
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

  // 3. Update Cartons States Dynamically
  if (data.cartons) {
    let cartonStateChanged = false;
    Object.keys(data.cartons).forEach(cid => {
      const simC = data.cartons[cid];
      const dashC = STATE.cartons[cid];
      if (dashC) {
        const newStatus = simC.state === "spoiled" ? "spoiled" : "fresh";
        if (dashC.status !== newStatus) {
          cartonStateChanged = true;
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
          updateSingleCartonTile(cid);
        }
      }
    });

    if (cartonStateChanged) {
      updateHealthSummary();
    }
  }

  // 4. Update Spills Dynamically from Simulation
  if (data.activeSpill) {
    const rackId = (data.activeSpill.nearestRack || "C").toLowerCase();
    const areaId = `rack-${rackId}`;
    const area = SAMPLE_DATA.areas.find(a => a.id === areaId);
    if (area && !area.hasSpill) {
      area.hasSpill = true;
      area.detectedTime = data.activeSpill.timestamp || formatClockTime(new Date());
      if (data.activeSpill.snapshotUrl) {
        STATE.spillImages[areaId] = data.activeSpill.snapshotUrl;
      }
      addActivity("spill", `Liquid spill detected in simulation near Rack ${data.activeSpill.nearestRack}.`, areaId);
      renderAreasTable();
      updateSpillSvgArea(areaId, true);
      updateSpillAlertCard(areaId, true);
      updateHealthSummary();
    }
  } else {
    // If no active spill in simulation, clear simulation-triggered spills if any
    ["rack-a", "rack-b", "rack-d"].forEach(aid => {
      const area = SAMPLE_DATA.areas.find(a => a.id === aid);
      if (area && area.hasSpill) {
        area.hasSpill = false;
        renderAreasTable();
        updateSpillSvgArea(aid, false);
        updateSpillAlertCard(aid, false);
        updateHealthSummary();
      }
    });
  }

  // 5. Render Metric Visuals & UI
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
  const timeBox = tile.querySelector(".tile-spoiled-time, .tile-safe-time");
  if (timeBox) {
    if (isSpoiled) {
      timeBox.className = "tile-spoiled-time";
      const spTime = c.spoiledInfo ? c.spoiledInfo.spoiledTime : "Just now";
      timeBox.innerHTML = `
        <span class="pulse-dot-red" style="width:5px;height:5px;"></span>
        <span>Since ${spTime}</span>
      `;
    } else {
      timeBox.className = "tile-safe-time";
      timeBox.innerHTML = `
        <span class="safe-dot-green"></span>
        <span>Optimal • Gas Normal</span>
      `;
    }
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
      if (txt) txt.textContent = "💧 Spill detected";
    }
  } else {
    mapZone.className.baseVal = "map-zone zone-clear";
    const badge = mapZone.querySelector(".zone-status-badge");
    if (badge) {
      badge.className.baseVal = "zone-status-badge badge-green";
      const txt = badge.querySelector("text");
      if (txt) txt.textContent = "✓ No spill";
    }
  }
}

function updateSpillAlertCard(areaId, hasSpill) {
  const card = document.getElementById(`spill-card-${areaId}`);
  if (card) {
    if (hasSpill) {
      card.style.opacity = "1";
      card.style.pointerEvents = "auto";
      const img = document.getElementById(`spill-img-${areaId}`);
      if (img && STATE.spillImages[areaId]) {
        img.src = STATE.spillImages[areaId];
      }
    } else {
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

  // Smooth Count Number Animation
  animateValue("temp-big-val", STATE.displayedTemp, STATE.temp, 600, 1);
  animateValue("hum-big-val", STATE.displayedHumidity, STATE.humidity, 600, 0);
  STATE.displayedTemp = STATE.temp;
  STATE.displayedHumidity = STATE.humidity;

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
  if (STATE.temp > CONFIG.COOLING_LIMIT) {
    tempChip.textContent = "Too warm";
    tempChip.className = "status-chip chip-red";
  } else if (STATE.temp >= 9.0) {
    tempChip.textContent = "Near limit";
    tempChip.className = "status-chip chip-amber";
  } else {
    tempChip.textContent = "Normal";
    tempChip.className = "status-chip chip-normal";
  }

  // Cooling Chip in Temp Card
  const coolingChip = document.getElementById("temp-cooling-chip");
  const coolingChipText = document.getElementById("temp-cooling-chip-text");
  if (STATE.coolingOn) {
    coolingChip.className = "cooling-inline-chip chip-on";
    coolingChipText.textContent = "Cooling: ON";
  } else {
    coolingChip.className = "cooling-inline-chip chip-off";
    coolingChipText.textContent = "Cooling: OFF";
  }

  // Temperature Gauge Fill
  // Range 5.0 to 12.0 °C
  const gaugePct = Math.max(0, Math.min(100, ((STATE.temp - 5.0) / (12.0 - 5.0)) * 100));
  const tempGaugeFill = document.getElementById("temp-gauge-fill");
  if (tempGaugeFill) tempGaugeFill.style.width = `${gaugePct}%`;

  // Animate SVG Radial Semi-Circle Needle:
  // Operating dial spans 4.0°C (-90deg) to 13.0°C (+90deg)
  const tempAngle = Math.max(-90, Math.min(90, -90 + ((STATE.temp - 4.0) / (13.0 - 4.0)) * 180));
  const needleGroup = document.getElementById("temp-needle-group");
  if (needleGroup) {
    needleGroup.setAttribute("transform", `rotate(${tempAngle.toFixed(1)} 80 80)`);
  }

  // 2. Humidity Card Status
  const humChip = document.getElementById("hum-status-chip");
  if (STATE.humidity > 92) {
    humChip.textContent = "Slightly high";
    humChip.className = "status-chip chip-amber";
  } else if (STATE.humidity < 80) {
    humChip.textContent = "Slightly low";
    humChip.className = "status-chip chip-amber";
  } else {
    humChip.textContent = "Good for storage";
    humChip.className = "status-chip chip-normal";
  }

  // Humidity Gauge Fill (70 to 100%)
  const humPct = Math.max(0, Math.min(100, ((STATE.humidity - 70) / (100 - 70)) * 100));
  const humGaugeFill = document.getElementById("hum-gauge-fill");
  if (humGaugeFill) humGaugeFill.style.width = `${humPct}%`;

  // Humidity Multi-Band Pin: 70% to 100% maps to 0% to 100% width
  const humPin = document.getElementById("hum-gauge-pin");
  if (humPin) {
    humPin.style.left = `${Math.max(2, Math.min(98, humPct))}%`;
  }
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
      if (timeEl) timeEl.textContent = unitMeta.lastRanStr || "Last ran at 10:58 AM";
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

  const activeSpills = SAMPLE_DATA.areas.filter(a => a.hasSpill).length;

  const freshEl = document.getElementById("hc-fresh-count");
  const spoiledEl = document.getElementById("hc-spoiled-count");
  const spillsEl = document.getElementById("hc-spills-count");

  if (freshEl) freshEl.textContent = freshCount;
  if (spoiledEl) spoiledEl.textContent = spoiledCount;
  if (spillsEl) spillsEl.textContent = activeSpills;
}

/* ============================================================================
   SPARKLINES GENERATOR (SVG - NO EXTERNAL LIBRARIES)
   ============================================================================ */
function initHistories() {
  STATE.tempHistory = [];
  STATE.humidityHistory = [];

  let t = 7.0;
  let h = 83.0;
  for (let i = 0; i < CONFIG.CHART_POINTS; i++) {
    t += (Math.random() - 0.48) * 0.15;
    h += (Math.random() - 0.48) * 0.4;
    STATE.tempHistory.push(Math.round(t * 10) / 10);
    STATE.humidityHistory.push(Math.round(h * 10) / 10);
  }
  STATE.temp = STATE.tempHistory[STATE.tempHistory.length - 1];
  STATE.humidity = STATE.humidityHistory[STATE.humidityHistory.length - 1];
}

function renderSparklines() {
  drawSvgSparkline("temp-chart-svg", STATE.tempHistory, CONFIG.COLORS.brandOrange, CONFIG.COOLING_LIMIT, true);
  drawSvgSparkline("hum-chart-svg", STATE.humidityHistory, CONFIG.COLORS.blue, null, false);
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
        icon: veg.icon,
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
        <div class="tile-veg-name">${veg.icon} ${veg.name}</div>
        
        <!-- Micro Freshness Visual Bar -->
        <div class="carton-micro-meter">
          <div class="carton-micro-fill ${isSpoiled ? "spoiled" : "fresh"}" style="width: ${isSpoiled ? "18%" : "96%"};"></div>
        </div>

        ${isSpoiled ? `
          <div class="tile-spoiled-time">
            <span class="pulse-dot-red" style="width:5px;height:5px;"></span>
            <span>Since ${SAMPLE_DATA.spoiledCartons[cartonId].spoiledTime}</span>
          </div>
        ` : `
          <div class="tile-safe-time">
            <span class="safe-dot-green"></span>
            <span>Optimal • Gas Normal</span>
          </div>
        `}
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
  document.getElementById("drawer-carton-veg").textContent = `${c.icon} ${c.vegetable}`;
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
    actionBox.classList.remove("hidden");
    actionDesc.textContent = `Recommended: Remove and replace this carton immediately. (${c.spoiledInfo.reason}, flagged at ${c.spoiledInfo.spoiledTime}).`;
  } else {
    statusPill.className = "drawer-status-pill fresh";
    statusText.textContent = "Fresh";
    gasVal.textContent = "Normal (< 0.02 ppm)";
    actionBox.classList.add("hidden");
  }

  document.getElementById("carton-drawer").classList.add("open");
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

  // Assign images to DOM
  const imgRackC = document.getElementById("spill-img-rack-c");
  if (imgRackC) imgRackC.src = STATE.spillImages["rack-c"];

  const imgDock = document.getElementById("spill-img-loading-dock");
  if (imgDock) imgDock.src = STATE.spillImages["loading-dock"];
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
          ${a.hasSpill ? "💧 Spill detected" : "✓ No spill"}
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
  const card = document.getElementById(`spill-card-${areaId}`);
  if (card) {
    card.style.opacity = "0.5";
    card.style.pointerEvents = "none";
    card.querySelector(".btn-clean-action").textContent = "Cleaned ✓";
  }

  // Update SVG Map Area
  const mapZone = document.getElementById(`map-area-${areaId}`);
  if (mapZone) {
    mapZone.className.baseVal = "map-zone zone-clear";
    const badge = mapZone.querySelector(".zone-status-badge");
    if (badge) {
      badge.className.baseVal = "zone-status-badge badge-green";
      badge.querySelector("text").textContent = "✓ No spill";
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

  let icon = "ℹ️";
  if (item.type === "spill") icon = "💧";
  else if (item.type === "spoil") icon = "🥬";
  else if (item.type === "cooling-on") icon = "❄️";
  else if (item.type === "cooling-off") icon = "✅";
  else if (item.type === "cleaned") icon = "🧹";

  const thumbUrl = item.hasPhoto ? STATE.spillImages[item.hasPhoto] : null;

  div.innerHTML = `
    <span class="act-icon">${icon}</span>
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
