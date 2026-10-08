/**
 * ============================================================================
 * SMART WAREHOUSE MONITORING SYSTEM - SIMULATION PROOF OF CONCEPT
 * Tech: Vanilla JavaScript, Web Audio API, HTML5 Canvas, SVG Manipulation
 * ============================================================================
 */

/* ============================================================================
   GLOBAL CONFIGURATION (All tunable simulation & threshold values)
   Note: Per change request, automatic freshness decay and random spills are removed.
   Cartons and Spills only transition upon explicit user manual action.
   ============================================================================ */
const CONFIG = {
  // Simulation loop tick interval in milliseconds (at 1x speed)
  TICK_INTERVAL_MS: 500,

  // Temperature dynamics
  TEMP_RATE_TO_TARGET: 0.04,     // Fraction of drift towards target per tick
  COOLING_POWER: 0.18,           // Strong downward pull per tick when cooling is active
  TEMP_NOISE_AMPLITUDE: 0.08,    // Subtle alive fluctuation (±0.08°C)
  COOLING_HYSTERESIS_DELTA: 2.0, // Cooling turns OFF when temp reaches (coolingLimit - 2.0)°C

  // Humidity dynamics
  HUMIDITY_DRIFT_RATE: 0.03,     // Drift pull back toward set starting value
  HUMIDITY_NOISE: 0.15,          // Fluctuation per tick (±0.15%)
  COOLING_DEHUMIDIFY_EFFECT: 0.08,// Slight drying effect while coolers run

  // Max history points for dashboard sparkline charts
  CHART_HISTORY_MAX: 60,

  // Vegetable catalog assigned across the 24 cartons
  VEGETABLES: [
    { name: "Tomatoes", icon: "🍅" },
    { name: "Potatoes", icon: "🥔" },
    { name: "Onions",   icon: "🧅" },
    { name: "Spinach",  icon: "🥬" },
    { name: "Cabbage",  icon: "🥬" },
    { name: "Carrots",  icon: "🥕" }
  ],

  // Camera coordinates on the warehouse floor (SVG space: 1000 x 520)
  CAMERAS: [
    { id: "CAM-1", x: 35,  y: 35,  name: "Rack A Aisle",         zone: "rack-a",        rack: "A" },
    { id: "CAM-2", x: 705, y: 35,  name: "Rack B Aisle",         zone: "rack-b",        rack: "B" },
    { id: "CAM-3", x: 35,  y: 485, name: "Rack C Aisle",         zone: "rack-c",        rack: "C" },
    { id: "CAM-4", x: 705, y: 485, name: "Rack D Aisle",         zone: "rack-d",        rack: "D" },
    { id: "CAM-5", x: 965, y: 35,  name: "Loading Dock Bay",     zone: "loading-dock",  rack: "B" },
    { id: "CAM-6", x: 965, y: 485, name: "Facility Entrance",     zone: "entrance",      rack: "D" }
  ],

  // Racks geometric bounding boxes in SVG floor coordinates
  RACKS: [
    { id: "A", name: "Rack A", x: 140, y: 70,  width: 310, height: 150 },
    { id: "B", name: "Rack B", x: 550, y: 70,  width: 310, height: 150 },
    { id: "C", name: "Rack C", x: 140, y: 295, width: 310, height: 150 },
    { id: "D", name: "Rack D", x: 550, y: 295, width: 310, height: 150 }
  ],

  // Visual status color palette
  COLORS: {
    green: "#2E7D32",
    amber: "#F9A825",
    red: "#D32F2F",
    blue: "#1E88E5",
    brandOrange: "#F57C00"
  }
};

/* ============================================================================
   GLOBAL APPLICATION STATE
   ============================================================================ */
const STATE = {
  // Screen & Mode
  currentScreen: "setup", // "setup" | "sim"
  interactiveMode: null,  // null | "pick-carton" | "spill-spot"
  simSpeed: 1,            // 1 | 5
  isMuted: false,

  // User configured settings (from setup screen)
  config: {
    startingTemp: 6.0,
    startingHumidity: 85,
    coolingLimit: 10.0,
    ownerName: "Mr. Sharma",
    ownerPhone: "+91 98XXX XXXXX"
  },

  // Dynamic live readings
  currentTemp: 6.0,
  currentHumidity: 85.0,
  outsideHeatDelta: 0.0,  // From Outside Heat slider (-5 to +20)
  coolingActive: false,
  coolingSecondsActive: 0,

  // Chart data history
  tempHistory: [],
  humidityHistory: [],

  // Cartons (24 items: A-01 to D-06)
  // Per Change Request: only 2 states ("fresh" | "spoiled")
  cartons: {},

  // Liquid spill state
  activeSpill: null, // null | { id, x, y, nearestCam, timestamp, snapshotUrl }

  // Alert tracking & throttling
  alertsSent: {
    coolingOn: false,
    coolingOff: false,
    spoiledCartons: new Set(),
    spillOccurred: false
  },

  // Event log items
  eventLogs: [],

  // WhatsApp messages
  waMessages: [],
  unreadNotifications: [],

  // Guided demo scenario
  demo: {
    isRunning: false,
    currentStep: 0,
    stepTimer: null,
    heatAnimationInterval: null
  },

  // Active timers & audio context
  simIntervalId: null,
  clockIntervalId: null,
  audioCtx: null
};

/* ============================================================================
   INITIALIZATION & SETUP SCREEN HANDLERS
   ============================================================================ */
document.addEventListener("DOMContentLoaded", () => {
  initAudio();
  initEscKeyListener();
  initSimBroadcastListener();
});

/**
 * Validates inputs and transitions to the main simulation screen
 */
function handleStartWarehouse(event) {
  if (event) event.preventDefault();

  const tempIn = parseFloat(document.getElementById("input-temp").value);
  const humIn = parseFloat(document.getElementById("input-humidity").value);
  const limitIn = parseFloat(document.getElementById("input-cooling-limit").value);
  const nameIn = document.getElementById("input-owner-name").value.trim();
  const phoneIn = document.getElementById("input-owner-phone").value.trim();
  const validationBanner = document.getElementById("setup-validation-msg");

  // Friendly Validation
  if (isNaN(tempIn) || isNaN(humIn) || isNaN(limitIn)) {
    showValidation("Please enter valid numerical values for temperature, humidity and cooling limit.");
    return;
  }

  if (limitIn <= tempIn) {
    showValidation(`Friendly hint: The cooling limit (${limitIn}°C) must be set higher than the starting temperature (${tempIn}°C).`);
    return;
  }

  if (!nameIn) {
    showValidation("Please enter the owner's name for personalized alert messages.");
    return;
  }

  validationBanner.classList.add("hidden");

  // Save Config
  STATE.config.startingTemp = tempIn;
  STATE.config.startingHumidity = humIn;
  STATE.config.coolingLimit = limitIn;
  STATE.config.ownerName = nameIn;
  STATE.config.ownerPhone = phoneIn;

  // Initialize runtime state
  STATE.currentTemp = tempIn;
  STATE.currentHumidity = humIn;
  STATE.outsideHeatDelta = 0;
  STATE.coolingActive = false;
  STATE.coolingSecondsActive = 0;
  STATE.alertsSent.coolingOn = false;
  STATE.alertsSent.coolingOff = false;
  STATE.alertsSent.spoiledCartons.clear();
  STATE.alertsSent.spillOccurred = false;

  // Reset chart histories
  STATE.tempHistory = Array(CONFIG.CHART_HISTORY_MAX).fill(tempIn);
  STATE.humidityHistory = Array(CONFIG.CHART_HISTORY_MAX).fill(humIn);

  // Switch Screens
  document.getElementById("setup-screen").classList.remove("active");
  document.getElementById("sim-screen").classList.add("active");
  STATE.currentScreen = "sim";

  // Build warehouse items & start simulation engine
  initWarehouseSimulation();
}

function showValidation(msg) {
  const banner = document.getElementById("setup-validation-msg");
  banner.textContent = msg;
  banner.classList.remove("hidden");
}

/**
 * Switches between Floor Simulation and Operations Dashboard in-memory
 */
function switchView(viewName) {
  const simPane = document.getElementById("view-sim-container");
  const dashPane = document.getElementById("view-dash-container");
  const simBtn = document.getElementById("tab-btn-sim");
  const dashBtn = document.getElementById("tab-btn-dash");

  if (viewName === "dash") {
    if (simPane) { simPane.classList.remove("active"); simPane.classList.add("hidden"); }
    if (dashPane) { dashPane.classList.remove("hidden"); dashPane.classList.add("active"); }
    if (simBtn) { simBtn.classList.remove("active"); simBtn.setAttribute("aria-selected", "false"); }
    if (dashBtn) { dashBtn.classList.add("active"); dashBtn.setAttribute("aria-selected", "true"); }
    
    // Ensure dashboard is freshly rendered
    renderOperationsDashboardView();
  } else {
    if (dashPane) { dashPane.classList.remove("active"); dashPane.classList.add("hidden"); }
    if (simPane) { simPane.classList.remove("hidden"); simPane.classList.add("active"); }
    if (dashBtn) { dashBtn.classList.remove("active"); dashBtn.setAttribute("aria-selected", "false"); }
    if (simBtn) { simBtn.classList.add("active"); simBtn.setAttribute("aria-selected", "true"); }
  }
}

/**
 * Handles "Go to Dashboard" directly from setup screen
 */
function handleStartAndGoDashboard(event) {
  if (event) event.preventDefault();
  handleStartWarehouse(event);
  switchView('dash');
}

/* ============================================================================
   WAREHOUSE & SVG BUILDER
   ============================================================================ */
function initWarehouseSimulation() {
  // Update header and displays
  document.getElementById("cooling-limit-display").textContent = `${STATE.config.coolingLimit.toFixed(1)}°C`;
  document.getElementById("temp-sub-note").textContent = `Cooling triggers at ${STATE.config.coolingLimit.toFixed(1)}°C`;
  document.getElementById("cooling-hysteresis-note").textContent = `Turns off at ${(STATE.config.coolingLimit - CONFIG.COOLING_HYSTERESIS_DELTA).toFixed(1)}°C (limit −2°C)`;
  document.getElementById("heat-slider").value = "0";
  handleHeatSlider(0);

  // Generate the 24 cartons
  generateCartons();

  // Attach floor SVG click listener for manual spill targeting
  const floorSvg = document.getElementById("warehouse-svg");
  floorSvg.addEventListener("click", handleFloorSvgClick);

  // Log initial system start event
  logEvent("info", "System initialized. Live monitoring started for fresh produce.", null, true);

  // Initialize Operations Dashboard in-memory view
  initOperationsDashboardView();

  // Start real-time simulation tick and simulated clock
  startSimulationLoop();
  startClockTicker();

  // Initial dashboard metrics render
  renderDashboard();
  renderSparklines();
}

/**
 * Creates 24 cartons across Racks A, B, C, D (6 cartons per rack: 2 rows of 3)
 */
function generateCartons() {
  STATE.cartons = {};
  const racks = ["A", "B", "C", "D"];

  racks.forEach((rackId) => {
    const rackEl = document.getElementById(`rack-${rackId}-cartons`);
    rackEl.innerHTML = ""; // Clear existing

    const rackMeta = CONFIG.RACKS.find(r => r.id === rackId);
    let vegIndex = 0;

    // 2 rows, 3 columns inside rack
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const cartonNum = row * 3 + col + 1;
        const cartonId = `${rackId}-0${cartonNum}`;
        const veg = CONFIG.VEGETABLES[vegIndex % CONFIG.VEGETABLES.length];
        vegIndex++;

        // Layout carton within rack box
        // Rack inner area: width 310, height 150. Header uses 26px.
        const width = 84;
        const height = 48;
        const x = rackMeta.x + 16 + col * 94;
        const y = rackMeta.y + 36 + row * 54;

        STATE.cartons[cartonId] = {
          id: cartonId,
          rack: rackId,
          vegetable: veg.name,
          icon: veg.icon,
          state: "fresh", // "fresh" | "spoiled"
          x: x,
          y: y,
          width: width,
          height: height
        };

        // Render carton SVG group
        renderCartonSvg(rackEl, STATE.cartons[cartonId]);
      }
    }
  });

  updateCartonCountCards();
}

/**
 * Renders an individual carton SVG element
 */
