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
const ENFORCE_GEOFENCE = true; // set false to warn-only

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

const DEALS = {
  SONOMA: {
    key: "SONOMA",
    label: "Sonoma",
    benefits: {
      PERCENT_10: {
        label: "10% Off Purchase",
        maxPerMonth: 1,
        passFieldRemaining: "sonoma_remaining",
        conditions: { excludeBottlePurchases: true }
      }
    }
  },
  LITTLE_SISTER: {
    key: "LITTLE_SISTER",
    label: "Little Sister",
    benefits: {
      CAFE_PERCENT_10: {
        label: "10% Off Café",
        maxPerMonth: 1,
        passFieldRemaining: "littlesister_remaining",
        conditions: { purchaseScope: "CAFE" }
      }
    }
  },
  FAT_CAT: {
    key: "FAT_CAT",
    label: "Fat Cat Creamery",
    benefits: {
      BOGO_SCOOP: {
        label: "Buy 1 Get 1 Scoop",
        maxPerMonth: 1,
        passFieldRemaining: "fatcat_remaining",
        conditions: { requiresPaidItem: "scoop" }
      }
    }
  },
  POLISH_BAR: {
    key: "POLISH_BAR",
    label: "Polish Bar",
    benefits: {
      DAZZLE_DRY_UPGRADE: {
        label: "Free Dazzle Dry Upgrade",
        maxPerMonth: 1,
        passFieldRemaining: "polishbar_remaining"
      }
    }
  },
  THREADFARE: {
    key: "THREADFARE",
    label: "Threadfare",
    benefits: {
      PERCENT_10_1X: {
        label: "10% Off (Once)",
        maxPerMonth: 1,
        passFieldRemaining: "threadfare_remaining"
      }
    }
  },
  KIDS_CREATE: {
    key: "KIDS_CREATE",
    label: "Kids Create",
    benefits: {
      FRIDAY_WORKSHOP: {
        label: "Friday Workshop",
        maxPerMonth: 1,
        passFieldRemaining: "kidscreate_workshop_remaining",
        conditions: { weekday: 5 }  // 5 = Friday
      },
      RETAIL_15_1X: {
        label: "15% Off Retail",
        maxPerMonth: 1,
        passFieldRemaining: "kidscreate_retail_remaining"
      }
    }
  },
  TULUM: {
    key: "TULUM",
    label: "Tulum Spa",
    benefits: {
      PERCENT_10: {
        label: "10% Off Service/Retail",
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
  origin: ['https://flowe.studio', 'https://flowe-collective.onrender.com'],
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
        memberId: "P-001",
        holder_name: "Demo User",  // Added
        display_name: "Demo User"  // Added
      }
    },
    pass: {
      id: "P-001",
      attributes: {
        holder_name: "Demo User",  // Added
        display_name: "Demo User", // Added
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
        holder_name: name,  // Added
        display_name: name  // Added
      }
    },
    pass: {
      id: memberId,
      attributes: {
        holder_name: name,  // Added
        display_name: name, // Added
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
<title>Collective — Redeem</title>
<style>
  :root{--fg:#111;--muted:#666;--ok:#0a7b25;--err:#b00020;--bd:#e5e7eb}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;margin:20px;color:var(--fg)}
  .card{border:1px solid var(--bd);border-radius:14px;padding:16px;margin:12px 0;box-shadow:0 1px 2px rgba(0,0,0,.03)}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  button{padding:10px 14px;border-radius:10px;border:1px solid var(--bd);background:#fff;cursor:pointer}
  button.primary{background:#111;color:#fff;border-color:#111}
  .ok{color:var(--ok);font-weight:600} .err{color:var(--err);font-weight:600}
  .muted{color:var(--muted)} .pill{background:#f6f7f9;border:1px solid var(--bd);padding:2px 8px;border-radius:999px}
  label{display:flex;gap:8px;align-items:center}
  input[type=checkbox]{width:18px;height:18px}
</style>

<h2>Collective — Redeem</h2>
<div class="card">
  <div id="pidLine" class="muted">Reading pass…</div>
  <div id="where" class="muted">Finding shop…</div>
</div>

<div id="controls" class="card" style="display:none"></div>
<div id="result" class="card" style="display:none"></div>

<script>
// ---- Config injected from server ----
const LOC = ${JSON.stringify(LOC)};
const DEFAULT_BENEFIT = ${JSON.stringify(DEFAULT_BENEFIT)};

// ---- Utils ----
const q = new URL(location.href).searchParams;
const PID = decodeURIComponent((q.get('pid') || '').trim());
console.log('Received PID:', PID); // Debug logging
const $ = sel => document.querySelector(sel);
const metersFmt = n => Math.round(n) + ' m';

function distMeters(aLat,aLng,bLat,bLng){
  const R=6371000, toRad=x=>x*Math.PI/180;
  const dLat=toRad(bLat-aLat), dLng=toRad(bLng-aLng);
  const s1=Math.sin(dLat/2), s2=Math.sin(dLng/2);
  const a=s1*s1 + Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*s2*s2;
  return 2*R*Math.asin(Math.sqrt(a));
}

function pickByGPS(lat,lng,acc){
  let best=null, bestScore=1e12;
  for (const [k,v] of Object.entries(LOC)){
    const d = distMeters(lat,lng,v.lat,v.lng) - (acc||0);
    const score = d <= v.radius ? d : 1e11 + d;
    if (score < bestScore){ best={vendorKey:k, d, radius:v.radius, acc}; bestScore=score; }
  }
  return best;
}

async function getGeo(){
  return await new Promise(res=>{
    navigator.geolocation.getCurrentPosition(
      p=>res({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy}),
      _=>res(null),
      {enableHighAccuracy:true,timeout:8000,maximumAge:0}
    );
  });
}

function renderControls(vendorKey){
  const box = $('#controls'); box.style.display='block';
  const title = vendorKey.replaceAll('_',' ');
  let inner = '<h3 style="margin-top:0">'+title+'</h3><div class="row" style="gap:14px">';
  if (vendorKey === 'SONOMA'){
    inner += '<label><input type="checkbox" id="hasBottle"> Includes bottle(s)</label>';
  }
  if (vendorKey === 'FAT_CAT'){
    inner += '<label><input type="checkbox" id="paidScoop" checked> Paid scoop in order</label>';
  }
  if (vendorKey === 'LITTLE_SISTER'){
    inner += '<span class="pill">Scope: Café</span>';
  }
  if (vendorKey === 'KIDS_CREATE'){
    inner += '<span class="pill">Default: Friday Workshop</span> <button id="useRetail">Use Retail 15%</button>';
  }
  inner += '</div><div style="margin-top:10px" class="row">' +
           '<button class="primary" id="redeemBtn">Redeem now</button>' +
           '<button id="chooseShop">Change shop</button>' +
           '</div>';
  box.innerHTML = inner;
}

function renderShopChoices(){
  const box = $('#controls'); box.style.display='block';
  let inner = '<h3 style="margin-top:0">Pick the shop</h3><div class="row" style="gap:8px">';
  const labels = {
    SONOMA: "Sonoma - 10% off purchase",
    LITTLE_SISTER: "Little Sister - 10% off",
    FAT_CAT: "Fat Cat Creamery - Buy 1 Get 1 Scoop",
    POLISH_BAR: "Polish Bar - Free Dazzle Dry Upgrade",
    THREADFARE: "Threadfare - 10% Off",
    KIDS_CREATE: "KidCreate - One Free Friday Workshop / 15% off retail",
    TULUM: "Tulum - 10% off service/retail"
  };
  for (const k of Object.keys(LOC)){
    inner += '<button data-k="'+k+'">'+labels[k]+'</button>';
  }
  inner += '</div>';
  box.innerHTML = inner;
  box.querySelectorAll('button[data-k]').forEach(b => b.onclick = () => initForVendor(b.dataset.k));
}

async function redeem(vendorKey, overrideBenefit){
  const benefitKey = overrideBenefit || DEFAULT_BENEFIT[vendorKey];
  const geo = await getGeo();
  const body = { passId: PID, geo };

  if (vendorKey === 'SONOMA'){
    body.cart = { hasBottle: $('#hasBottle')?.checked || false };
  }
  if (vendorKey === 'FAT_CAT'){
    const paid = $('#paidScoop')?.checked ? 1 : 0;
    body.cart = { paidItems: { scoop: paid } };
  }
  if (vendorKey === 'LITTLE_SISTER'){
    body.context = { purchaseScope: 'CAFE' };
  }

  const r = await fetch('https://flowe-collective.onrender.com/redeem/'+vendorKey+'/'+benefitKey, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body)
  });
  const j = await r.json().catch(()=>null);
  const out = $('#result'); out.style.display = 'block';

  if (j && j.ok){
    out.innerHTML = '<div class="ok">APPROVED</div>' +
      '<div class="muted">Remaining this month:</div>' +
      '<pre style="white-space:pre-wrap">'+JSON.stringify(j.balances,null,2)+'</pre>';
  } else {
    const reason = (j && j.reason) || ('HTTP '+r.status);
    out.innerHTML = '<div class="err">DENIED</div><div>'+reason+'</div>';
  }
}

function wireVendorActions(vendorKey){
  const btn = $('#redeemBtn'); if (btn) btn.onclick = () => redeem(vendorKey);
  const chg = $('#chooseShop'); if (chg) chg.onclick = renderShopChoices;
  const useRetail = $('#useRetail'); if (useRetail) useRetail.onclick = () => redeem('KIDS_CREATE','RETAIL_15_1X');
}

function initForVendor(vendorKey, auto=false){
  $('#where').textContent = 'Shop: '+vendorKey.replaceAll('_',' ');
  renderControls(vendorKey);
  wireVendorActions(vendorKey);
  if (auto) redeem(vendorKey);
}

(function main(){
  console.log('Raw PID from URL:', q.get('pid'));
  console.log('Trimmed and decoded PID:', PID);
  
  const pidDisplay = PID ? ('Pass: <span class="pill">'+PID+'</span>') : '<span class="err">Missing pass id</span>';
  $('#pidLine').innerHTML = pidDisplay;
  
  if (!PID) return;

  if (!('geolocation' in navigator)){
    $('#where').innerHTML = 'Location unavailable — pick the shop:';
    return renderShopChoices();
  }
  $('#where').textContent = 'Getting location…';
  getGeo().then(p=>{
    if (!p){ $('#where').innerHTML = 'Location blocked — pick the shop:'; return renderShopChoices(); }
    const choice = pickByGPS(p.lat, p.lng, p.accuracy);
    if (choice && choice.d <= (choice.radius/2) && p.accuracy <= 75){
      $('#where').innerHTML = 'Shop detected: '+choice.vendorKey.replaceAll('_',' ')+' • '+metersFmt(Math.max(0,choice.d))+' away';
      initForVendor(choice.vendorKey, true);
    } else if (choice && choice.d <= choice.radius){
      $('#where').innerHTML = 'Likely: '+choice.vendorKey.replaceAll('_',' ')+' • '+metersFmt(Math.max(0,choice.d))+' away (confirm below)';
      initForVendor(choice.vendorKey, false);
    } else {
      $('#where').innerHTML = 'Not sure where you are — pick the shop:';
      renderShopChoices();
    }
  });
})();
</script>`);
});

// Remove both existing /issue and /issue-form endpoints
// Add this new version before app.listen()

app.get("/issue", (req, res) => {
  res.type("html").send(`<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Issue Badge</title>
<style>
  body { font-family: system-ui; max-width: 600px; margin: 20px auto; padding: 0 20px; }
  .form-group { margin: 15px 0; }
  label { display: block; margin-bottom: 5px; }
  input { width: 100%; padding: 8px; margin-bottom: 10px; }
  button { padding: 10px 20px; background: #000; color: #fff; border: none; border-radius: 5px; cursor: pointer; }
  #result { margin-top: 20px; padding: 15px; border-radius: 8px; }
  .success { background: #e7f3eb; color: #0a7b25; }
  .error { background: #fde7eb; color: #b00020; }
  .hint { color: #666; font-size: 0.9em; margin-top: 4px; }
</style>

<h2>Issue New Collective Pass</h2>
<div class="form-group">
  <label>Full Name:</label>
  <input type="text" id="name" placeholder="Enter member's full name">
</div>
<div class="form-group">
  <label>Email:</label>
  <input type="email" id="email" placeholder="Enter member's email">
</div>
<div class="form-group">
  <label>Member ID:</label>
  <div style="display:flex;gap:10px;align-items:center">
    <input type="text" id="memberId" readonly style="background:#f6f7f9" placeholder="20230910_FC0001">
    <button onclick="generateId()" style="width:auto">Generate ID</button>
  </div>
  <div class="hint">Auto-generated format: YYYYMMDD_FC0001</div>
</div>
<button onclick="issueBadge()">Create Pass</button>
<div id="result"></div>

<script>
// Keep track of last used number
let lastNum = parseInt(localStorage.getItem('lastMemberId') || '0');

function padNumber(n) {
  return String(n).padStart(4, '0');
}

function generateId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  lastNum++;
  localStorage.setItem('lastMemberId', lastNum);
  
  const id = \`\${year}\${month}\${day}_FC\${padNumber(lastNum)}\`;
  document.getElementById('memberId').value = id;
  return id;
}

// Generate ID immediately when page loads
document.addEventListener('DOMContentLoaded', () => {
  const memberId = generateId();
  console.log('Generated ID:', memberId);
});

async function issueBadge() {
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const memberId = document.getElementById('memberId').value.trim();
  
  if (!name || !email || !memberId) {
    document.getElementById('result').className = 'error';
    document.getElementById('result').innerHTML = 'Please fill in all fields';
    return;
  }
  
  try {
    const response = await fetch('/issue-badge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, memberId })
    });
    
    const result = await response.json();
    const resultDiv = document.getElementById('result');
    
    if (result.ok) {
      resultDiv.className = 'success';
      resultDiv.innerHTML = \`
        <div style="margin-bottom:10px">✅ Pass created successfully!</div>
        <div style="margin-bottom:10px">
          <a href="\${result.data.pass.downloadUrl}" target="_blank" 
             style="background:#111;color:#fff;padding:8px 16px;text-decoration:none;border-radius:5px;display:inline-block">
            Download Pass
          </a>
        </div>
        <div style="margin-bottom:10px">
          <a href="/s?pid=\${memberId}" 
             style="color:#111;text-decoration:none;border-bottom:1px solid">
            View Redemption Page
          </a>
        </div>
        <pre style="background:#f6f7f9;padding:10px;border-radius:5px;margin-top:10px">Pass ID: \${result.data.pass.id}</pre>
      \`;
    } else {
      resultDiv.className = 'error';
      resultDiv.innerHTML = 'Error: ' + (result.error || 'Failed to create pass');
    }
  } catch (error) {
    document.getElementById('result').className = 'error';
    document.getElementById('result').innerHTML = 'Error: ' + error.message;
  }
}
</script>`);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});