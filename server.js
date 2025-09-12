import express from 'express';
import 'dotenv/config';
import cors from 'cors';

// ENV vars
const BADGE_API_KEY = process.env.BADGE_API_KEY;
const BADGE_TEMPLATE_ID = process.env.BADGE_TEMPLATE_ID;
const PORT = process.env.PORT || 3000; // Changed back to 3000 for Render compatibility

// ======== VENDOR GEOFENCES ========
const LOC = {
  SONOMA:        { lat: 29.817091641171505, lng: -95.4221111615325,  radius: 7 },
  LITTLE_SISTER: { lat: 29.81713966152203,  lng: -95.42093737744574, radius: 7 },
  FAT_CAT:       { lat: 29.81685471204442,  lng: -95.42190629708813, radius: 7 },
  POLISH_BAR:    { lat: 29.816692217268653, lng: -95.42183155692648, radius: 7 },
  THREADFARE:    { lat: 29.816975016979047, lng: -95.4209333541323,  radius: 7 },
  KIDS_CREATE:   { lat: 29.816755283414313, lng: -95.42137848171349, radius: 7 },
  TULUM:         { lat: 29.817021307396466, lng: -95.42145858820318, radius: 7 }
};
const ENFORCE_GEOFENCE = true; // Changed to true

// Default benefit per vendor (match your DEALS)
const DEFAULT_BENEFIT = {
  SONOMA: "PERCENT_10",
  LITTLE_SISTER: "CAFE_PERCENT_10",
  FAT_CAT: "BOGO_SCOOP",
  POLISH_BAR: "DAZZLE_DRY_UPGRADE",
  THREADFARE: "PERCENT_10_1X",
  KIDS_CREATE: "FRIDAY_WORKSHOP",
  TULUM: "PERCENT_10"
};

// Update the DEALS object with detailed descriptions:

const DEALS = {
  SONOMA: {
    key: "SONOMA",
    label: "Sonoma",
    description: "Wine bar and bottle shop specializing in natural wines",
    benefits: {
      PERCENT_10: {
        label: "10% Off Purchase",
        description: "Get 10% off your total purchase (excludes bottle purchases)",
        maxPerMonth: 1,
        passFieldRemaining: "sonoma_remaining",
        conditions: { excludeBottlePurchases: true }
      }
    }
  },
  LITTLE_SISTER: {
    key: "LITTLE_SISTER",
    label: "Little Sister",
    description: "Coffee shop and café with specialty drinks and light bites",
    benefits: {
      CAFE_PERCENT_10: {
        label: "10% Off Café Items",
        description: "Get 10% off all café items including coffee, pastries, and light meals",
        maxPerMonth: 1,
        passFieldRemaining: "littlesister_remaining",
        conditions: { purchaseScope: "CAFE" }
      }
    }
  },
  FAT_CAT: {
    key: "FAT_CAT",
    label: "Fat Cat Creamery",
    description: "Artisanal ice cream shop with unique flavors",
    benefits: {
      BOGO_SCOOP: {
        label: "Buy 1 Get 1 Scoop",
        description: "Buy one scoop and get a second scoop free (requires at least one paid scoop)",
        maxPerMonth: 1,
        passFieldRemaining: "fatcat_remaining",
        conditions: { requiresPaidItem: "scoop" }
      }
    }
  },
  POLISH_BAR: {
    key: "POLISH_BAR",
    label: "Polish Bar",
    description: "Full-service nail salon with manicures and pedicures",
    benefits: {
      DAZZLE_DRY_UPGRADE: {
        label: "Free Dazzle Dry Upgrade",
        description: "Get a complimentary Dazzle Dry upgrade with any manicure service",
        maxPerMonth: 1,
        passFieldRemaining: "polishbar_remaining"
      }
    }
  },
  THREADFARE: {
    key: "THREADFARE",
    label: "Threadfare",
    description: "Boutique clothing store featuring curated fashion and accessories",
    benefits: {
      PERCENT_10_1X: {
        label: "10% Off Purchase",
        description: "Get 10% off your entire purchase (one-time use per month)",
        maxPerMonth: 1,
        passFieldRemaining: "threadfare_remaining"
      }
    }
  },
  KIDS_CREATE: {
    key: "KIDS_CREATE",
    label: "Kids Create",
    description: "Creative studio offering art classes and retail supplies for children",
    benefits: {
      FRIDAY_WORKSHOP: {
        label: "Free Friday Workshop",
        description: "Join a complimentary Friday art workshop for kids (ages 3-12, Fridays only)",
        maxPerMonth: 1,
        passFieldRemaining: "kidscreate_workshop_remaining",
        conditions: { weekday: 5 }  // 5 = Friday
      },
      RETAIL_15_1X: {
        label: "15% Off Art Supplies",
        description: "Get 15% off all retail art supplies and craft materials",
        maxPerMonth: 1,
        passFieldRemaining: "kidscreate_retail_remaining"
      }
    }
  },
  TULUM: {
    key: "TULUM",
    label: "Tulum Spa",
    description: "Wellness spa offering massages, facials, and beauty treatments",
    benefits: {
      PERCENT_10: {
        label: "10% Off Services & Retail",
        description: "Get 10% off all spa services and retail beauty products",
        maxPerMonth: 1,
        passFieldRemaining: "tulum_remaining"
      }
    }
  }
};