function renderCartonSvg(parentEl, c) {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("id", `carton-g-${c.id}`);
  g.setAttribute("class", "carton-svg-group");
  g.style.cursor = "pointer";

  // Box base
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("id", `carton-rect-${c.id}`);
  rect.setAttribute("class", `carton-rect ${c.state === "spoiled" ? "carton-spoiled-tint" : ""}`);
  rect.setAttribute("x", c.x);
  rect.setAttribute("y", c.y);
  rect.setAttribute("width", c.width);
  rect.setAttribute("height", c.height);
  rect.setAttribute("rx", "5");
  rect.setAttribute("fill", c.state === "spoiled" ? "#FEF2F2" : "#FFFFFF");
  rect.setAttribute("stroke", c.state === "spoiled" ? "#EF4444" : "#CBD5E1");
  rect.setAttribute("stroke-width", "1.4");

  // Center packing tape line
  const tape = document.createElementNS("http://www.w3.org/2000/svg", "line");
  tape.setAttribute("x1", c.x + c.width / 2);
  tape.setAttribute("y1", c.y + 2);
  tape.setAttribute("x2", c.x + c.width / 2);
  tape.setAttribute("y2", c.y + c.height - 2);
  tape.setAttribute("stroke", c.state === "spoiled" ? "#FEE2E2" : "#F1F5F9");
  tape.setAttribute("stroke-width", "1.5");

  // Mini barcode / RFID glyph (top right)
  const barcode = document.createElementNS("http://www.w3.org/2000/svg", "path");
  barcode.setAttribute("d", `M ${c.x + c.width - 26} ${c.y + 8} v 6 M ${c.x + c.width - 23} ${c.y + 8} v 6 M ${c.x + c.width - 21} ${c.y + 8} v 6 M ${c.x + c.width - 18} ${c.y + 8} v 6`);
  barcode.setAttribute("stroke", "#CBD5E1");
  barcode.setAttribute("stroke-width", "1");

  // Carton ID label
  const textId = document.createElementNS("http://www.w3.org/2000/svg", "text");
  textId.setAttribute("x", c.x + 9);
  textId.setAttribute("y", c.y + 18);
  textId.setAttribute("font-size", "10");
  textId.setAttribute("font-weight", "700");
  textId.setAttribute("fill", "#0F172A");
  textId.textContent = c.id;

  // Vegetable label
  const textVeg = document.createElementNS("http://www.w3.org/2000/svg", "text");
  textVeg.setAttribute("x", c.x + 9);
  textVeg.setAttribute("y", c.y + 35);
  textVeg.setAttribute("font-size", "9.5");
  textVeg.setAttribute("font-weight", "500");
  textVeg.setAttribute("fill", "#475569");
  textVeg.textContent = c.vegetable;

  // Gas Sensor Outer Halo (Breathing indicator)
  const sensorHalo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  sensorHalo.setAttribute("id", `carton-halo-${c.id}`);
  sensorHalo.setAttribute("cx", c.x + c.width - 12);
  sensorHalo.setAttribute("cy", c.y + 34);
  sensorHalo.setAttribute("r", "7");
  sensorHalo.setAttribute("fill", c.state === "spoiled" ? "rgba(220, 38, 38, 0.15)" : "rgba(21, 128, 61, 0.12)");

  // Sensor Dot (Green for fresh, Red for spoiled)
  const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  dot.setAttribute("id", `carton-dot-${c.id}`);
  dot.setAttribute("class", "sensor-dot");
  dot.setAttribute("cx", c.x + c.width - 12);
  dot.setAttribute("cy", c.y + 34);
  dot.setAttribute("r", "4");
  dot.setAttribute("fill", c.state === "spoiled" ? "#DC2626" : "#15803D");

  // Ripple smell waves container for spoiled cartons
  const smellG = document.createElementNS("http://www.w3.org/2000/svg", "g");
  smellG.setAttribute("id", `smell-g-${c.id}`);
  smellG.setAttribute("class", `smell-waves-group ${c.state === "spoiled" ? "" : "hidden"}`);
  smellG.setAttribute("transform", `translate(${c.x + c.width / 2}, ${c.y + 6})`);

  // 3 subtle wavy lines
  for (let i = 0; i < 3; i++) {
    const wave = document.createElementNS("http://www.w3.org/2000/svg", "path");
    wave.setAttribute("class", "smell-wave");
    wave.setAttribute("d", `M ${-10 + i * 10} 0 Q ${-5 + i * 10} -6, ${-10 + i * 10} -14 T ${-10 + i * 10} -26`);
    wave.style.animationDelay = `${i * 0.4}s`;
    smellG.appendChild(wave);
  }

  g.appendChild(rect);
  g.appendChild(tape);
  g.appendChild(barcode);
  g.appendChild(textId);
  g.appendChild(textVeg);
  g.appendChild(sensorHalo);
  g.appendChild(dot);
  g.appendChild(smellG);

  // Mouse interactions
  g.addEventListener("mouseenter", (e) => showCartonTooltip(e, c.id));
  g.addEventListener("mouseleave", hideCartonTooltip);
  g.addEventListener("mousemove", (e) => moveCartonTooltip(e));
  g.addEventListener("click", (e) => handleCartonClick(e, c.id));

  parentEl.appendChild(g);
}

/* ============================================================================
   TOOLTIP & CARTON ACTION POPOVER
   ============================================================================ */
function showCartonTooltip(e, cartonId) {
  if (STATE.interactiveMode === "pick-carton") return; // Keep tooltip off during picking mode
  const c = STATE.cartons[cartonId];
  if (!c) return;

  const tooltip = document.getElementById("carton-tooltip");
  document.getElementById("tt-id").textContent = c.id;
  document.getElementById("tt-veg").textContent = c.vegetable;

  const badge = document.getElementById("tt-badge");
  badge.textContent = c.state === "spoiled" ? "Spoiled" : "Fresh";
  badge.className = `tt-status-badge ${c.state}`;

  tooltip.classList.remove("hidden");
  positionTooltip(e);
}

function moveCartonTooltip(e) {
  const tooltip = document.getElementById("carton-tooltip");
  if (!tooltip.classList.contains("hidden")) {
    positionTooltip(e);
  }
}

function positionTooltip(e) {
  const tooltip = document.getElementById("carton-tooltip");
  const container = document.getElementById("floor-svg-container").getBoundingClientRect();
  const x = e.clientX - container.left;
  const y = e.clientY - container.top;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function hideCartonTooltip() {
  document.getElementById("carton-tooltip").classList.add("hidden");
}

/**
 * Handle clicking on a carton:
 * - If in "pick-carton" mode -> instantly spoil and exit pick mode.
 * - Otherwise -> open popover with appropriate action button.
 */
function handleCartonClick(e, cartonId) {
  e.stopPropagation();
  hideCartonTooltip();

  const c = STATE.cartons[cartonId];
  if (!c) return;

  // If in pick-carton mode, execute spoil directly
  if (STATE.interactiveMode === "pick-carton") {
    spoilCarton(cartonId);
    cancelInteractiveMode();
    return;
  }

  // Open Popover
  const popover = document.getElementById("carton-popover");
  document.getElementById("pop-title").textContent = `Carton ${c.id}`;
  document.getElementById("pop-veg").textContent = c.vegetable;

  const popDot = document.getElementById("pop-dot");
  const popStatus = document.getElementById("pop-status-text");
  const popActionBtn = document.getElementById("pop-action-btn");

  if (c.state === "fresh") {
    popDot.className = "status-dot-sm green";
    popStatus.textContent = "Status: Fresh";
    popActionBtn.textContent = "Spoil this vegetable";
    popActionBtn.className = "btn-popover spoil";
    popActionBtn.onclick = () => {
      spoilCarton(cartonId);
      closeCartonPopover();
    };
  } else {
    popDot.className = "status-dot-sm red";
    popStatus.textContent = "Status: Spoiled";
    popActionBtn.textContent = "Replace with fresh stock";
    popActionBtn.className = "btn-popover replace";
    popActionBtn.onclick = () => {
      replaceCartonFresh(cartonId);
      closeCartonPopover();
    };
  }

  // Position popover relative to floor container
  const container = document.getElementById("floor-svg-container").getBoundingClientRect();
  const x = e.clientX - container.left;
  const y = e.clientY - container.top;
  popover.style.left = `${x}px`;
  popover.style.top = `${y}px`;
  popover.classList.remove("hidden");
}

function closeCartonPopover() {
  document.getElementById("carton-popover").classList.add("hidden");
}

// Global click dismisses carton popover if clicked outside
document.addEventListener("click", (e) => {
  const popover = document.getElementById("carton-popover");
  if (!popover.classList.contains("hidden") && !popover.contains(e.target)) {
    closeCartonPopover();
  }
});

/* ============================================================================
   MANUAL CARTON STATE ACTIONS (PER USER SPEC)
   ============================================================================ */

/**
 * Spoils a vegetable carton:
 * - Updates visual state (red tint, red dot, smell ripple)
 * - Sends WhatsApp alert once
 * - Logs to dashboard event log
 * - If Guided Demo is waiting at spoilage step, resumes demo
 */
function spoilCarton(cartonId) {
  const c = STATE.cartons[cartonId];
  if (!c || c.state === "spoiled") return;

  c.state = "spoiled";

  // Update SVG DOM
  const rect = document.getElementById(`carton-rect-${c.id}`);
  const dot = document.getElementById(`carton-dot-${c.id}`);
  const smellG = document.getElementById(`smell-g-${c.id}`);

  if (rect) {
    rect.setAttribute("fill", "#FEE2E2");
    rect.setAttribute("stroke", "#EF4444");
    rect.classList.add("carton-spoiled-tint");
  }
  if (dot) {
    dot.setAttribute("fill", CONFIG.COLORS.red);
  }
  if (smellG) {
    smellG.classList.remove("hidden");
  }

  updateCartonCountCards();

  // Send alert message exactly once
  const alertMsg = `Carton ${c.id} (${c.vegetable}) is spoiling. Please inspect and remove it to protect nearby stock.`;
  
  sendWhatsAppAlert(
    "spoiled",
    `Spoilage Alert: ${c.id}`,
    alertMsg,
    null
  );

  logEvent("spoil", alertMsg, null, false);
  broadcastSimulationState();

  // Resume Guided demo if waiting on spoilage step
  if (STATE.demo.isRunning && STATE.demo.currentStep === 5) {
    clearTimeout(STATE.demo.stepTimer);
    setTimeout(() => {
      runGuidedDemoStep(6);
    }, 1500);
  }
}

/**
 * Replaces a spoiled carton with fresh stock
 */
function replaceCartonFresh(cartonId) {
  const c = STATE.cartons[cartonId];
  if (!c || c.state === "fresh") return;

  c.state = "fresh";

  // Update SVG DOM
  const rect = document.getElementById(`carton-rect-${c.id}`);
  const dot = document.getElementById(`carton-dot-${c.id}`);
  const smellG = document.getElementById(`smell-g-${c.id}`);

  if (rect) {
    rect.setAttribute("fill", "#FFFFFF");
    rect.setAttribute("stroke", "#CBD5E1");
    rect.classList.remove("carton-spoiled-tint");
  }
  if (dot) {
    dot.setAttribute("fill", CONFIG.COLORS.green);
  }
  if (smellG) {
    smellG.classList.add("hidden");
  }

  updateCartonCountCards();

  // Log in dashboard (per spec: "logs 'Carton B-04 replaced with fresh stock', no phone alert")
  logEvent("info", `Carton ${c.id} (${c.vegetable}) replaced with fresh stock.`, null, false);
  broadcastSimulationState();
}

function updateCartonCountCards() {
  let freshCount = 0;
  let spoiledCount = 0;

  Object.values(STATE.cartons).forEach(c => {
    if (c.state === "fresh") freshCount++;
    else spoiledCount++;
  });

  const freshEl = document.getElementById("count-fresh");
  const spoiledEl = document.getElementById("count-spoiled");

  if (freshEl) freshEl.textContent = freshCount;
  if (spoiledEl) spoiledEl.textContent = spoiledCount;
}

/* ============================================================================
   INTERACTIVE MODES: PICK CARTON & SPILL SPOT
   ============================================================================ */
function togglePickCartonMode() {
  if (STATE.interactiveMode === "pick-carton") {
    cancelInteractiveMode();
  } else {
    enterPickCartonMode();
  }
}

function enterPickCartonMode() {
  cancelInteractiveMode();
  STATE.interactiveMode = "pick-carton";

  const banner = document.getElementById("floor-mode-banner");
  document.getElementById("floor-mode-text").textContent = "Click any carton to spoil that vegetable";
  banner.classList.remove("hidden");

  document.getElementById("spoil-veg-tool-btn").classList.add("active");
  document.getElementById("floor-svg-container").classList.add("pick-carton-mode");

  // Highlight all cartons with dashed orange outline
  document.querySelectorAll(".carton-rect").forEach(el => {
    el.classList.add("carton-highlight-pick");
  });
}

function startSpillMode() {
  if (STATE.activeSpill) {
    // If spill already active, prompt cleanup first or reposition
    showNotificationBanner("A liquid spill is already active on the floor. Clean it up first.");
    return;
  }

  cancelInteractiveMode();
  STATE.interactiveMode = "spill-spot";

  const banner = document.getElementById("floor-mode-banner");
  document.getElementById("floor-mode-text").textContent = "Click anywhere on the floor to spill liquid";
  banner.classList.remove("hidden");

  document.getElementById("spill-liquid-btn").classList.add("active");
  document.getElementById("floor-svg-container").classList.add("spill-mode");
}

function cancelInteractiveMode() {
  STATE.interactiveMode = null;
  document.getElementById("floor-mode-banner").classList.add("hidden");
  document.getElementById("spoil-veg-tool-btn").classList.remove("active");
  document.getElementById("spill-liquid-btn").classList.remove("active");
  document.getElementById("floor-svg-container").classList.remove("pick-carton-mode");
  document.getElementById("floor-svg-container").classList.remove("spill-mode");

  document.querySelectorAll(".carton-rect").forEach(el => {
    el.classList.remove("carton-highlight-pick");
  });
}

function initEscKeyListener() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      cancelInteractiveMode();
      closeCartonPopover();
      closeHowItWorksModal();
      closeImageModal();
    }
  });
}

