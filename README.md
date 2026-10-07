# Smart Warehouse Monitoring System

An interactive visual simulation (proof of concept) of a Smart Warehouse Monitoring System designed for non-technical stakeholders. Fully client-side with no backend, frameworks, or build steps required.

## Live Simulation Features
- **Top-Down Warehouse Floor Plan (Inline SVG)**:
  - 4 storage racks (A, B, C, D) holding 24 vegetable cartons across tomatoes, potatoes, onions, spinach, cabbage, and carrots.
  - Wall sensor badge (`WS-01`) displaying real-time temperature and humidity.
  - 3 wall cooling units with animated rotating fan blades and cold airflow waves when active.
  - 4 corner CCTV cameras (CAM-1 to CAM-4) with monitoring cones.
- **Controls & Environment**:
  - Outside Heat slider (−5 to +20) modeling external weather conditions.
  - Live cooling limit adjustment with automatic hysteresis (coolers turn ON above limit, turn OFF at 2°C below limit).
  - Clean live sparkline charts showing temperature trends and dashed threshold lines.
- **Manual Vegetable Spoilage & Liquid Spill (Simulation Mode)**:
  - Vegetable spoilage and spills only happen when manually triggered by the user.
  - Clicking any carton allows spoiling or replacing stock.
  - Spilling liquid triggers nearest camera flash, generates a real-time CCTV snapshot on `<canvas>`, and dispatches an instant photo alert.
- **Interactive Smartphone Mockup (WhatsApp Style)**:
  - Realistic lock screen with notification banners, vibration shake, and Web Audio chimes.
  - WhatsApp chat view with typing indicator simulation, formatted alert messages, and CCTV photo bubbles.
- **Guided Demo**:
  - Scripted scenario walking through temperature rise, automatic cooling activation, and pausing for user interaction on spoilage and spills.

## Tech Stack
- HTML5
- CSS3
- Vanilla JavaScript (ES6+)
- Inline SVG & HTML5 Canvas
- Web Audio API

## Running Locally
Simply open `index.html` in any modern web browser (Google Chrome, Microsoft Edge, Firefox, Safari). No installation or local server required.