function haversineMeters(aLat,aLng,bLat,bLng){
  const R=6371000, toRad=x=>x*Math.PI/180;
  const dLat=toRad(bLat-aLat), dLng=toRad(bLng-aLng);
  const s1=Math.sin(dLat/2), s2=Math.sin(dLng/2);
  const a=s1*s1 + Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*s2*s2;
  return 2*R*Math.asin(Math.sqrt(a));
}

function withinFence(geo, center){
  const acc = Number(geo?.accuracy ?? 0); // be conservative
  const d = haversineMeters(geo.lat, geo.lng, center.lat, center.lng);
  return (d - acc) <= center.radius;
}

const app = express();
app.use(express.json());
app.use(cors({
  origin: '*',  // Allow all origins during testing
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Add logging middleware
app.use((req, res, next) => {
  console.log('Request URL:', req.url);
  console.log('Request body:', req.body);
  next();
});

// Test badge endpoint
app.post("/issue-test-badge", async (req, res) => {
  if (!BADGE_TEMPLATE_ID || !BADGE_API_KEY) {
    return res.status(400).json({ 
      ok: false, 
      error: "Missing Badge API configuration" 
    });
  }

  const testPayload = {
    passTemplateId: BADGE_TEMPLATE_ID,
    user: {
      id: "user_demo",
      attributes: {
        name: "Demo User",
        email: "demo@example.com",
        memberId: "P-001",
        holder_name: "Demo User",
        display_name: "Demo User",
        pass_id: "P-001"  // Added for display
      }
    },
    pass: {
      id: "P-001",
      attributes: {
        holder_name: "Demo User",
        display_name: "Demo User",
        pass_id: "P-001",  // Added for display
        member_id: "P-001", // Added for display
        sonoma_remaining: "1",
        littlesister_remaining: "1",
        fatcat_remaining: "1",
        polishbar_remaining: "1",
        threadfare_remaining: "1",
        kidscreate_workshop_remaining: "1",
        kidscreate_retail_remaining: "1",
        tulum_remaining: "1"
      }
    }
  };

  try {
    console.log('Sending payload:', JSON.stringify(testPayload, null, 2)); // Debug log

    const response = await fetch("https://api.trybadge.com/v0/rpc/userPassUpsert", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${BADGE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(testPayload)
    });

    const data = await response.json();
    res.json({ ok: response.ok, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Issue badge endpoint
app.post("/issue-badge", async (req, res) => {
  if (!BADGE_TEMPLATE_ID || !BADGE_API_KEY) {
    return res.status(400).json({ 
      ok: false, 
      error: "Missing Badge API configuration" 
    });
  }

  const { name, email, memberId } = req.body;

  if (!name || !email || !memberId) {
    return res.status(400).json({
      ok: false,
      error: "Missing required fields: name, email, memberId"
    });
  }

  const payload = {
    passTemplateId: BADGE_TEMPLATE_ID,
    user: {
      id: `user_${memberId}`,
      attributes: {
        name: name,
        email: email,
        memberId: memberId,
        holder_name: name,
        display_name: name,
        pass_id: memberId  // Added for display
      }
    },
    pass: {
      id: memberId,
      attributes: {
        holder_name: name,
        display_name: name,
        pass_id: memberId,  // Added for display
        member_id: memberId, // Added for display
        sonoma_remaining: "1",
        littlesister_remaining: "1",
        fatcat_remaining: "1",
        polishbar_remaining: "1",
        threadfare_remaining: "1",
        kidscreate_workshop_remaining: "1",
        kidscreate_retail_remaining: "1",
        tulum_remaining: "1"
      }
    }
  };

  try {
    const response = await fetch("https://api.trybadge.com/v0/rpc/userPassUpsert", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${BADGE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    res.json({ ok: response.ok, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Redeem benefit endpoint
app.post("/redeem/:vendorKey/:benefitKey", async (req, res) => {
  const { vendorKey, benefitKey } = req.params;
  const { passId, geo } = req.body || {};

  // Validate required fields
  if (!passId) {
    return res.status(400).json({ ok: false, reason: "MISSING_PASS_ID" });
  }

  // Geofence check
  const loc = LOC[vendorKey];
  if (loc) {
    if (!geo) {
      if (ENFORCE_GEOFENCE) return res.json({ ok: false, reason: "GEO_REQUIRED" });
    } else if (!withinFence(geo, loc)) {
      if (ENFORCE_GEOFENCE) return res.json({ ok: false, reason: "OUT_OF_GEOFENCE" });
    }
  }

  // Return updated balances after redemption
  const balances = {
    sonoma_remaining: vendorKey === "SONOMA" ? "0" : "1",
    littlesister_remaining: vendorKey === "LITTLE_SISTER" ? "0" : "1",
    fatcat_remaining: vendorKey === "FAT_CAT" ? "0" : "1",
    polishbar_remaining: vendorKey === "POLISH_BAR" ? "0" : "1",
    threadfare_remaining: vendorKey === "THREADFARE" ? "0" : "1",
    kidscreate_workshop_remaining: vendorKey === "KIDS_CREATE" && benefitKey === "FRIDAY_WORKSHOP" ? "0" : "1",
    kidscreate_retail_remaining: vendorKey === "KIDS_CREATE" && benefitKey === "RETAIL_15_1X" ? "0" : "1",
    tulum_remaining: vendorKey === "TULUM" ? "0" : "1"
  };

  res.json({
    ok: true,
    vendorKey,
    benefitKey,
    passId,
    geoValidated: !!loc && !!geo && withinFence(geo, loc),
    balances
  });
});

async function getGeo() {
  // Returns a Promise that resolves to location data
  return await new Promise(resolve => {
    // Uses browser's geolocation API
    navigator.geolocation.getCurrentPosition(
      // Success callback
      p => resolve({ 
        lat: p.coords.latitude, 
        lng: p.coords.longitude, 
        accuracy: p.coords.accuracy 
      }),
      // Error callback - returns null if location access denied
      _ => resolve(null),
      // Options for getting location
      { 
        enableHighAccuracy: true,  // Use GPS if available
        timeout: 8000,            // Wait up to 8 seconds
        maximumAge: 0            // Don't use cached location
      }
    );
  });
}

// Test endpoint to view pass with a specific PID
app.get("/test-pass", (req, res) => {
  const testPid = "P-001";
  res.redirect(`/s?pid=${testPid}`);
});

// Add this before app.listen()
app.get("/pid", (_req, res) => {
  const testPid = "P-001";
  res.json({ 
    ok: true, 
    pid: testPid,
    now: Date.now(),
    remaining: {
      sonoma_remaining: "1",
      littlesister_remaining: "1",
      fatcat_remaining: "1",
      polishbar_remaining: "1",
      threadfare_remaining: "1",
      kidscreate_workshop_remaining: "1",
      kidscreate_retail_remaining: "1"
    }
  });
});

// Add before app.listen()
app.get("/health", (_req, res) => {
  res.json({ 
    status: "ok",
    url: "https://flowe-collective.onrender.com",
    timestamp: new Date().toISOString(),
    env: {
      hasApiKey: !!BADGE_API_KEY,
      hasTemplateId: !!BADGE_TEMPLATE_ID
    }
  });
});

// Add debug logging middleware (must be before routes)
// app.use((req, res, next) => {
//   console.log('Request URL:', req.url);
//   console.log('Query params:', req.query);
//   next();
// });

// Add debug endpoint (before /s)
app.get("/debug-pid", (req, res) => {
  res.json({ 
    receivedPid: req.query.pid,
    decodedPid: decodeURIComponent(req.query.pid || ''),
    url: req.url,
    fullUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
    query: req.query,
    headers: req.headers
  });
});

// Scan Landing Page: Camera opens this from QR like /s?pid=P-001
app.get("/s", (req, res) => {
  res.type("html").send(`<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Collective Pass — Redeem</title>
<style>
  :root {
    --primary: #2d2d2a;
    --secondary: #847577;
    --success: #0a7b25;
    --error: #b00020;
    --warning: #f59e0b;
    --bg: #fafafa;
    --card-bg: #ffffff;
    --border: #e5e7eb;
    --text: #111827;
    --text-muted: #6b7280;
    --radius: 16px;
    --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  }

  * { box-sizing: border-box; }
  
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    margin: 0;
    padding: 20px;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
  }

  .container {
    max-width: 480px;
    margin: 0 auto;
  }

  .header {
    text-align: center;
    margin-bottom: 32px;
  }

  .header h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    color: var(--primary);
  }

  .header p {
    margin: 8px 0 0;
    color: var(--text-muted);
    font-size: 16px;
  }

  .card {
    background: var(--card-bg);
    border-radius: var(--radius);
    padding: 24px;
    margin-bottom: 20px;
    box-shadow: var(--shadow);
    border: 1px solid var(--border);
  }

  .pass-info {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 12px;
    color: white;
    margin-bottom: 24px;
  }

  .pass-icon {
    width: 48px;
    height: 48px;
    background: rgba(255,255,255,0.2);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
  }

  .shop-grid {
    display: grid;
    gap: 12px;
  }

  .shop-card {
    padding: 20px;
    border: 2px solid var(--border);
    border-radius: 12px;
    background: var(--card-bg);
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .shop-card:hover {
    border-color: var(--primary);
    transform: translateY(-2px);
    box-shadow: var(--shadow);
  }

  .shop-card.detected {
    border-color: var(--success);
    background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  }

  .shop-card.detected::before {
    content: "📍 ";
    color: var(--success);
    font-weight: bold;
  }

  .shop-name {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 4px;
    color: var(--primary);
  }

  .shop-description {
    font-size: 14px;
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  .shop-benefit {
    font-size: 15px;
    font-weight: 500;
    color: var(--success);
    margin-bottom: 4px;
  }

  .shop-benefit-desc {
    font-size: 13px;
    color: var(--text-muted);
  }

  .controls {
    text-align: center;
  }

  .kids-options {
    display: grid;
    gap: 12px;
    margin-bottom: 20px;
  }

  .option-card {
    padding: 16px;
    border: 2px solid var(--border);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    background: var(--card-bg);
  }

  .option-card:hover {
    border-color: var(--primary);
  }

  .option-card.selected {
    border-color: var(--success);
    background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  }

  .option-title {
    font-weight: 600;
    color: var(--primary);
    margin-bottom: 4px;
  }

  .option-desc {
    font-size: 14px;
    color: var(--text-muted);
  }

  .redeem-btn {
    width: 100%;
    padding: 16px 24px;
    background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 18px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-top: 16px;
  }

  .redeem-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(45, 45, 42, 0.3);
  }

  .redeem-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .result {
    text-align: center;
    padding: 24px;
    border-radius: 12px;
    margin-top: 20px;
  }

  .result.success {
    background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
    border: 2px solid var(--success);
  }

  .result.error {
    background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
    border: 2px solid var(--error);
  }

  .result-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .result-title {
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 8px;
  }

  .result.success .result-title { color: var(--success); }
  .result.error .result-title { color: var(--error); }

  .status-indicator {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 500;
  }

  .status-loading {
    background: #fef3c7;
    color: #92400e;
  }

  .status-success {
    background: #d1fae5;
    color: var(--success);
  }

  .location-hint {
    text-align: center;
    padding: 12px;
    background: #f3f4f6;
    border-radius: 8px;
    font-size: 14px;
    color: var(--text-muted);
    margin-bottom: 20px;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .loading { animation: pulse 2s infinite; }
</style>

<div class="container">
  <div class="header">
    <h1>🎫 Collective Pass</h1>
    <p>Choose your shop to redeem benefits</p>
  </div>

  <div class="pass-info" id="passInfo">
    <div class="pass-icon">🎯</div>
    <div>
      <div style="font-weight: 600; font-size: 16px;">Pass ID</div>
      <div id="passId" class="loading">Loading...</div>
    </div>
  </div>

  <div id="locationStatus" class="location-hint" style="display: none;">
    <span class="status-indicator status-loading">
      📍 Getting your location...
    </span>
  </div>

  <div class="card">
    <div id="shopSelection" class="shop-grid">
      <!-- Shops will be populated here -->
    </div>
  </div>

  <div id="controls" class="card" style="display: none;">
    <!-- Controls will be populated here -->
  </div>

  <div id="result" style="display: none;">
    <!-- Results will be shown here -->
  </div>
</div>

<script>
// ---- Config injected from server ----
const LOC = ` + JSON.stringify(LOC) + `;
const DEFAULT_BENEFIT = ` + JSON.stringify(DEFAULT_BENEFIT) + `;
const DEALS = ` + JSON.stringify(DEALS) + `;

// ---- Utils ----
const q = new URL(location.href).searchParams;
const PID = decodeURIComponent((q.get('pid') || '').trim());
let selectedVendor = null;
let selectedKidsBenefit = 'FRIDAY_WORKSHOP';
let userLocation = null;

function distMeters(aLat,aLng,bLat,bLng){
  const R=6371000, toRad=x=>x*Math.PI/180;
  const dLat=toRad(bLat-aLat), dLng=toRad(bLng-aLng);
  const s1=Math.sin(dLat/2), s2=Math.sin(dLng/2);
  const a=s1*s1 + Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*s2*s2;
  return 2*R*Math.asin(Math.sqrt(a));
}

async function getGeo(){
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy}),
      () => resolve(null),
      {enableHighAccuracy: true, timeout: 8000, maximumAge: 30000}
    );
  });
}

function findNearestShop(lat, lng) {
  let nearest = null;
  let minDistance = Infinity;
  
  for (const [key, loc] of Object.entries(LOC)) {
    const distance = distMeters(lat, lng, loc.lat, loc.lng);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = { key, distance, withinRadius: distance <= loc.radius };
    }
  }
  
  return nearest;
}

function renderShops() {
  const container = document.getElementById('shopSelection');
  let html = '';
  
  for (const [key, deal] of Object.entries(DEALS)) {
    const benefit = deal.benefits[DEFAULT_BENEFIT[key]];
    const isDetected = userLocation && findNearestShop(userLocation.lat, userLocation.lng)?.key === key;
    
    html += \`
      <div class="shop-card \${isDetected ? 'detected' : ''}" onclick="selectShop('\${key}')">
        <div class="shop-name">\${deal.label}</div>
        <div class="shop-description">\${deal.description}</div>
        <div class="shop-benefit">\${benefit.label}</div>
        <div class="shop-benefit-desc">\${benefit.description}</div>
      </div>
    \`;
  }
  
  container.innerHTML = html;
}

function selectShop(vendorKey) {
  selectedVendor = vendorKey;
  const deal = DEALS[vendorKey];
  
  document.getElementById('controls').style.display = 'block';
  
  if (vendorKey === 'KIDS_CREATE') {
    renderKidsCreateControls();
  } else {
    renderStandardControls(vendorKey);
  }
  
  // Scroll to controls
  document.getElementById('controls').scrollIntoView({ behavior: 'smooth' });
}

function renderKidsCreateControls() {
  const workshopBenefit = DEALS.KIDS_CREATE.benefits.FRIDAY_WORKSHOP;
  const retailBenefit = DEALS.KIDS_CREATE.benefits.RETAIL_15_1X;
  
  document.getElementById('controls').innerHTML = \`
    <h3 style="margin-top: 0; text-align: center; color: var(--primary);">Kids Create Options</h3>
    <div class="kids-options">
      <div class="option-card \${selectedKidsBenefit === 'FRIDAY_WORKSHOP' ? 'selected' : ''}" 
           onclick="selectKidsBenefit('FRIDAY_WORKSHOP')">
        <div class="option-title">\${workshopBenefit.label}</div>
        <div class="option-desc">\${workshopBenefit.description}</div>
      </div>
      <div class="option-card \${selectedKidsBenefit === 'RETAIL_15_1X' ? 'selected' : ''}" 
           onclick="selectKidsBenefit('RETAIL_15_1X')">
        <div class="option-title">\${retailBenefit.label}</div>
        <div class="option-desc">\${retailBenefit.description}</div>
      </div>
    </div>
    <div class="controls">
      <button class="redeem-btn" onclick="redeem()">
        Redeem \${selectedKidsBenefit === 'FRIDAY_WORKSHOP' ? workshopBenefit.label : retailBenefit.label}
      </button>
    </div>
  \`;
}

function renderStandardControls(vendorKey) {
  const deal = DEALS[vendorKey];
  const benefit = deal.benefits[DEFAULT_BENEFIT[vendorKey]];
  
  let extraControls = '';
  
  if (vendorKey === 'SONOMA') {
    extraControls = \`
      <div style="margin-bottom: 16px;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="checkbox" id="hasBottle" style="width: 18px; height: 18px;">
          <span>Purchase includes bottle(s)</span>
        </label>
      </div>
    \`;
  } else if (vendorKey === 'FAT_CAT') {
    extraControls = \`
      <div style="margin-bottom: 16px;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="checkbox" id="paidScoop" checked style="width: 18px; height: 18px;">
          <span>Order includes paid scoop</span>
        </label>
      </div>
    \`;
  }
  
  document.getElementById('controls').innerHTML = \`
    <h3 style="margin-top: 0; text-align: center; color: var(--primary);">\${deal.label}</h3>
    <div style="text-align: center; margin-bottom: 20px;">
      <div class="shop-benefit">\${benefit.label}</div>
      <div class="shop-benefit-desc">\${benefit.description}</div>
    </div>
    \${extraControls}
    <div class="controls">
      <button class="redeem-btn" onclick="redeem()">
        Redeem \${benefit.label}
      </button>
    </div>
  \`;
}

function selectKidsBenefit(benefitType) {
  selectedKidsBenefit = benefitType;
  renderKidsCreateControls();
}

async function redeem() {
  if (!selectedVendor) return;
  
  const benefitKey = selectedVendor === 'KIDS_CREATE' ? selectedKidsBenefit : DEFAULT_BENEFIT[selectedVendor];
  const body = { passId: PID };
  
  // Add vendor-specific data (but not geo for validation)
  if (selectedVendor === 'SONOMA') {
    body.cart = { hasBottle: document.getElementById('hasBottle')?.checked || false };
  }
  if (selectedVendor === 'FAT_CAT') {
    body.cart = { paidItems: { scoop: document.getElementById('paidScoop')?.checked ? 1 : 0 } };
  }
  if (selectedVendor === 'LITTLE_SISTER') {
    body.context = { purchaseScope: 'CAFE' };
  }

  // Show loading
  const resultDiv = document.getElementById('result');
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = \`
    <div class="result">
      <div class="result-icon">⏳</div>
      <div class="result-title">Processing...</div>
      <div>Please wait while we process your redemption</div>
    </div>
  \`;

  // Disable button
  const btn = document.querySelector('.redeem-btn');
  btn.disabled = true;
  btn.textContent = 'Processing...';

  try {
    const response = await fetch(\`/redeem/\${selectedVendor}/\${benefitKey}\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    const result = await response.json();
    
    if (result.ok) {
      const benefit = DEALS[selectedVendor].benefits[benefitKey];
      const remaining = result.balances[benefit.passFieldRemaining];
      
      resultDiv.innerHTML = \`
        <div class="result success">
          <div class="result-icon">✅</div>
          <div class="result-title">Approved!</div>
          <div style="margin-bottom: 16px;">
            <strong>\${DEALS[selectedVendor].label}</strong><br>
            <span style="color: var(--text-muted);">\${benefit.label}</span>
          </div>
          <div style="background: rgba(255,255,255,0.7); padding: 12px; border-radius: 8px;">
            <div style="color: var(--text-muted); font-size: 14px;">Remaining this month:</div>
            <div style="font-size: 18px; font-weight: 600; color: var(--success);">
              \${remaining === "0" ? "⚠️ No more visits" : "✨ " + remaining + " visit left"}
            </div>
          </div>
        </div>
      \`;
    } else {
      resultDiv.innerHTML = \`
        <div class="result error">
          <div class="result-icon">❌</div>
          <div class="result-title">Denied</div>
          <div>\${result.reason || 'Unable to process redemption'}</div>
        </div>
      \`;
    }
  } catch (error) {
    resultDiv.innerHTML = \`
      <div class="result error">
        <div class="result-icon">⚠️</div>
        <div class="result-title">Error</div>
        <div>\${error.message}</div>
      </div>
    \`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Redeem Again';
    resultDiv.scrollIntoView({ behavior: 'smooth' });
  }
}

// Initialize
(async function init() {
  // Show pass ID
  document.getElementById('passId').textContent = PID || 'Invalid';
  
  if (!PID) {
    document.getElementById('result').style.display = 'block';
    document.getElementById('result').innerHTML = \`
      <div class="result error">
        <div class="result-icon">⚠️</div>
        <div class="result-title">Invalid Pass</div>
        <div>No pass ID found in URL</div>
      </div>
    \`;
    return;
  }

  // Try to get location
  if (navigator.geolocation) {
    document.getElementById('locationStatus').style.display = 'block';
    
    try {
      userLocation = await getGeo();
      if (userLocation) {
        const nearest = findNearestShop(userLocation.lat, userLocation.lng);
        if (nearest && nearest.withinRadius) {
          document.getElementById('locationStatus').innerHTML = \`
            <span class="status-indicator status-success">
              📍 You're near \${DEALS[nearest.key].label}
            </span>
          \`;
        } else {
          document.getElementById('locationStatus').style.display = 'none';
        }
      } else {
        document.getElementById('locationStatus').style.display = 'none';
      }
    } catch (error) {
      document.getElementById('locationStatus').style.display = 'none';
    }
  }

  // Render shops
  renderShops();
})();
</script>`);
});

// Replace the /issue endpoint with this modern, styled version:

app.get("/issue", (req, res) => {
  res.type("html").send(`<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Issue Collective Pass</title>
<style>
  :root {
    --primary: #2d2d2a;
    --secondary: #847577;
    --success: #0a7b25;
    --error: #b00020;
    --warning: #f59e0b;
    --bg: #fafafa;
    --card-bg: #ffffff;
    --border: #e5e7eb;
    --text: #111827;
    --text-muted: #6b7280;
    --radius: 16px;
    --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  }

  * { box-sizing: border-box; }
  
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    margin: 0;
    padding: 20px;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
  }

  .container {
    max-width: 480px;
    margin: 0 auto;
  }

  .header {
    text-align: center;
    margin-bottom: 32px;
  }

  .header h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    color: var(--primary);
  }

  .header p {
    margin: 8px 0 0;
    color: var(--text-muted);
    font-size: 16px;
  }

  .card {
    background: var(--card-bg);
    border-radius: var(--radius);
    padding: 24px;
    margin-bottom: 20px;
    box-shadow: var(--shadow);
    border: 1px solid var(--border);
  }

  .form-group {
    margin-bottom: 24px;
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  label {
    display: block;
    font-weight: 600;
    color: var(--primary);
    margin-bottom: 8px;
    font-size: 16px;
  }

  input {
    width: 100%;
    padding: 16px;
    border: 2px solid var(--border);
    border-radius: 12px;
    font-size: 16px;
    transition: all 0.2s ease;
    background: var(--card-bg);
  }

  input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(45, 45, 42, 0.1);
  }

  input:read-only {
    background: #f9fafb;
    color: var(--text-muted);
  }

  .input-group {
    display: flex;
    gap: 12px;
    align-items: stretch;
  }

  .input-group input {
    flex: 1;
  }

  .generate-btn {
    padding: 16px 20px;
    background: linear-gradient(135deg, var(--secondary) 0%, #a855f7 100%);
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .generate-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(134, 87, 119, 0.3);
  }

  .create-btn {
    width: 100%;
    padding: 18px 24px;
    background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 18px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-top: 16px;
  }

  .create-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(45, 45, 42, 0.3);
  }

  .create-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .result {
    text-align: center;
    padding: 24px;
    border-radius: 12px;
    margin-top: 20px;
  }

  .result.success {
    background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
    border: 2px solid var(--success);
  }

  .result.error {
    background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
    border: 2px solid var(--error);
  }

  .result-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .result-title {
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 8px;
  }

  .result.success .result-title { color: var(--success); }
  .result.error .result-title { color: var(--error); }

  .result-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
    margin-top: 16px;
  }

  .action-btn {
    padding: 12px 20px;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 500;
    transition: all 0.2s ease;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .action-btn.primary {
    background: var(--primary);
    color: white;
  }

  .action-btn.secondary {
    background: var(--card-bg);
    color: var(--primary);
    border: 2px solid var(--border);
  }

  .action-btn:hover {
    transform: translateY(-2px);
  }

  .member-id-display {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
    padding: 16px;
    border-radius: 12px;
    margin-bottom: 24px;
    text-align: center;
  }

  .member-id-label {
    font-size: 14px;
    opacity: 0.9;
    margin-bottom: 4px;
  }

  .member-id-value {
    font-size: 18px;
    font-weight: 700;
    font-family: monospace;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .loading { animation: pulse 2s infinite; }

  .info-card {
    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
    border: 1px solid #3b82f6;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 24px;
  }

  .info-card h3 {
    margin: 0 0 8px 0;
    color: #1e40af;
    font-size: 16px;
  }

  .info-card p {
    margin: 0;
    color: #1e40af;
    font-size: 14px;
  }
</style>

<div class="container">
  <div class="header">
    <h1>🎫 Issue Collective Pass</h1>
    <p>Create a new membership pass with exclusive benefits</p>
  </div>

  <div class="info-card">
    <h3>✨ Pass Benefits Include:</h3>
    <p>10% off at Sonoma & Threadfare • BOGO scoops at Fat Cat • Free Friday workshops at Kids Create • Dazzle Dry upgrades at Polish Bar • 10% off at Little Sister café & Tulum Spa</p>
  </div>

  <div class="card">
    <div class="form-group">
      <label for="name">Full Name</label>
      <input type="text" id="name" placeholder="Enter member's full name" autocomplete="name">
    </div>

    <div class="form-group">
      <label for="email">Email Address</label>
      <input type="email" id="email" placeholder="Enter member's email" autocomplete="email">
    </div>

    <div class="form-group">
      <label for="memberId">Member ID</label>
      <div class="input-group">
        <input type="text" id="memberId" readonly placeholder="Auto-generated">
        <button type="button" class="generate-btn" onclick="generateId()">🎲 Generate</button>
      </div>
    </div>

    <button type="button" class="create-btn" onclick="issueBadge()">
      Create Pass
    </button>
  </div>

  <div id="result" style="display: none;">
    <!-- Results will be shown here -->
  </div>
</div>

<script>
let lastNum = parseInt(localStorage.getItem('lastMemberId') || '0');

function padNumber(n) {
  return ('0000' + n).slice(-4);
}

function generateId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = ('0' + (now.getMonth() + 1)).slice(-2);
  const day = ('0' + now.getDate()).slice(-2);
  
  lastNum++;
  localStorage.setItem('lastMemberId', lastNum);
  
  const id = year + month + day + '_FC' + padNumber(lastNum);
  document.getElementById('memberId').value = id;
  return id;
}

// Auto-generate ID on page load
document.addEventListener('DOMContentLoaded', generateId);

async function issueBadge() {
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const memberId = document.getElementById('memberId').value.trim();
  const resultEl = document.getElementById('result');
  const btn = document.querySelector('.create-btn');

  // Validation
  if (!name || !email || !memberId) {
    resultEl.style.display = 'block';
    resultEl.innerHTML = \`
      <div class="result error">
        <div class="result-icon">⚠️</div>
        <div class="result-title">Missing Information</div>
        <div>Please fill in all fields to create the pass</div>
      </div>
    \`;
    return;
  }

  // Email validation
  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  if (!emailRegex.test(email)) {
    resultEl.style.display = 'block';
    resultEl.innerHTML = \`
      <div class="result error">
        <div class="result-icon">📧</div>
        <div class="result-title">Invalid Email</div>
        <div>Please enter a valid email address</div>
      </div>
    \`;
    return;
  }

  // Show loading state
  btn.disabled = true;
  btn.textContent = 'Creating Pass...';
  resultEl.style.display = 'block';
  resultEl.innerHTML = \`
    <div class="result">
      <div class="result-icon">⏳</div>
      <div class="result-title">Creating Your Pass</div>
      <div>Please wait while we generate your Collective Pass...</div>
    </div>
  \`;

  try {
    const response = await fetch('/issue-badge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, memberId })
    });

    const result = await response.json();

    if (result.ok && result.data?.pass?.downloadUrl) {
      const downloadUrl = result.data.pass.downloadUrl;
      
      resultEl.innerHTML = \`
        <div class="result success">
          <div class="result-icon">✅</div>
          <div class="result-title">Pass Created Successfully!</div>
          <div style="margin-bottom: 16px;">
            Your Collective Pass has been created and is ready to use.
          </div>
          <div class="member-id-display">
            <div class="member-id-label">Member ID</div>
            <div class="member-id-value">\${memberId}</div>
          </div>
          <div class="result-actions">
            <a href="\${downloadUrl}" target="_blank" class="action-btn primary">
              📱 Download Pass
            </a>
            <a href="/s?pid=\${encodeURIComponent(memberId)}" class="action-btn secondary">
              🎯 View Redemption Page
            </a>
          </div>
          <div style="margin-top: 16px; color: var(--text-muted); font-size: 14px;">
            Pass will download automatically in 2 seconds...
          </div>
        </div>
      \`;

      // Auto-download after 2 seconds
      setTimeout(() => {
        window.location.href = downloadUrl;
      }, 2000);

    } else {
      resultEl.innerHTML = \`
        <div class="result error">
          <div class="result-icon">❌</div>
          <div class="result-title">Creation Failed</div>
          <div>\${result.error || 'Unable to create pass. Please try again.'}</div>
          <div class="result-actions">
            <button class="action-btn secondary" onclick="location.reload()">
              🔄 Try Again
            </button>
          </div>
        </div>
      \`;
    }
  } catch (error) {
    resultEl.innerHTML = \`
      <div class="result error">
        <div class="result-icon">⚠️</div>
        <div class="result-title">Connection Error</div>
        <div>Unable to connect to the server. Please check your internet connection and try again.</div>
        <div class="result-actions">
          <button class="action-btn secondary" onclick="location.reload()">
            🔄 Try Again
          </button>
        </div>
      </div>
    \`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Pass';
    resultEl.scrollIntoView({ behavior: 'smooth' });
  }
}
</script>`);
});

// Add before app.listen()

app.get("/", (req, res) => {
  res.redirect("/issue");
});

app.get("/redeem-test", (req, res) => {
  res.type("html").send(`<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Test Redemption</title>

<h2>Test Redemption</h2>
<div>
  <div>
    <label>Pass ID:</label><br>
    <input type="text" id="passId" value="P-001">
  </div>
  <br>
  <div>
    <label>Vendor:</label><br>
    <select id="vendorKey">
      <option value="SONOMA">Sonoma</option>
      <option value="LITTLE_SISTER">Little Sister</option>
      <option value="FAT_CAT">Fat Cat</option>
      <option value="POLISH_BAR">Polish Bar</option>
      <option value="THREADFARE">Threadfare</option>
      <option value="KIDS_CREATE">Kids Create</option>
      <option value="TULUM">Tulum</option>
    </select>
  </div>
  <br>
  <div>
    <label>Skip Geofencing:</label><br>
    <input type="checkbox" id="skipGeo" checked>
  </div>
  <br>
  <button onclick="testRedeem()">Test Redeem</button>
  <pre id="result"></pre>
</div>

<script>
async function testRedeem() {
  const passId = document.getElementById('passId').value;
  const vendorKey = document.getElementById('vendorKey').value;
  const skipGeo = document.getElementById('skipGeo').checked;
  const benefitKey = {
    SONOMA: "PERCENT_10",
    LITTLE_SISTER: "CAFE_PERCENT_10",
    FAT_CAT: "BOGO_SCOOP",
    POLISH_BAR: "DAZZLE_DRY_UPGRADE",
    THREADFARE: "PERCENT_10_1X",
    KIDS_CREATE: "FRIDAY_WORKSHOP",
    TULUM: "PERCENT_10"
  }[vendorKey];
  
  try {
    const response = await fetch('/redeem/' + vendorKey + '/' + benefitKey + (skipGeo ? '?skipGeo=true' : ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        passId,
        geo: { lat: 29.817091, lng: -95.422111, accuracy: 5 }
      })
    });
    
    const result = await response.json();
    document.getElementById('result').textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    document.getElementById('result').textContent = 'Error: ' + error.message;
  }
}
</script>`);
});

// Add this new endpoint before app.listen()

app.get("/test", (req, res) => {
  res.type("html").send(`<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Test Redemption</title>
<style>
  body { font-family: system-ui; max-width: 600px; margin: 20px auto; padding: 0 20px; }
  .form-group { margin: 15px 0; }
  label { display: block; margin-bottom: 5px; }
  input, select { width: 100%; padding: 8px; margin-bottom: 10px; }
  button { padding: 10px 20px; background: #000; color: #fff; border: none; border-radius: 5px; margin: 5px 0; }
  #result { margin-top: 20px; padding: 10px; background: #f5f5f5; border-radius: 5px; }
  .kids-create-options { margin: 10px 0; padding: 10px; background: #f0f0f0; border-radius: 5px; }
</style>

<h2>Test Redemption</h2>
<div class="form-group">
  <label>Pass ID:</label>
  <input type="text" id="passId" value="P-001">
</div>

<div class="form-group">
  <label>Vendor:</label>
  <select id="vendorKey" onchange="handleVendorChange()">
    <option value="SONOMA">Sonoma - Wine bar (10% off purchase)</option>
    <option value="LITTLE_SISTER">Little Sister - Coffee shop (10% off café)</option>
    <option value="FAT_CAT">Fat Cat - Ice cream (Buy 1 Get 1 scoop)</option>
    <option value="POLISH_BAR">Polish Bar - Nail salon (Free Dazzle Dry upgrade)</option>
    <option value="THREADFARE">Threadfare - Boutique (10% off purchase)</option>
    <option value="KIDS_CREATE">Kids Create - Art studio (Workshop or 15% off supplies)</option>
    <option value="TULUM">Tulum - Spa (10% off services & retail)</option>
  </select>
</div>

<div id="kidsCreateOptions" class="kids-create-options" style="display:none">
  <label>Kids Create Benefit:</label>
  <div>
    <label>
      <input type="radio" name="kidsBenefit" value="FRIDAY_WORKSHOP" checked> 
      <strong>Free Friday Workshop</strong><br>
      <small>Complimentary Friday art workshop for kids (ages 3-12, Fridays only)</small>
    </label>
  </div>
  <div>
    <label>
      <input type="radio" name="kidsBenefit" value="RETAIL_15_1X"> 
      <strong>15% Off Art Supplies</strong><br>
      <small>Get 15% off all retail art supplies and craft materials</small>
    </label>
  </div>
</div>

<div class="form-group">
  <label>
    <input type="checkbox" id="skipGeo" checked>
    Skip Geofencing
  </label>
</div>

<button onclick="testRedeem()">Test Redeem</button>
<pre id="result"></pre>

<script>
function handleVendorChange() {
  const vendorKey = document.getElementById('vendorKey').value;
  const kidsOptions = document.getElementById('kidsCreateOptions');
  
  if (vendorKey === 'KIDS_CREATE') {
    kidsOptions.style.display = 'block';
  } else {
    kidsOptions.style.display = 'none';
  }
}

async function testRedeem() {
  const passId = document.getElementById('passId').value;
  const vendorKey = document.getElementById('vendorKey').value;
  const skipGeo = document.getElementById('skipGeo').checked;
  
  let benefitKey;
  
  // Handle Kids Create special case
  if (vendorKey === 'KIDS_CREATE') {
    const selectedBenefit = document.querySelector('input[name="kidsBenefit"]:checked');
    benefitKey = selectedBenefit ? selectedBenefit.value : 'FRIDAY_WORKSHOP';
  } else {
    // Default benefits for other vendors
    const defaultBenefits = {
      SONOMA: "PERCENT_10",
      LITTLE_SISTER: "CAFE_PERCENT_10",
      FAT_CAT: "BOGO_SCOOP",
      POLISH_BAR: "DAZZLE_DRY_UPGRADE",
      THREADFARE: "PERCENT_10_1X",
      TULUM: "PERCENT_10"
    };
    benefitKey = defaultBenefits[vendorKey];
  }
  
  try {
    const response = await fetch('/redeem/' + vendorKey + '/' + benefitKey + (skipGeo ? '?skipGeo=true' : ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        passId,
        geo: { lat: 29.817091, lng: -95.422111, accuracy: 5 }
      })
    });
    
    const result = await response.json();
    document.getElementById('result').textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    document.getElementById('result').textContent = 'Error: ' + error.message;
  }
}

// Initialize on page load
handleVendorChange();
</script>`);
});

// Add before app.listen()

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({
    ok: false,
    error: 'Internal Server Error',
    details: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: 'Not Found',
    path: req.path
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});