/* ============================================================================
   MANUAL LIQUID SPILL TRIGGER & VISION SNAPSHOT
   ============================================================================ */

/**
 * Handles clicking anywhere on the warehouse floor
 */
function handleFloorSvgClick(event) {
  if (STATE.interactiveMode !== "spill-spot") return;

  const svg = document.getElementById("warehouse-svg");
  const pt = svg.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());

  // Determine floor coordinates
  let spillX = svgP.x;
  let spillY = svgP.y;

  // Snap to nearest empty floor corridor if clicked inside a rack
  CONFIG.RACKS.forEach(r => {
    if (spillX >= r.x && spillX <= r.x + r.width && spillY >= r.y && spillY <= r.y + r.height) {
      // Offset slightly outside into aisle
      if (spillY < 260) {
        spillY = r.y + r.height + 25; // down into central aisle
      } else {
        spillY = r.y - 25;            // up into central aisle
      }
    }
  });

  // Keep within warehouse boundary
  spillX = Math.max(50, Math.min(940, spillX));
  spillY = Math.max(50, Math.min(470, spillY));

  cancelInteractiveMode();
  executeSpillAt(spillX, spillY);
}

/**
 * Creates puddle, triggers camera flash, captures canvas snapshot, and dispatches alert
 */
function executeSpillAt(x, y) {
  if (STATE.activeSpill) return;

  // Determine nearest camera
  let nearestCam = CONFIG.CAMERAS[0];
  let minDistance = Infinity;

  CONFIG.CAMERAS.forEach(cam => {
    const dist = Math.hypot(cam.x - x, cam.y - y);
    if (dist < minDistance) {
      minDistance = dist;
      nearestCam = cam;
    }
  });

  // Determine nearest rack for descriptive alert
  let nearestRack = CONFIG.RACKS[0];
  let minRackDist = Infinity;
  CONFIG.RACKS.forEach(r => {
    const rx = r.x + r.width / 2;
    const ry = r.y + r.height / 2;
    const dist = Math.hypot(rx - x, ry - y);
    if (dist < minRackDist) {
      minRackDist = dist;
      nearestRack = r;
    }
  });

  const timestampStr = getCurrentTimeString();
  const spillId = `SPILL-${Date.now().toString().slice(-4)}`;

  // Render SVG puddle
  renderSpillSvg(x, y, spillId);

  // Trigger camera capture animation & flash
  triggerCameraCapture(nearestCam.id);

  // Generate CCTV snapshot via Canvas
  const snapshotDataUrl = generateCameraSnapshot(x, y, nearestCam.id, nearestRack.id, timestampStr);

  STATE.activeSpill = {
    id: spillId,
    x: x,
    y: y,
    nearestCam: nearestCam.id,
    nearestRack: nearestRack.id,
    timestamp: timestampStr,
    snapshotUrl: snapshotDataUrl
  };

  // Show "Clean up spill" button
  document.getElementById("cleanup-spill-btn").classList.remove("hidden");

  // Per user requirement: Do NOT open any modal/popup window on spill detection - only dispatch notification
  closeImageModal();
  const photoModal = document.getElementById("photo-modal");
  if (photoModal) photoModal.classList.add("hidden");

  // Send WhatsApp Alert with image bubble
  const alertCaption = `Liquid spill detected near Rack ${nearestRack.id} by ${nearestCam.id} at ${timestampStr}. Please send someone to clean it.`;
  
  sendWhatsAppAlert(
    "spill",
    `Liquid Spill Detected`,
    alertCaption,
    snapshotDataUrl
  );

  logEvent("spill", alertCaption, snapshotDataUrl, false);
  broadcastSimulationState();

  // Resume Guided demo if waiting on spill step
  if (STATE.demo.isRunning && STATE.demo.currentStep === 6) {
    clearTimeout(STATE.demo.stepTimer);
    setTimeout(() => {
      runGuidedDemoStep(7);
    }, 1500);
  }
}

/**
 * Draws the liquid spill SVG puddle with ripples
 */
function renderSpillSvg(x, y, id) {
  const container = document.getElementById("spills-layer");

  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("id", `spill-svg-${id}`);
  g.setAttribute("transform", `translate(${x}, ${y})`);

  // Ripple 1
  const ripple = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
  ripple.setAttribute("cx", "0");
  ripple.setAttribute("cy", "0");
  ripple.setAttribute("rx", "36");
  ripple.setAttribute("ry", "22");
  ripple.setAttribute("class", "spill-ripple");

  // Organic puddle shape path
  const puddle = document.createElementNS("http://www.w3.org/2000/svg", "path");
  puddle.setAttribute("class", "spill-puddle");
  puddle.setAttribute("d", "M -35 0 C -38 -15, -15 -22, 10 -20 C 32 -18, 38 -4, 34 10 C 30 22, 4 25, -18 20 C -30 18, -35 10, -35 0 Z");

  // Droplet icon marker
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "path");
  icon.setAttribute("d", "M 0 -8 C 3 -3, 6 2, 6 6 A 6 6 0 1 1 -6 6 C -6 2, -3 -3, 0 -8 Z");
  icon.setAttribute("fill", "#0284C7");
  icon.setAttribute("opacity", "0.9");

  g.appendChild(ripple);
  g.appendChild(puddle);
  g.appendChild(icon);

  container.appendChild(g);
}

/**
 * Triggers camera cone flash, floor white blink, and "📸 Captured" badge
 */
function triggerCameraCapture(camId) {
  const num = camId.split("-")[1];
  const camGroup = document.getElementById(`cam-${num}-group`);
  const snapBadge = document.getElementById(`cam-${num}-snap-badge`);
  const flashOverlay = document.getElementById("camera-flash-overlay");

  if (camGroup) camGroup.classList.add("cam-snap-active");
  if (snapBadge) snapBadge.classList.remove("hidden");

  // Floor flash animation
  flashOverlay.style.transition = "opacity 0.08s ease-out";
  flashOverlay.style.opacity = "0.75";

  setTimeout(() => {
    flashOverlay.style.transition = "opacity 0.4s ease-in";
    flashOverlay.style.opacity = "0";
  }, 100);

  // Hide badge and reset after 3 seconds
  setTimeout(() => {
    if (camGroup) camGroup.classList.remove("cam-snap-active");
    if (snapBadge) snapBadge.classList.add("hidden");
  }, 3200);
}

/**
 * Generates photorealistic CCTV snapshot using HTML5 canvas
 * Draws realistic warehouse concrete, OSHA safety lines, stacked cartons,
 * fluid spill puddle with specular reflections, lens vignette, and security HUD overlay
 */
function generateCameraSnapshot(spillX, spillY, camId, rackId, timeStr) {
  const canvas = document.getElementById("snapshot-canvas");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  // 1. Concrete Floor Base
  ctx.fillStyle = "#CBD5E1";
  ctx.fillRect(0, 0, w, h);

  // Micro-texture aggregate speckles
  const seed = (Math.round(spillX * 13) ^ Math.round(spillY * 17)) || 12345;
  for (let i = 0; i < 400; i++) {
    const px = Math.abs(Math.sin(seed + i * 1.3)) * w;
    const py = Math.abs(Math.cos(seed + i * 2.1)) * h;
    const alpha = (i % 3 === 0) ? 0.08 : 0.04;
    ctx.fillStyle = (i % 2 === 0) ? `rgba(15, 23, 42, ${alpha})` : `rgba(255, 255, 255, ${alpha * 1.5})`;
    ctx.fillRect(px, py, (i % 3) + 1, (i % 2) + 1);
  }

  // Expansion Joint Seams
  ctx.strokeStyle = "#94A3B8";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.42);
  ctx.lineTo(w, h * 0.42);
  ctx.moveTo(w * 0.58, 0);
  ctx.lineTo(w * 0.58, h);
  ctx.stroke();

  // 2. OSHA Safety Warning Hazard Stripes (Walkway boundary)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, h - 36, w, 22);
  ctx.clip();
  ctx.fillStyle = "#E2E8F0";
  ctx.fillRect(0, h - 36, w, 22);
  for (let sx = -40; sx < w + 40; sx += 20) {
    ctx.fillStyle = "#F59E0B";
    ctx.beginPath();
    ctx.moveTo(sx, h - 14);
    ctx.lineTo(sx + 10, h - 14);
    ctx.lineTo(sx + 20, h - 36);
    ctx.lineTo(sx + 10, h - 36);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#0F172A";
    ctx.beginPath();
    ctx.moveTo(sx + 10, h - 14);
    ctx.lineTo(sx + 20, h - 14);
    ctx.lineTo(sx + 30, h - 36);
    ctx.lineTo(sx + 20, h - 36);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 3. Industrial Pallet Racking in Background
  ctx.fillStyle = "#475569";
  ctx.fillRect(16, 36, 12, h - 80);
  ctx.fillRect(180, 36, 12, h - 80);
  ctx.fillStyle = "#EA580C";
  ctx.fillRect(16, 70, 176, 10);
  ctx.fillRect(16, 140, 176, 10);

  // Corrugated Cartons on shelf
  ctx.fillStyle = "#D97706";
  ctx.fillRect(36, 42, 60, 28);
  ctx.fillStyle = "#B45309";
  ctx.fillRect(104, 42, 62, 28);
  // Barcode stickers on boxes
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(44, 48, 16, 10);
  ctx.fillRect(112, 48, 16, 10);
  ctx.fillStyle = "#0F172A";
  ctx.fillRect(46, 50, 12, 2);
  ctx.fillRect(46, 53, 8, 2);
  ctx.fillRect(114, 50, 12, 2);

  // Shelf identification text
  ctx.fillStyle = "#E2E8F0";
  ctx.font = "bold 9px monospace";
  ctx.fillText(`RACK ${rackId} &bull; BAY 01`, 38, 78);

  // 4. Realistic Fluid Spill Puddle
  const centerX = w * 0.55;
  const centerY = h * 0.58;
  const radX = 85;
  const radY = 48;

  // Outer fluid wet ring
  const fluidGrad = ctx.createRadialGradient(centerX - 10, centerY - 6, 8, centerX, centerY, radX);
  fluidGrad.addColorStop(0, "rgba(56, 189, 248, 0.85)");
  fluidGrad.addColorStop(0.5, "rgba(2, 132, 199, 0.70)");
  fluidGrad.addColorStop(0.85, "rgba(14, 116, 144, 0.45)");
  fluidGrad.addColorStop(1, "rgba(15, 23, 42, 0.15)");

  ctx.save();
  ctx.fillStyle = fluidGrad;
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, radX, radY, -0.06, 0, Math.PI * 2);
  ctx.fill();

  // Secondary droplet satellite puddle
  ctx.beginPath();
  ctx.ellipse(centerX + radX * 0.75, centerY - radY * 0.4, 18, 11, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Crisp fluid boundary stroke
  ctx.strokeStyle = "rgba(2, 132, 199, 0.75)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Specular Water Highlight (Reflected overhead warehouse lamp)
  const highlightGrad = ctx.createLinearGradient(centerX - 40, centerY - 25, centerX + 10, centerY - 5);
  highlightGrad.addColorStop(0, "rgba(255, 255, 255, 0.75)");
  highlightGrad.addColorStop(0.4, "rgba(255, 255, 255, 0.35)");
  highlightGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.fillStyle = highlightGrad;
  ctx.beginPath();
  ctx.ellipse(centerX - 15, centerY - 12, 38, 14, -0.15, 0, Math.PI * 2);
  ctx.fill();

  // 5. AI Detection Bounding Box
  const boxX = centerX - radX - 12;
  const boxY = centerY - radY - 14;
  const boxW = radX * 2 + 38;
  const boxH = radY * 2 + 28;

  ctx.strokeStyle = "#EF4444";
  ctx.lineWidth = 1.8;
  ctx.setLineDash([6, 3]);
  ctx.strokeRect(boxX, boxY, boxW, boxH);
  ctx.setLineDash([]);

  // Tag Banner
  ctx.fillStyle = "rgba(239, 68, 68, 0.94)";
  ctx.fillRect(boxX, boxY - 18, 144, 18);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 9px monospace";
  ctx.fillText("AI DETECT: LIQUID 98.4%", boxX + 6, boxY - 5);
  ctx.restore();

  // 6. Security Camera Vignette (darkened lens corners)
  const vignette = ctx.createRadialGradient(w / 2, h / 2, w * 0.32, w / 2, h / 2, w * 0.65);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(15, 23, 42, 0.45)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  // 7. Security HUD Header Banner
  ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
  ctx.fillRect(0, 0, w, 26);

  // Red REC dot
  ctx.fillStyle = "#EF4444";
  ctx.beginPath();
  ctx.arc(14, 13, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 10px monospace";
  ctx.fillText(`REC ${camId} HD`, 24, 16);

  ctx.fillStyle = "#94A3B8";
  ctx.font = "bold 9.5px monospace";
  ctx.fillText(`${timeStr}  •  SECTOR 01 COLD STORAGE`, w - 260, 16);

  // Subtle Scanlines
  ctx.fillStyle = "rgba(0, 0, 0, 0.03)";
  for (let y = 0; y < h; y += 3) {
    ctx.fillRect(0, y, w, 1);
  }

  return canvas.toDataURL("image/jpeg", 0.90);
}

/**
 * Generates photorealistic clean CCTV snapshot when no spill is present
 * Shows dry concrete warehouse floor, safety walkways, industrial racking,
 * optical AI Sentinel reticule overlay and status HUD
 */
function generateCleanCameraSnapshot(camId, rackId, timeStr) {
  const canvas = document.getElementById("snapshot-canvas");
  if (!canvas) return "";
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  // 1. Concrete Floor Base
  ctx.fillStyle = "#CBD5E1";
  ctx.fillRect(0, 0, w, h);

  // Micro-texture aggregate speckles
  const camNum = parseInt(camId.replace("CAM-", "")) || 1;
  const seed = camNum * 9973;
  for (let i = 0; i < 420; i++) {
    const px = Math.abs(Math.sin(seed + i * 1.3)) * w;
    const py = Math.abs(Math.cos(seed + i * 2.1)) * h;
    const alpha = (i % 3 === 0) ? 0.08 : 0.04;
    ctx.fillStyle = (i % 2 === 0) ? `rgba(15, 23, 42, ${alpha})` : `rgba(255, 255, 255, ${alpha * 1.5})`;
    ctx.fillRect(px, py, (i % 3) + 1, (i % 2) + 1);
  }

  // Expansion Joint Seams
  ctx.strokeStyle = "#94A3B8";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.42);
  ctx.lineTo(w, h * 0.42);
  ctx.moveTo(w * 0.58, 0);
  ctx.lineTo(w * 0.58, h);
  ctx.stroke();

  // 2. OSHA Safety Warning Hazard Stripes (Walkway boundary)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, h - 36, w, 22);
  ctx.clip();
  ctx.fillStyle = "#E2E8F0";
  ctx.fillRect(0, h - 36, w, 22);
  for (let sx = -40; sx < w + 40; sx += 20) {
    ctx.fillStyle = "#F59E0B";
    ctx.beginPath();
    ctx.moveTo(sx, h - 14);
    ctx.lineTo(sx + 10, h - 14);
    ctx.lineTo(sx + 20, h - 36);
    ctx.lineTo(sx + 10, h - 36);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#0F172A";
    ctx.beginPath();
    ctx.moveTo(sx + 10, h - 14);
    ctx.lineTo(sx + 20, h - 14);
    ctx.lineTo(sx + 30, h - 36);
    ctx.lineTo(sx + 20, h - 36);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 3. Industrial Pallet Racking in Background
  ctx.fillStyle = "#475569";
  ctx.fillRect(16, 36, 12, h - 80);
  ctx.fillRect(180, 36, 12, h - 80);
  ctx.fillStyle = "#EA580C";
  ctx.fillRect(16, 70, 176, 10);
  ctx.fillRect(16, 140, 176, 10);

  // Corrugated Cartons on shelf
  ctx.fillStyle = "#D97706";
  ctx.fillRect(36, 42, 60, 28);
  ctx.fillStyle = "#B45309";
  ctx.fillRect(104, 42, 62, 28);
  // Barcode stickers on boxes
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(44, 48, 16, 10);
  ctx.fillRect(112, 48, 16, 10);
  ctx.fillStyle = "#0F172A";
  ctx.fillRect(46, 50, 12, 2);
  ctx.fillRect(46, 53, 8, 2);
  ctx.fillRect(114, 50, 12, 2);

  // Shelf identification text
  ctx.fillStyle = "#E2E8F0";
  ctx.font = "bold 9px monospace";
  ctx.fillText(`RACK ${rackId || "A"} • ZONE MONITOR`, 38, 78);

  // 4. Optical AI Sentinel Scan Reticule (Floor Center)
  const cx = w * 0.52;
  const cy = h * 0.54;
  const boxW = 190;
  const boxH = 90;

  ctx.save();
  ctx.strokeStyle = "#10B981";
  ctx.lineWidth = 1.4;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);
  ctx.setLineDash([]);

  // Reticule Crosshairs
  ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy);
  ctx.lineTo(cx + 20, cy);
  ctx.moveTo(cx, cy - 20);
  ctx.lineTo(cx, cy + 20);
  ctx.stroke();

  // Green AI Sentinel Banner
  ctx.fillStyle = "rgba(16, 185, 129, 0.92)";
  ctx.fillRect(cx - boxW / 2, cy - boxH / 2 - 18, boxW, 18);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 9px monospace";
  ctx.fillText("AI SENTINEL: ALL CLEAR • ZERO HAZARDS", cx - boxW / 2 + 6, cy - boxH / 2 - 5);
  ctx.restore();

  // 5. Security Camera Vignette
  const vignette = ctx.createRadialGradient(w / 2, h / 2, w * 0.32, w / 2, h / 2, w * 0.65);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(15, 23, 42, 0.45)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  // 6. Security HUD Header Banner
  ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
  ctx.fillRect(0, 0, w, 26);

  // Red REC dot
  ctx.fillStyle = "#EF4444";
  ctx.beginPath();
  ctx.arc(14, 13, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 10px monospace";
  ctx.fillText(`REC ${camId} HD`, 24, 16);

  ctx.fillStyle = "#94A3B8";
  ctx.font = "bold 9.5px monospace";
  ctx.fillText(`${timeStr}  •  SECTOR 01 OPTICAL SURVEILLANCE`, w - 280, 16);

  // Subtle Scanlines
  ctx.fillStyle = "rgba(0, 0, 0, 0.03)";
  for (let y = 0; y < h; y += 3) {
    ctx.fillRect(0, y, w, 1);
  }

  return canvas.toDataURL("image/jpeg", 0.90);
}

/**
 * Shutter click sound effect
 */
function playCameraShutterSound() {
  if (STATE.isMuted) return;
  try {
    if (!STATE.audioCtx) initAudio();
    if (STATE.audioCtx && STATE.audioCtx.state === "suspended") STATE.audioCtx.resume();
    if (!STATE.audioCtx) return;
    const ctx = STATE.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.07);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.07);
  } catch (e) {}
}

/**
 * Live CCTV Inspection Function for all 6 cameras
 */
function inspectCameraFeed(camId) {
  // Never open camera feed modal during spill interactive mode
  if (STATE.interactiveMode === "spill-spot") return;

  const cam = CONFIG.CAMERAS.find(c => c.id === camId) || CONFIG.CAMERAS[0];
  const timeStr = getCurrentTimeString();

  // Highlight active buttons in quick selector and modal switcher
  document.querySelectorAll(".cam-sel-btn").forEach(btn => {
    btn.classList.toggle("active", btn.textContent.trim() === cam.id);
  });

  // Flash camera badge on warehouse SVG floor
  triggerCameraCapture(cam.id);
  playCameraShutterSound();

  let snapshotUrl;
  let statusBadgeText = "🔴 LIVE CCTV STREAM";
  let footerText = `Optical surveillance active • ${cam.name} • Continuous AI Liquid Hazard Sentinel monitoring`;

  // If there is an active spill near this camera, show the detected hazard snapshot
  if (STATE.activeSpill && STATE.activeSpill.nearestCam === cam.id) {
    snapshotUrl = STATE.activeSpill.snapshotUrl;
    statusBadgeText = "⚠️ HAZARD DETECTED";
    footerText = `CRITICAL ALERT: Liquid spill detected by ${cam.id} near Rack ${STATE.activeSpill.nearestRack || cam.rack}. Immediate maintenance dispatch requested.`;
  } else {
    // Generate clean clear floor feed
    snapshotUrl = generateCleanCameraSnapshot(cam.id, cam.rack, timeStr);
  }

  const modalImg = document.getElementById("enlarged-snapshot-img");
  if (modalImg) modalImg.src = snapshotUrl;

  const titleEl = document.getElementById("img-modal-title");
  if (titleEl) titleEl.textContent = `${cam.id} • ${cam.name}`;

  const badgeEl = document.getElementById("cctv-modal-badge");
  if (badgeEl) badgeEl.textContent = statusBadgeText;

  const hudCam = document.getElementById("hud-cam-id");
  if (hudCam) hudCam.textContent = cam.id;

  const hudTime = document.getElementById("hud-timestamp");
  if (hudTime) hudTime.textContent = `${timeStr} LIVE`;

  const footerEl = document.getElementById("img-modal-footer");
  if (footerEl) footerEl.textContent = footerText;

  document.getElementById("image-modal").classList.remove("hidden");
}
window.inspectCameraFeed = inspectCameraFeed;

/**
 * Removes active spill and logs cleanup
 */
function cleanUpSpill() {
  if (!STATE.activeSpill) return;

  const puddleEl = document.getElementById(`spill-svg-${STATE.activeSpill.id}`);
  if (puddleEl) puddleEl.remove();

  STATE.activeSpill = null;
  document.getElementById("cleanup-spill-btn").classList.add("hidden");

  logEvent("info", "Liquid spill on floor cleaned up. Area verified clear.", null, false);
  broadcastSimulationState();
}

/* ============================================================================
   SIMULATION ENGINE (500ms TICK)
   ============================================================================ */
function startSimulationLoop() {
  if (STATE.simIntervalId) clearInterval(STATE.simIntervalId);

  const interval = CONFIG.TICK_INTERVAL_MS / STATE.simSpeed;
  STATE.simIntervalId = setInterval(simulationTick, interval);
}

function setSpeed(speed) {
  STATE.simSpeed = speed;
  document.getElementById("speed-1x").classList.toggle("active", speed === 1);
  document.getElementById("speed-5x").classList.toggle("active", speed === 5);
  startSimulationLoop();
}

/**
 * Main simulation tick:
 * - Updates temperature (heats from slider, cools from units, adds noise)
 * - Checks cooling ON (temp > limit) and cooling OFF (temp < limit - 2°C)
 * - Updates humidity (soft noise + slight decrease during cooling)
 * - Note: cartons do NOT decay automatically (Manual Only per Change Request)
 */
function simulationTick() {
  // 1. Calculate Target Temperature influenced by Outside Heat slider
  // Base starting temp + outside heat delta
  const targetTemp = STATE.config.startingTemp + STATE.outsideHeatDelta;

  if (STATE.coolingActive) {
    // When cooling is ON, actively pull temperature down steadily
    STATE.currentTemp -= CONFIG.COOLING_POWER;
    // Counterbalance slightly if outside heat is extreme (+20)
    if (STATE.outsideHeatDelta > 15) {
      STATE.currentTemp += (STATE.outsideHeatDelta * 0.005);
    }
  } else {
    // Gradually drift toward outside heat target
    const diff = targetTemp - STATE.currentTemp;
    STATE.currentTemp += diff * CONFIG.TEMP_RATE_TO_TARGET;
  }

  // Alive noise
  const noise = (Math.random() - 0.5) * CONFIG.TEMP_NOISE_AMPLITUDE;
  STATE.currentTemp += noise;
  STATE.currentTemp = Math.round(STATE.currentTemp * 10) / 10;

  // 2. Check Cooling Logic & Hysteresis
  checkCoolingThresholds();

  // 3. Update Humidity
  const humTarget = STATE.config.startingHumidity;
  const humDiff = humTarget - STATE.currentHumidity;
  STATE.currentHumidity += humDiff * CONFIG.HUMIDITY_DRIFT_RATE;
  if (STATE.coolingActive) {
    STATE.currentHumidity -= CONFIG.COOLING_DEHUMIDIFY_EFFECT;
  }
  STATE.currentHumidity += (Math.random() - 0.5) * CONFIG.HUMIDITY_NOISE;
  STATE.currentHumidity = Math.max(30, Math.min(99, Math.round(STATE.currentHumidity * 10) / 10));

  // 4. Update cooling timer if running
  if (STATE.coolingActive) {
    STATE.coolingSecondsActive += (0.5 * STATE.simSpeed);
    updateCoolingTimerDisplay();
  }

  // 5. Push history for line charts
  STATE.tempHistory.push(STATE.currentTemp);
  if (STATE.tempHistory.length > CONFIG.CHART_HISTORY_MAX) STATE.tempHistory.shift();

  STATE.humidityHistory.push(STATE.currentHumidity);
  if (STATE.humidityHistory.length > CONFIG.CHART_HISTORY_MAX) STATE.humidityHistory.shift();

  // 6. Refresh Displays
  renderDashboard();
  renderSparklines();

  // 7. Sync state to Dashboard in real time
  broadcastSimulationState();
}

/**
 * Handles Cooling ON when temp > limit, and Cooling OFF when temp <= limit - 2°C
 */
function checkCoolingThresholds() {
  const limit = STATE.config.coolingLimit;
  const offThreshold = limit - CONFIG.COOLING_HYSTERESIS_DELTA;

  // Turn ON Coolers
  if (STATE.currentTemp > limit && !STATE.coolingActive) {
    STATE.coolingActive = true;
    STATE.coolingSecondsActive = 0;
    setCoolersVisualState(true);

    // Send WhatsApp alert if not already sent for this condition
    if (!STATE.alertsSent.coolingOn) {
      STATE.alertsSent.coolingOn = true;
      STATE.alertsSent.coolingOff = false; // reset off flag

      const msg = `⚠️ Hello ${STATE.config.ownerName}, the warehouse temperature has reached ${STATE.currentTemp.toFixed(1)}°C (limit ${limit.toFixed(1)}°C). Cooling units have been switched ON automatically.`;
      
      sendWhatsAppAlert(
        "temp-high",
        "Temperature Alert",
        msg,
        null
      );

      logEvent("temp", msg, null, false);
    }
  }

  // Turn OFF Coolers (Hysteresis 2°C below limit)
  else if (STATE.currentTemp <= offThreshold && STATE.coolingActive) {
    STATE.coolingActive = false;
    setCoolersVisualState(false);

    if (!STATE.alertsSent.coolingOff) {
      STATE.alertsSent.coolingOff = true;
      STATE.alertsSent.coolingOn = false; // reset on flag

      const msg = `✅ Temperature is back to normal at ${STATE.currentTemp.toFixed(1)}°C. Cooling units switched OFF.`;

      sendWhatsAppAlert(
        "temp-normal",
        "Temperature Normal",
        msg,
        null
      );

      logEvent("cool-off", msg, null, false);
    }
  }
}

/**
 * Updates 3 wall cooling units SVG visual states (fan rotation, blue airflow wave)
 */
function setCoolersVisualState(isActive) {
  for (let i = 1; i <= 3; i++) {
    const unitEl = document.getElementById(`cooler-unit-${i}`);
    const airFlowEl = document.getElementById(`cool-air-flow-${i}`);
    const statusTextEl = document.getElementById(`cooler-status-text-${i}`);

    if (isActive) {
      unitEl.classList.add("cooler-active");
      if (airFlowEl) airFlowEl.classList.remove("hidden");
      if (statusTextEl) {
        statusTextEl.textContent = "Cooling ON";
        statusTextEl.setAttribute("fill", CONFIG.COLORS.blue);
      }
    } else {
      unitEl.classList.remove("cooler-active");
      if (airFlowEl) airFlowEl.classList.add("hidden");
      if (statusTextEl) {
        statusTextEl.textContent = "Cooling OFF";
        statusTextEl.setAttribute("fill", "#64748B");
      }
    }
  }

  const coolingChip = document.getElementById("cooling-state-chip");
  const unitsTitle = document.getElementById("cooling-units-title");

  if (isActive) {
    coolingChip.textContent = "ON (3 UNITS)";
    coolingChip.className = "m-chip chip-cooling-on";
    unitsTitle.textContent = "3 Units Active";
  } else {
    coolingChip.textContent = "OFF";
    coolingChip.className = "m-chip chip-cooling-off";
    unitsTitle.textContent = "3 Units Standby";
  }
}

function updateCoolingTimerDisplay() {
  const totalSecs = Math.floor(STATE.coolingSecondsActive);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const str = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  document.getElementById("cooling-timer-val").textContent = str;
}

/* ============================================================================
   CONTROLS EVENT HANDLERS
   ============================================================================ */
function handleHeatSlider(val) {
  const num = parseFloat(val);
  STATE.outsideHeatDelta = num;

  const tag = document.getElementById("heat-weather-tag");
  if (num > 12) {
    tag.textContent = `Very hot day (+${num}°C)`;
  } else if (num > 4) {
    tag.textContent = `Warm day (+${num}°C)`;
  } else if (num >= -2) {
    tag.textContent = `Normal day (${num >= 0 ? "+" : ""}${num}°C)`;
  } else {
    tag.textContent = `Cold day (${num}°C)`;
  }
}

function adjustCoolingLimit(delta) {
  STATE.config.coolingLimit = Math.round((STATE.config.coolingLimit + delta) * 10) / 10;
  document.getElementById("cooling-limit-display").textContent = `${STATE.config.coolingLimit.toFixed(1)}°C`;
  document.getElementById("temp-sub-note").textContent = `Cooling triggers at ${STATE.config.coolingLimit.toFixed(1)}°C`;
  document.getElementById("cooling-hysteresis-note").textContent = `Turns off at ${(STATE.config.coolingLimit - CONFIG.COOLING_HYSTERESIS_DELTA).toFixed(1)}°C`;
  renderSparklines();
}

/* ============================================================================
   DASHBOARD METRICS & SPARKLINES RENDERING
   ============================================================================ */
function renderDashboard() {
  // 1. Temperature Card
  const tempValEl = document.getElementById("val-temp");
  const tempChip = document.getElementById("sim-temp-status-chip");
  if (tempValEl) tempValEl.textContent = STATE.currentTemp.toFixed(1);

  if (tempChip) {
    if (STATE.currentTemp > STATE.config.coolingLimit) {
      tempChip.textContent = "Too warm";
      tempChip.className = "m-chip chip-alert";
    } else if (STATE.coolingActive) {
      tempChip.textContent = "Cooling down";
      tempChip.className = "m-chip chip-info";
    } else {
      tempChip.textContent = "Normal";
      tempChip.className = "m-chip chip-normal";
    }
  }

  // 2. Humidity Card
  const humValEl = document.getElementById("val-humidity");
  humValEl.textContent = Math.round(STATE.currentHumidity);

  // 3. Wall Sensor Badge
  const wsEl = document.getElementById("wall-sensor-readings");
  wsEl.textContent = `${STATE.currentTemp.toFixed(1)}°C • ${Math.round(STATE.currentHumidity)}% RH`;
}

/**
 * Draws live mini sparkline charts on canvas with dashed cooling threshold line
 */
function renderSparklines() {
  drawSparkline(
    "temp-chart-canvas",
    STATE.tempHistory,
    CONFIG.COLORS.brandOrange,
    STATE.config.coolingLimit,
    true
  );

  drawSparkline(
    "humidity-chart-canvas",
    STATE.humidityHistory,
    CONFIG.COLORS.blue,
    null,
    false
  );
}

function drawSparkline(canvasId, history, strokeColor, thresholdVal, showThreshold) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  if (!history || history.length < 2) return;

  let minVal = Math.min(...history);
  let maxVal = Math.max(...history);

  if (thresholdVal !== null) {
    minVal = Math.min(minVal, thresholdVal - 2);
    maxVal = Math.max(maxVal, thresholdVal + 2);
  }

  // Ensure minimum range so flat line isn't pegged to bottom
  if (maxVal - minVal < 4) {
    maxVal += 2;
    minVal -= 2;
  }

  const range = maxVal - minVal;
  const padding = 6;
  const getY = (val) => h - padding - ((val - minVal) / range) * (h - padding * 2);

  // Draw Dashed Threshold Line if requested
  if (showThreshold && thresholdVal !== null) {
    const threshY = getY(thresholdVal);
    ctx.strokeStyle = "rgba(239, 68, 68, 0.6)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, threshY);
    ctx.lineTo(w, threshY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw History Line
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.beginPath();

  const step = w / (CONFIG.CHART_HISTORY_MAX - 1);
  history.forEach((val, i) => {
    const x = i * step;
    const y = getY(val);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

/* ============================================================================
   EVENT LOG SYSTEM
   ============================================================================ */
function logEvent(type, message, thumbUrl, isInitial) {
  const timeStr = getCurrentTimeString();
  const entry = {
    type,
    message,
    thumbUrl,
    time: timeStr
  };

  STATE.eventLogs.unshift(entry);

  const listEl = document.getElementById("event-log-list");
  const row = document.createElement("div");
  row.className = `log-entry alert-${type}`;

  let iconText = "ℹ️";
  if (type === "temp") iconText = "⚠️";
  if (type === "cool-off") iconText = "✅";
  if (type === "spoil") iconText = "🥬";
  if (type === "spill") iconText = "💧";

  row.innerHTML = `
    <span class="log-time">${timeStr}</span>
    <span class="log-badge-icon">${iconText}</span>
    <span class="log-msg">${escapeHtml(message)}</span>
    ${thumbUrl ? `
      <div class="log-thumb-wrap" onclick="openImageModal('${thumbUrl}', 'CCTV Spill Snapshot')">
        <img src="${thumbUrl}" alt="Snapshot" class="log-thumb" title="Click to enlarge snapshot">
      </div>
    ` : ""}
  `;

  listEl.prepend(row);

  const countTag = document.getElementById("log-count-tag");
  countTag.textContent = `${STATE.eventLogs.length} event${STATE.eventLogs.length > 1 ? "s" : ""} recorded`;
}

/* ============================================================================
   PHONE MOCKUP: NOTIFICATIONS & WHATSAPP CHAT
   ============================================================================ */

/**
 * Triggers realistic phone notification:
 * - Slide-in notification banner on lock screen
 * - Web Audio "ding" sound
 * - Phone vibration shake animation
 * - WhatsApp message item with typing indicator
 */
function sendWhatsAppAlert(type, title, messageText, imageUrl) {
  const timeStr = getCurrentTimeString(true); // e.g. "10:14"

  // 1. Play Ding & Shake Phone
  playNotificationSound();
  shakePhone();

  // 2. Add Notification card to Lock Screen Stack
  const notifContainer = document.getElementById("lock-notifications-container");
  const card = document.createElement("div");
  card.className = "notif-card";
  card.onclick = openPhoneChatView;
  card.innerHTML = `
    <div class="notif-top">
      <div class="wa-app-icon-mini">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
        </svg>
      </div>
      <span class="wa-app-name">WhatsApp</span>
      <span class="notif-time">${timeStr}</span>
    </div>
    <div class="notif-title">Warehouse Monitor</div>
    <div class="notif-body">${escapeHtml(messageText)}</div>
  `;
  notifContainer.prepend(card);

  // 3. Queue WhatsApp Message into Chat View with Typing Indicator
  simulateIncomingChatMessage(messageText, imageUrl, timeStr);
}

/**
 * Simulates typing indicator for ~1s before rendering the WhatsApp message bubble
 */
function simulateIncomingChatMessage(text, imageUrl, timeStr) {
  const typingEl = document.getElementById("wa-typing-indicator");
  const messagesContainer = document.getElementById("wa-messages-container");

  typingEl.classList.remove("hidden");
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  setTimeout(() => {
    typingEl.classList.add("hidden");

    const bubble = document.createElement("div");
    bubble.className = `wa-bubble ${imageUrl ? "image-bubble" : ""}`;

    if (imageUrl) {
      bubble.innerHTML = `
        <img src="${imageUrl}" class="wa-img-preview" alt="Snapshot" onclick="openImageModal('${imageUrl}', 'Spill Camera Snapshot')">
        <div class="wa-img-caption">${escapeHtml(text)}</div>
        <div class="wa-meta-row">
          <span class="wa-time">${timeStr}</span>
          <span class="wa-ticks">
            <svg width="14" height="10" viewBox="0 0 16 11" fill="none" stroke="#34B7F1" stroke-width="2">
              <path d="M1 6l3.5 3.5L13 1M5 6l2.5 2.5L15 1"/>
            </svg>
          </span>
        </div>
      `;
    } else {
      bubble.innerHTML = `
        <div class="wa-bubble-content">${escapeHtml(text)}</div>
        <div class="wa-meta-row">
          <span class="wa-time">${timeStr}</span>
          <span class="wa-ticks">
            <svg width="14" height="10" viewBox="0 0 16 11" fill="none" stroke="#34B7F1" stroke-width="2">
              <path d="M1 6l3.5 3.5L13 1M5 6l2.5 2.5L15 1"/>
            </svg>
          </span>
        </div>
      `;
    }

    messagesContainer.appendChild(bubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }, 900);
}

function openPhoneChatView() {
  document.getElementById("phone-lock-view").classList.remove("active");
  document.getElementById("phone-chat-view").classList.add("active");
  const messagesContainer = document.getElementById("wa-messages-container");
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function closePhoneChatView() {
  document.getElementById("phone-chat-view").classList.remove("active");
  document.getElementById("phone-lock-view").classList.add("active");
}

function shakePhone() {
  const phone = document.getElementById("phone-frame");
  phone.classList.remove("shake");
  void phone.offsetWidth; // Force reflow
  phone.classList.add("shake");
  setTimeout(() => phone.classList.remove("shake"), 400);
}

/* ============================================================================
   WEB AUDIO API SOUND GENERATOR
   ============================================================================ */
function initAudio() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    STATE.audioCtx = new AudioContext();
  } catch (e) {
    console.warn("Web Audio API not supported", e);
  }
}

function playNotificationSound() {
  if (STATE.isMuted) return;

  try {
    if (!STATE.audioCtx) initAudio();
    if (STATE.audioCtx.state === "suspended") {
      STATE.audioCtx.resume();
    }

    const ctx = STATE.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Friendly chime sequence: 880Hz to 1174Hz
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (err) {
    console.error("Audio playback error:", err);
  }
}

function toggleMute() {
  STATE.isMuted = !STATE.isMuted;
  document.getElementById("sound-icon-on").classList.toggle("hidden", STATE.isMuted);
  document.getElementById("sound-icon-off").classList.toggle("hidden", !STATE.isMuted);
}

/* ============================================================================
   GUIDED DEMO SCENARIO (60-75s SCRIPTED WALKTHROUGH)
   Updated per Change Request: Steps 1-4 run automatically. Steps 5 & 6 PAUSE
   and instruct the user to click and perform the action manually.
   ============================================================================ */
function startGuidedDemo() {
  STATE.demo.isRunning = true;
  document.getElementById("guided-demo-bar").classList.remove("hidden");
  document.getElementById("guided-demo-btn").classList.add("btn-outline");

  runGuidedDemoStep(1);
}

function stopGuidedDemo() {
  STATE.demo.isRunning = false;
  STATE.demo.currentStep = 0;
  clearTimeout(STATE.demo.stepTimer);
  clearInterval(STATE.demo.heatAnimationInterval);
  document.getElementById("guided-demo-bar").classList.add("hidden");
  cancelInteractiveMode();
}

function skipGuidedDemoStep() {
  if (!STATE.demo.isRunning) return;
  clearTimeout(STATE.demo.stepTimer);
  clearInterval(STATE.demo.heatAnimationInterval);

  if (STATE.demo.currentStep < 7) {
    runGuidedDemoStep(STATE.demo.currentStep + 1);
  } else {
    stopGuidedDemo();
  }
}

function runGuidedDemoStep(step) {
  if (!STATE.demo.isRunning) return;
  STATE.demo.currentStep = step;
  document.getElementById("demo-step-num").textContent = step;
  const captionEl = document.getElementById("demo-caption-text");

  switch(step) {
    case 1:
      // Step 1: Normal State
      captionEl.textContent = "1. Everything is normal. Temperature and humidity are being monitored live.";
      STATE.demo.stepTimer = setTimeout(() => runGuidedDemoStep(2), 6500);
      break;

    case 2:
      // Step 2: Outside heat rises
      captionEl.textContent = "2. It's getting hot outside… Heat enters the warehouse.";
      animateHeatSlider(0, 16, 4000, () => {
        STATE.demo.stepTimer = setTimeout(() => runGuidedDemoStep(3), 6000);
      });
      break;

    case 3:
      // Step 3: Limit crossed -> Coolers ON -> WhatsApp Alert
      captionEl.textContent = "3. Limit crossed! Cooling started automatically and the owner was notified on WhatsApp.";
      STATE.demo.stepTimer = setTimeout(() => runGuidedDemoStep(4), 8500);
      break;

    case 4:
      // Step 4: Temperature comes down -> Back to normal
      captionEl.textContent = "4. Wall cooling units lower the temperature… Temperature returns back to normal.";
      animateHeatSlider(16, 0, 3000, () => {
        STATE.demo.stepTimer = setTimeout(() => runGuidedDemoStep(5), 7000);
      });
      break;

    case 5:
      // Step 5: Carton spoilage (MANUAL ONLY: PAUSES FOR USER)
      captionEl.innerHTML = "<strong>Action required:</strong> Now click any carton and press <em>'Spoil this vegetable'</em> to see what happens.";
      enterPickCartonMode();
      // Demo will resume automatically when user clicks or if they press 'Skip step'
      break;

    case 6:
      // Step 6: Liquid spill (MANUAL ONLY: PAUSES FOR USER)
      cancelInteractiveMode();
      captionEl.innerHTML = "<strong>Action required:</strong> Now press <em>'Spill Liquid'</em> and click anywhere on the floor.";
      startSpillMode();
      // Demo will resume automatically when spill occurs or if they press 'Skip step'
      break;

    case 7:
      // Step 7: Wrap-up
      cancelInteractiveMode();
      captionEl.textContent = "7. All events and camera photos are permanently saved on the dashboard.";
      STATE.demo.stepTimer = setTimeout(() => {
        stopGuidedDemo();
      }, 7000);
      break;
  }
}

/**
 * Smoothly animates the outside heat slider to simulate weather changes
 */
function animateHeatSlider(fromVal, toVal, durationMs, onComplete) {
  const slider = document.getElementById("heat-slider");
  const steps = 30;
  const stepTime = durationMs / steps;
  let currentStep = 0;

  if (STATE.demo.heatAnimationInterval) clearInterval(STATE.demo.heatAnimationInterval);

  STATE.demo.heatAnimationInterval = setInterval(() => {
    currentStep++;
    const progress = currentStep / steps;
    const currentVal = fromVal + (toVal - fromVal) * progress;
    slider.value = Math.round(currentVal);
    handleHeatSlider(slider.value);

    if (currentStep >= steps) {
      clearInterval(STATE.demo.heatAnimationInterval);
      if (onComplete) onComplete();
    }
  }, stepTime);
}

/* ============================================================================
   MODALS: "HOW IT WORKS" & IMAGE ENLARGE
   ============================================================================ */
function openHowItWorksModal() {
  document.getElementById("how-modal").classList.remove("hidden");
}

function closeHowItWorksModal() {
  document.getElementById("how-modal").classList.add("hidden");
}

function openImageModal(imgSrc, title) {
  document.getElementById("enlarged-snapshot-img").src = imgSrc;
  if (title) document.getElementById("img-modal-title").textContent = title;
  document.getElementById("image-modal").classList.remove("hidden");
}

function closeImageModal() {
  document.getElementById("image-modal").classList.add("hidden");
}

function handleModalBackdropClick(event) {
  if (event.target.classList.contains("modal-backdrop")) {
    closeHowItWorksModal();
    closeImageModal();
  }
}

/* ============================================================================
   RESET TO SETUP SCREEN
   ============================================================================ */
function resetToSetup() {
  // Clear running loops
  if (STATE.simIntervalId) clearInterval(STATE.simIntervalId);
  if (STATE.clockIntervalId) clearInterval(STATE.clockIntervalId);
  stopGuidedDemo();

  // Reset screen states
  document.getElementById("sim-screen").classList.remove("active");
  document.getElementById("setup-screen").classList.add("active");
  STATE.currentScreen = "setup";

  // Pre-fill setup inputs with current config
  document.getElementById("input-temp").value = STATE.config.startingTemp;
  document.getElementById("input-humidity").value = STATE.config.startingHumidity;
  document.getElementById("input-cooling-limit").value = STATE.config.coolingLimit;
  document.getElementById("input-owner-name").value = STATE.config.ownerName;
  document.getElementById("input-owner-phone").value = STATE.config.ownerPhone;

  // Clear Phone messages & event logs
  document.getElementById("lock-notifications-container").innerHTML = "";
  document.getElementById("wa-messages-container").innerHTML = `
    <div class="wa-date-chip">TODAY</div>
    <div class="wa-bubble wa-system-msg">
      <span>Messages are end-to-end encrypted with IoT Facility Gateway.</span>
    </div>
  `;
  document.getElementById("event-log-list").innerHTML = "";
  document.getElementById("spills-layer").innerHTML = "";
  closePhoneChatView();
  cancelInteractiveMode();
  cleanUpSpill();
}

/* ============================================================================
   UTILITY HELPERS (SIMULATED CLOCK, TIME STRINGS, ESCAPING)
   ============================================================================ */
let simMinutes = 10 * 60; // Start at 10:00 AM

function startClockTicker() {
  if (STATE.clockIntervalId) clearInterval(STATE.clockIntervalId);

  STATE.clockIntervalId = setInterval(() => {
    simMinutes += (1 / 60) * STATE.simSpeed;
    updateClockDisplay();
  }, 1000);
}

function updateClockDisplay() {
  const timeStr = formatMinutesToClock(simMinutes);
  const timeShort = formatMinutesToShort(simMinutes);

  const clockEl = document.getElementById("sim-clock");
  if (clockEl) clockEl.textContent = timeStr;

  const phoneLockClock = document.getElementById("lock-clock");
  if (phoneLockClock) phoneLockClock.textContent = timeShort;

  const phoneStatusTime = document.getElementById("phone-status-time");
  if (phoneStatusTime) phoneStatusTime.textContent = timeShort;
}

function formatMinutesToClock(totalMins) {
  const hours24 = Math.floor(totalMins / 60) % 24;
  const mins = Math.floor(totalMins % 60);
  const secs = Math.floor((totalMins * 60) % 60);
  const ampm = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')} ${ampm}`;
}

function formatMinutesToShort(totalMins) {
  const hours24 = Math.floor(totalMins / 60) % 24;
  const mins = Math.floor(totalMins % 60);
  return `${hours24.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function getCurrentTimeString(shortOnly = false) {
  if (shortOnly) {
    return formatMinutesToShort(simMinutes);
  }
  return formatMinutesToClock(simMinutes);
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m];
  });
}

/* ============================================================================
   LIVE DASHBOARD SYNCHRONIZATION BRIDGE
   Broadcasts simulation telemetry, carton states, cooling, and spills in real time
   ============================================================================ */
let simSyncChannel = null;

function initSimBroadcastListener() {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      simSyncChannel = new BroadcastChannel("warehouse_simulation_sync");
      simSyncChannel.onmessage = (event) => {
        if (!event.data) return;
        if (event.data.type === "REQUEST_STATE") {
          broadcastSimulationState();
        } else if (event.data.type === "DASH_REPLACE_CARTON" && event.data.cartonId) {
          if (STATE.cartons[event.data.cartonId] && STATE.cartons[event.data.cartonId].state === "spoiled") {
            replaceCartonFresh(event.data.cartonId);
          }
        }
      };
    }
  } catch (e) {
    console.warn("BroadcastChannel not supported", e);
  }

  // Cross-tab storage event listener for DASH_REPLACE_CARTON and REQUEST_STATE
  window.addEventListener("storage", (e) => {
    if (e.key === "warehouse_dash_action" && e.newValue) {
      try {
        const payload = JSON.parse(e.newValue);
        if (payload && payload.type === "DASH_REPLACE_CARTON" && payload.cartonId) {
          if (STATE.cartons[payload.cartonId] && STATE.cartons[payload.cartonId].state === "spoiled") {
            replaceCartonFresh(payload.cartonId);
          }
        }
      } catch (err) {}
    }
  });

  // Generate baseline cartons if setup screen is currently idle so dashboard has data immediately
  if (Object.keys(STATE.cartons).length === 0) {
    initBaselineCartonMap();
  }
  broadcastSimulationState();
}

function initBaselineCartonMap() {
  const racks = ["A", "B", "C", "D"];
  let vegIndex = 0;
  racks.forEach(rackId => {
    for (let col = 1; col <= 6; col++) {
      const cartonId = `${rackId}-0${col}`;
      const veg = CONFIG.VEGETABLES[vegIndex % CONFIG.VEGETABLES.length];
      vegIndex++;
      STATE.cartons[cartonId] = {
        id: cartonId,
        rack: rackId,
        vegetable: veg.name,
        icon: veg.icon,
        state: "fresh"
      };
    }
  });
}

function broadcastSimulationState() {
  const syncPayload = {
    type: "SIM_STATE_UPDATE",
    timestamp: Date.now(),
    simTime: typeof simMinutes !== "undefined" ? getCurrentTimeString() : "11:20 AM",
    temp: STATE.currentTemp,
    humidity: STATE.currentHumidity,
    coolingActive: STATE.coolingActive,
    coolingSeconds: STATE.coolingSecondsActive,
    coolingLimit: STATE.config.coolingLimit,
    cartons: {},
    activeSpill: STATE.activeSpill ? {
      id: STATE.activeSpill.id,
      nearestCam: STATE.activeSpill.nearestCam,
      nearestRack: STATE.activeSpill.nearestRack,
      timestamp: STATE.activeSpill.timestamp,
      snapshotUrl: STATE.activeSpill.snapshotUrl
    } : null
  };

  // Extract cartons state map
  if (STATE.cartons) {
    Object.keys(STATE.cartons).forEach(cid => {
      const c = STATE.cartons[cid];
      syncPayload.cartons[cid] = {
        id: c.id,
        rack: c.rack,
        vegetable: c.vegetable,
        state: c.state
      };
    });
  }

  try {
    localStorage.setItem("warehouse_sim_state", JSON.stringify(syncPayload));
  } catch (err) {
    // quota safe fallback
  }

  if (simSyncChannel) {
    try {
      simSyncChannel.postMessage(syncPayload);
    } catch (e) {
      console.warn("Sync postMessage error", e);
    }
  }

  // Always update integrated in-memory dashboard immediately with 0ms latency
  renderOperationsDashboardView();
}

/* ============================================================================
   INTEGRATED OPERATIONS DASHBOARD (IN-MEMORY UNIFIED ENGINE)
   Binds directly to STATE with 0ms latency, zero network, zero desync.
   ============================================================================ */

const DASHBOARD_META = {
  racks: [
    { id: "A", name: "Rack A", hint: "Tomatoes", category: "Vine Produce" },
    { id: "B", name: "Rack B", hint: "Potatoes & Onions", category: "Root Vegetables" },
    { id: "C", name: "Rack C", hint: "Spinach & Cabbage", category: "Leafy Greens" },
    { id: "D", name: "Rack D", hint: "Carrots", category: "Root Crops" }
  ],
  areas: [
    { id: "rack-a", name: "Rack A Aisle", cam: "CAM-1", lastChecked: "Just now" },
    { id: "rack-b", name: "Rack B Aisle", cam: "CAM-2", lastChecked: "Just now" },
    { id: "rack-c", name: "Rack C Aisle", cam: "CAM-3", lastChecked: "Just now" },
    { id: "rack-d", name: "Rack D Aisle", cam: "CAM-4", lastChecked: "Just now" },
    { id: "loading-dock", name: "Loading Dock", cam: "CAM-5", lastChecked: "Just now" },
    { id: "entrance", name: "Entrance", cam: "CAM-6", lastChecked: "Just now" }
  ],
  coolingUnits: [
    { id: 1, name: "Cooling Unit 1", location: "North wall • E-01" },
    { id: 2, name: "Cooling Unit 2", location: "East wall • E-02" },
    { id: 3, name: "Cooling Unit 3", location: "West wall • E-03" }
  ],
  activeFilter: "all",
  activeDrawerCartonId: null
};

/**
 * Initializes the integrated Operations Dashboard view
 */
function initOperationsDashboardView() {
  initIntegratedCartonGrid();
  renderIntegratedAreasTable();
  renderIntegratedSpillHistory();
  renderOperationsDashboardView();
}

/**
 * Populates the 24-carton matrix grid in the dashboard
 */
function initIntegratedCartonGrid() {
  const container = document.getElementById("carton-grid-matrix");
  if (!container) return;
  container.innerHTML = "";

  DASHBOARD_META.racks.forEach(rack => {
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
      const c = STATE.cartons[cartonId] || {
        id: cartonId,
        rack: rack.id,
        vegetable: rack.hint.split(" ")[0],
        icon: "📦",
        state: "fresh"
      };

      const isSpoiled = (c.state === "spoiled");

      const tile = document.createElement("div");
      tile.className = `carton-tile ${isSpoiled ? "spoiled" : "fresh"}`;
      tile.id = `dash-carton-tile-${cartonId}`;
      tile.onclick = () => openIntegratedCartonDrawer(cartonId);

      tile.innerHTML = `
        <div class="tile-top-row">
          <span class="tile-id">${cartonId}</span>
          <span class="tile-status-pill ${isSpoiled ? "spoiled" : "fresh"}">${isSpoiled ? "Spoiled" : "Fresh"}</span>
        </div>
        <div class="tile-veg-name">${c.icon || "📦"} ${c.vegetable}</div>
        
        <div class="carton-micro-meter">
          <div class="carton-micro-fill ${isSpoiled ? "spoiled" : "fresh"}" style="width: ${isSpoiled ? "18%" : "96%"};"></div>
        </div>

        <div class="tile-status-time-box">
          ${isSpoiled ? `
            <div class="tile-spoiled-time">
              <span class="pulse-dot-red" style="width:5px;height:5px;"></span>
              <span>Gas alert flagged</span>
            </div>
          ` : ""}
        </div>
      `;

      tilesRow.appendChild(tile);
    }

    rackRow.appendChild(labelBox);
    rackRow.appendChild(tilesRow);
    container.appendChild(rackRow);
  });
}

/**
 * Filter buttons handler for carton status grid
 */
function filterCartons(filter) {
  DASHBOARD_META.activeFilter = filter;

  const btnAll = document.getElementById("filter-all");
  const btnFresh = document.getElementById("filter-fresh");
  const btnSpoiled = document.getElementById("filter-spoiled");

  if (btnAll) btnAll.classList.toggle("active", filter === "all");
  if (btnFresh) btnFresh.classList.toggle("active", filter === "fresh");
  if (btnSpoiled) btnSpoiled.classList.toggle("active", filter === "spoiled");

  Object.values(STATE.cartons).forEach(c => {
    const tile = document.getElementById(`dash-carton-tile-${c.id}`);
    if (!tile) return;

    if (filter === "all") {
      tile.classList.remove("hidden-filter");
    } else if (filter === "fresh") {
      tile.classList.toggle("hidden-filter", c.state !== "fresh");
    } else if (filter === "spoiled") {
      tile.classList.toggle("hidden-filter", c.state !== "spoiled");
    }
  });
}

/**
 * Opens carton inspection drawer
 */
function openIntegratedCartonDrawer(cartonId) {
  const c = STATE.cartons[cartonId];
  if (!c) return;

  DASHBOARD_META.activeDrawerCartonId = cartonId;

  const idBadge = document.getElementById("drawer-carton-id");
  const vegTitle = document.getElementById("drawer-carton-veg");
  const rackVal = document.getElementById("drawer-rack-val");
  const catVal = document.getElementById("drawer-category-val");
  const statusPill = document.getElementById("drawer-status-pill");
  const statusText = document.getElementById("drawer-status-text");
  const actionBox = document.getElementById("drawer-action-box");
  const gasVal = document.getElementById("drawer-gas-val");
  const checkedVal = document.getElementById("drawer-checked-val");

  if (idBadge) idBadge.textContent = c.id;
  if (vegTitle) vegTitle.textContent = `${c.icon || "📦"} ${c.vegetable}`;
  if (rackVal) rackVal.textContent = `Rack ${c.rack}`;
  
  const rackMeta = DASHBOARD_META.racks.find(r => r.id === c.rack);
  if (catVal) catVal.textContent = rackMeta ? rackMeta.category : "Fresh Produce";
  if (checkedVal) checkedVal.textContent = "Just now";

  const isSpoiled = (c.state === "spoiled");
  if (isSpoiled) {
    if (statusPill) statusPill.className = "drawer-status-pill spoiled";
    if (statusText) statusText.textContent = "Spoiled";
    if (gasVal) gasVal.textContent = "High (0.18 ppm ethylene)";
    if (actionBox) actionBox.classList.remove("hidden");
  } else {
    if (statusPill) statusPill.className = "drawer-status-pill fresh";
    if (statusText) statusText.textContent = "Fresh";
    if (gasVal) gasVal.textContent = "Normal (< 0.02 ppm)";
    if (actionBox) actionBox.classList.add("hidden");
  }

  const drawer = document.getElementById("carton-drawer");
  if (drawer) drawer.classList.add("open");
}

function closeCartonDrawer() {
  const drawer = document.getElementById("carton-drawer");
  if (drawer) drawer.classList.remove("open");
}

function handleDrawerReplace() {
  if (DASHBOARD_META.activeDrawerCartonId) {
    replaceCartonFresh(DASHBOARD_META.activeDrawerCartonId);
    openIntegratedCartonDrawer(DASHBOARD_META.activeDrawerCartonId);
  }
}

// Global click closes carton drawer
document.addEventListener("click", (e) => {
  const drawer = document.getElementById("carton-drawer");
  if (drawer && drawer.classList.contains("open") && !drawer.contains(e.target) && !e.target.closest(".carton-tile")) {
    closeCartonDrawer();
  }
});

/**
 * Main render routine for the integrated Operations Dashboard view
 */
function renderOperationsDashboardView() {
  // 1. Metric Big Values & Status Chips
  const tempBig = document.getElementById("temp-big-val");
  const tempChip = document.getElementById("temp-status-chip");
  const tempCoolChip = document.getElementById("temp-cooling-chip");
  const tempCoolText = document.getElementById("temp-cooling-chip-text");
  const tempGaugeFill = document.getElementById("temp-gauge-fill");
  const tempNeedle = document.getElementById("temp-needle-group");
  const limitLabel = document.getElementById("dash-cooling-limit-label");
  const hystLabel = document.getElementById("dash-hysteresis-hint");

  if (tempBig) tempBig.textContent = STATE.currentTemp.toFixed(1);

  if (limitLabel) limitLabel.textContent = `Limit: ${STATE.config.coolingLimit.toFixed(1)}°C`;
  if (hystLabel) hystLabel.textContent = `Cooling stops below ${(STATE.config.coolingLimit - CONFIG.COOLING_HYSTERESIS_DELTA).toFixed(1)}°C`;

  if (tempChip) {
    if (STATE.currentTemp > STATE.config.coolingLimit) {
      tempChip.textContent = "Too warm";
      tempChip.className = "status-chip chip-red";
    } else if (STATE.currentTemp >= (STATE.config.coolingLimit - 1.0)) {
      tempChip.textContent = "Near limit";
      tempChip.className = "status-chip chip-amber";
    } else {
      tempChip.textContent = "Normal";
      tempChip.className = "status-chip chip-normal";
    }
  }

  if (tempCoolChip && tempCoolText) {
    if (STATE.coolingActive) {
      tempCoolChip.className = "cooling-inline-chip chip-on";
      tempCoolText.textContent = "Cooling: ON";
    } else {
      tempCoolChip.className = "cooling-inline-chip chip-off";
      tempCoolText.textContent = "Cooling: OFF";
    }
  }

  // Gauge fill (5.0 to 12.0 °C)
  const gaugePct = Math.max(0, Math.min(100, ((STATE.currentTemp - 5.0) / (12.0 - 5.0)) * 100));
  if (tempGaugeFill) tempGaugeFill.style.width = `${gaugePct}%`;

  // Semi-circle Needle (-90deg to +90deg mapped between 4.0°C and 13.0°C)
  const tempAngle = Math.max(-90, Math.min(90, -90 + ((STATE.currentTemp - 4.0) / (13.0 - 4.0)) * 180));
  if (tempNeedle) {
    tempNeedle.setAttribute("transform", `rotate(${tempAngle.toFixed(1)} 80 80)`);
  }

  // 2. Humidity Card
  const humBig = document.getElementById("hum-big-val");
  const humChip = document.getElementById("hum-status-chip");
  const humPin = document.getElementById("hum-gauge-pin");

  if (humBig) humBig.textContent = Math.round(STATE.currentHumidity);

  if (humChip) {
    if (STATE.currentHumidity > 92) {
      humChip.textContent = "Slightly high";
      humChip.className = "status-chip chip-amber";
    } else if (STATE.currentHumidity < 80) {
      humChip.textContent = "Slightly low";
      humChip.className = "status-chip chip-amber";
    } else {
      humChip.textContent = "Good for storage";
      humChip.className = "status-chip chip-normal";
    }
  }

  const humPct = Math.max(0, Math.min(100, ((STATE.currentHumidity - 70) / (100 - 70)) * 100));
  if (humPin) {
    humPin.style.left = `${Math.max(2, Math.min(98, humPct))}%`;
  }

  // 3. Cooling Units Card
  const coolingSummaryEl = document.getElementById("cooling-units-summary");
  const summaryCoolStatusEl = document.getElementById("summary-cooling-status");

  if (STATE.coolingActive) {
    if (coolingSummaryEl) coolingSummaryEl.textContent = "3 of 3 running";
    if (summaryCoolStatusEl) summaryCoolStatusEl.textContent = "Cooling: Running";
  } else {
    if (coolingSummaryEl) coolingSummaryEl.textContent = "All units off";
    if (summaryCoolStatusEl) summaryCoolStatusEl.textContent = "Cooling: Off";
  }

  for (let i = 1; i <= 3; i++) {
    const tile = document.getElementById(`unit-tile-${i}`);
    const pill = document.getElementById(`unit-pill-${i}`);
    const timeEl = document.getElementById(`unit-time-${i}`);
    const loadFill = document.getElementById(`unit-load-${i}`);

    if (STATE.coolingActive) {
      if (tile) tile.classList.add("running");
      if (pill) { pill.textContent = "Running"; pill.className = "unit-pill pill-blue"; }
      if (loadFill) loadFill.style.width = "100%";
      const mins = Math.floor(STATE.coolingSecondsActive / 60);
      const secs = Math.floor(STATE.coolingSecondsActive % 60);
      if (timeEl) timeEl.textContent = `Running for ${mins > 0 ? mins + ' min ' : ''}${secs}s`;
    } else {
      if (tile) tile.classList.remove("running");
      if (pill) { pill.textContent = "Off"; pill.className = "unit-pill pill-grey"; }
      if (loadFill) loadFill.style.width = "0%";
      if (timeEl) timeEl.textContent = "Standby ready";
    }
  }

  // 4. Warehouse Health Summary & Cartons Count
  let freshCount = 0;
  let spoiledCount = 0;
  Object.values(STATE.cartons).forEach(c => {
    if (c.state === "spoiled") spoiledCount++;
    else freshCount++;
  });

  const totalCartons = Math.max(1, freshCount + spoiledCount);
  const activeSpillsCount = STATE.activeSpill ? 1 : 0;
  const freshPct = Math.round((freshCount / totalCartons) * 100);

  const hcFresh = document.getElementById("hc-fresh-count");
  const hcSpoiled = document.getElementById("hc-spoiled-count");
  const hcSpills = document.getElementById("hc-spills-count");
  const gradeBadge = document.getElementById("dash-health-grade-badge");

  if (hcFresh) hcFresh.textContent = freshCount;
  if (hcSpoiled) hcSpoiled.textContent = spoiledCount;
  if (hcSpills) hcSpills.textContent = activeSpillsCount;

  if (gradeBadge) {
    if (spoiledCount === 0 && activeSpillsCount === 0) {
      gradeBadge.textContent = "Grade A+";
      gradeBadge.style.color = "#15803D";
      gradeBadge.style.background = "#DCFCE7";
    } else if (spoiledCount <= 2 && activeSpillsCount === 0) {
      gradeBadge.textContent = "Grade A-";
      gradeBadge.style.color = "#B45309";
      gradeBadge.style.background = "#FEF3C7";
    } else {
      gradeBadge.textContent = "Action Needed";
      gradeBadge.style.color = "#DC2626";
      gradeBadge.style.background = "#FEE2E2";
    }
  }

  // Donut label
  const donutPctEl = document.querySelector("#view-dash-container .donut-pct");
  if (donutPctEl) donutPctEl.textContent = `${freshPct}%`;

  // Progress meters
  const freshMeter = document.querySelector("#view-dash-container .bi-meter-fill.green");
  const spoiledMeter = document.querySelector("#view-dash-container .bi-meter-fill.red");
  if (freshMeter) freshMeter.style.width = `${(freshCount / totalCartons) * 100}%`;
  if (spoiledMeter) spoiledMeter.style.width = `${(spoiledCount / totalCartons) * 100}%`;

  // Filter chips count updates
  const chipAllCount = document.querySelector("#filter-all .chip-count");
  const chipFreshCount = document.querySelector("#filter-fresh .chip-count");
  const chipSpoiledCount = document.querySelector("#filter-spoiled .chip-count");
  if (chipAllCount) chipAllCount.textContent = totalCartons;
  if (chipFreshCount) chipFreshCount.textContent = freshCount;
  if (chipSpoiledCount) chipSpoiledCount.textContent = spoiledCount;

  // 5. Update Carton Tiles DOM in Grid Matrix
  Object.values(STATE.cartons).forEach(c => {
    const tile = document.getElementById(`dash-carton-tile-${c.id}`);
    if (!tile) return;

    const isSpoiled = (c.state === "spoiled");
    tile.className = `carton-tile ${isSpoiled ? "spoiled" : "fresh"}`;

    const pill = tile.querySelector(".tile-status-pill");
    if (pill) {
      pill.className = `tile-status-pill ${isSpoiled ? "spoiled" : "fresh"}`;
      pill.textContent = isSpoiled ? "Spoiled" : "Fresh";
    }

    const microFill = tile.querySelector(".carton-micro-fill");
    if (microFill) {
      microFill.className = `carton-micro-fill ${isSpoiled ? "spoiled" : "fresh"}`;
      microFill.style.width = isSpoiled ? "18%" : "96%";
    }

    const timeBox = tile.querySelector(".tile-status-time-box");
    if (timeBox) {
      if (isSpoiled) {
        timeBox.innerHTML = `
          <div class="tile-spoiled-time">
            <span class="pulse-dot-red" style="width:5px;height:5px;"></span>
            <span>Gas alert flagged</span>
          </div>
        `;
      } else {
        timeBox.innerHTML = "";
      }
    }
  });

  if (DASHBOARD_META.activeFilter !== "all") {
    filterCartons(DASHBOARD_META.activeFilter);
  }

  // 6. Render SVG Sparklines in Dashboard
  renderDashboardSparklines();

  // 7. Update Liquid Spill Detection
  renderIntegratedSpillView();

  // 8. Update Activity Feed
  renderIntegratedActivityFeed();
}

/**
 * Draws SVG sparklines for the Operations Dashboard view
 */
function renderDashboardSparklines() {
  drawSvgSparkline("temp-chart-svg", STATE.tempHistory, CONFIG.COLORS.brandOrange, STATE.config.coolingLimit, true);
  drawSvgSparkline("hum-chart-svg", STATE.humidityHistory, CONFIG.COLORS.blue, null, false);
}

function drawSvgSparkline(svgId, data, color, thresholdVal, showThreshold) {
  const svg = document.getElementById(svgId);
  if (!svg || !data || data.length < 2) return;

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

  if (showThreshold && thresholdVal !== null) {
    const threshY = getY(thresholdVal);
    innerSvg += `<line x1="0" y1="${threshY}" x2="${width}" y2="${threshY}" stroke="#EF4444" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.8"/>`;
  }

  innerSvg += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;

  svg.innerHTML = innerSvg;
}

/**
 * Renders Spill detection area status, active alert card, and floor map badges
 */
function renderIntegratedSpillView() {
  const activeSpillsTag = document.getElementById("pill-active-spills-tag");
  const cleanAreasTag = document.getElementById("pill-clean-areas-tag");
  const noSpillBanner = document.getElementById("no-spills-banner");
  const paneBadge = document.getElementById("spill-pane-status-badge");
  const dynamicSpillCard = document.getElementById("spill-card-active-dynamic");

  if (STATE.activeSpill) {
    if (activeSpillsTag) {
      activeSpillsTag.style.display = "inline-flex";
      const txt = document.getElementById("pill-spills-text");
      if (txt) txt.textContent = "1 Active Spill Detected";
    }
    if (cleanAreasTag) cleanAreasTag.textContent = "5 Areas Clear";
    if (noSpillBanner) noSpillBanner.classList.add("hidden");
    if (paneBadge) {
      paneBadge.textContent = "Action Required";
      paneBadge.className = "alert-status-badge";
    }

    if (dynamicSpillCard) {
      dynamicSpillCard.classList.remove("hidden");
      const img = document.getElementById("spill-img-active-dynamic");
      const zoneTitle = document.getElementById("spill-dynamic-zone-title");
      const camId = document.getElementById("spill-dynamic-cam-id");
      const camBadge = document.getElementById("spill-dynamic-cam-badge");
      const spillTime = document.getElementById("spill-dynamic-time");

      if (img && STATE.activeSpill.snapshotUrl) img.src = STATE.activeSpill.snapshotUrl;
      if (zoneTitle) zoneTitle.textContent = `Near Rack ${STATE.activeSpill.nearestRack || "C"} Aisle`;
      if (camId) camId.textContent = `Camera: ${STATE.activeSpill.nearestCam || "CAM-3"}`;
      if (camBadge) camBadge.textContent = `${STATE.activeSpill.nearestCam || "CAM-3"} • SNAPSHOT`;
      if (spillTime) spillTime.textContent = `Detected at ${STATE.activeSpill.timestamp || "Just now"}`;
    }

    // Highlight nearest area in SVG map
    const nearestRack = STATE.activeSpill.nearestRack ? STATE.activeSpill.nearestRack.toLowerCase() : "c";
    const areaId = `rack-${nearestRack}`;
    updateDashboardSvgArea(areaId, true);
  } else {
    if (activeSpillsTag) activeSpillsTag.style.display = "none";
    if (cleanAreasTag) cleanAreasTag.textContent = "6 Areas Clear";
    if (noSpillBanner) noSpillBanner.classList.remove("hidden");
    if (paneBadge) {
      paneBadge.textContent = "All Areas Clear";
      paneBadge.className = "alert-status-badge";
      paneBadge.style.color = "#15803D";
      paneBadge.style.background = "#DCFCE7";
    }
    if (dynamicSpillCard) dynamicSpillCard.classList.add("hidden");

    // Clear all SVG map spill states
    ["rack-a", "rack-b", "rack-c", "rack-d", "loading-dock", "entrance"].forEach(aid => {
      updateDashboardSvgArea(aid, false);
    });
  }

  renderIntegratedAreasTable();
}

function updateDashboardSvgArea(areaId, hasSpill) {
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

function renderIntegratedAreasTable() {
  const tbody = document.getElementById("areas-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const activeSpillArea = STATE.activeSpill ? `rack-${(STATE.activeSpill.nearestRack || "c").toLowerCase()}` : null;

  DASHBOARD_META.areas.forEach(a => {
    const isSpill = (a.id === activeSpillArea);
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.onclick = () => selectSpillArea(a.id);

    tr.innerHTML = `
      <td><strong>${a.name}</strong></td>
      <td style="color:#64748B;">${a.cam}</td>
      <td>
        <span class="${isSpill ? "tbl-pill-red" : "tbl-pill-green"}">
          ${isSpill ? "💧 Spill detected" : "✓ No spill"}
        </span>
      </td>
      <td style="color:#64748B;">${isSpill ? (STATE.activeSpill.timestamp || "Just now") : a.lastChecked}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderIntegratedSpillHistory() {
  const list = document.getElementById("spill-history-list");
  if (!list) return;
  list.innerHTML = "";

  const historyItems = [
    { area: "Entrance", cam: "CAM-6", time: "Cleaned at 9:20 AM" },
    { area: "Rack A Aisle", cam: "CAM-1", time: "Cleaned yesterday" }
  ];

  historyItems.forEach(item => {
    const div = document.createElement("div");
    div.className = "history-item";
    div.innerHTML = `
      <div class="history-left">
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

function selectSpillArea(areaId) {
  document.querySelectorAll(".map-zone").forEach(z => z.classList.remove("selected"));
  const zoneEl = document.getElementById(`map-area-${areaId}`);
  if (zoneEl) zoneEl.classList.add("selected");
}

function openActiveSpillModal() {
  if (!STATE.activeSpill || !STATE.activeSpill.snapshotUrl) return;
  openPhotoModalDirect(STATE.activeSpill.snapshotUrl, `Liquid Spill • Near Rack ${STATE.activeSpill.nearestRack || "C"}`);
}

function openPhotoModalDirect(url, title) {
  const modalImg = document.getElementById("modal-enlarged-img");
  const modalTitle = document.getElementById("modal-area-title");
  const modalBadge = document.getElementById("modal-cam-badge");
  const photoModal = document.getElementById("photo-modal");

  if (modalImg) modalImg.src = url;
  if (modalTitle) modalTitle.textContent = title;
  if (modalBadge) modalBadge.textContent = "CCTV HD CAPTURE";
  if (photoModal) photoModal.classList.remove("hidden");
}

function closePhotoModal() {
  const photoModal = document.getElementById("photo-modal");
  if (photoModal) photoModal.classList.add("hidden");
}

/**
 * Syncs event logs into Recent Activity list of Dashboard
 */
function renderIntegratedActivityFeed() {
  const list = document.getElementById("activity-feed-list");
  if (!list) return;
  list.innerHTML = "";

  const recent = STATE.eventLogs.slice(0, 15);
  if (recent.length === 0) {
    list.innerHTML = `<div style="font-size:11px;color:#94A3B8;padding:8px;">No events recorded yet.</div>`;
    return;
  }

  recent.forEach((item, idx) => {
    const div = document.createElement("div");
    div.className = `activity-item type-${item.type} ${idx === 0 ? "unread" : ""}`;

    let icon = "ℹ️";
    if (item.type === "spill") icon = "💧";
    else if (item.type === "spoil") icon = "🥬";
    else if (item.type === "temp") icon = "⚠️";
    else if (item.type === "cool-off") icon = "✅";

    div.innerHTML = `
      <span class="act-icon">${icon}</span>
      <div class="act-content">
        <div class="act-msg">${escapeHtml(item.message)}</div>
        <div class="act-time">${item.time}</div>
      </div>
      ${item.thumbUrl ? `
        <img src="${item.thumbUrl}" class="act-thumb-img" alt="CCTV Snapshot" title="Click to enlarge" onclick="openPhotoModalDirect('${item.thumbUrl}', 'CCTV Spill Detection')">
      ` : ""}
    `;
    list.appendChild(div);
  });
}

