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
const ENFORCE_GEOFENCE = false; // Changed to false for testing

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
const LOC = ` + JSON.stringify(LOC) + `;
const DEFAULT_BENEFIT = ` + JSON.stringify(DEFAULT_BENEFIT) + `;
const DEALS = ` + JSON.stringify(DEALS) + `;

// ---- Utils ----
const q = new URL(location.href).searchParams;
const PID = decodeURIComponent((q.get('pid') || '').trim());
console.log('Received PID:', PID);
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
    inner += '<div style="display:flex;flex-direction:column;gap:10px;width:100%">' +
             '<button class="primary" onclick="redeem(\'KIDS_CREATE\', \'FRIDAY_WORKSHOP\')">Use Friday Workshop</button>' +
             '<button class="primary" onclick="redeem(\'KIDS_CREATE\', \'RETAIL_15_1X\')">Use 15% Off Retail</button>' +
             '</div>';
    return box.innerHTML = inner;
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

async function redeem(vendorKey, overrideBenefit) {
  const benefitKey = overrideBenefit || DEFAULT_BENEFIT[vendorKey];
  const geo = await getGeo();
  const body = { passId: PID, geo };

  // Show loading state
  const out = $('#result');
  out.style.display = 'block';
  out.innerHTML = '<div class="muted">Processing redemption...</div>';

  // Add vendor-specific data
  if (vendorKey === 'SONOMA') {
    body.cart = { hasBottle: $('#hasBottle')?.checked || false };
  }
  if (vendorKey === 'FAT_CAT') {
    const paid = $('#paidScoop')?.checked ? 1 : 0;
    body.cart = { paidItems: { scoop: paid } };
  }
  if (vendorKey === 'LITTLE_SISTER') {
    body.context = { purchaseScope: 'CAFE' };
  }

  try {
    const r = await fetch('/redeem/'+vendorKey+'/'+benefitKey, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    });
    
    const j = await r.json();
    
    // Replace the success handler:
    if (j && j.ok) {
      const remainingField = DEALS[vendorKey].benefits[benefitKey].passFieldRemaining;
      const remaining = j.balances[remainingField];
      
      out.innerHTML = '<div style="text-align:center;padding:20px 0;">' +
        '<div class="ok" style="font-size:24px;margin-bottom:15px">✅ APPROVED</div>' +
        '<div style="margin-bottom:10px">' +
        '<strong>' + DEALS[vendorKey].label + '</strong><br>' +
        '<span class="muted">' + DEALS[vendorKey].benefits[benefitKey].label + '</span>' +
        '</div>' +
        '<div style="margin-top:15px">' +
        '<div class="muted">Remaining this month:</div>' +
        '<div style="font-size:20px;margin-top:5px">' +
        (remaining === "0" ? "⚠️ No more visits" : "✨ " + remaining + " visit left") +
        '</div>' +
        '</div>' +
        '</div>';
    } else {
      const reason = j.reason || 'HTTP ' + r.status;
      out.innerHTML = '<div style="text-align:center;padding:20px 0;">' +
        '<div class="err" style="font-size:24px;margin-bottom:15px">❌ DENIED</div>' +
        '<div>' + reason + '</div>' +
        '</div>';
    }
  } catch (error) {
    out.innerHTML = '<div class="err" style="text-align:center;padding:20px 0;">' +
      '<div style="font-size:24px;margin-bottom:15px">❌ ERROR</div>' +
      '<div>' + error.message + '</div>' +
      '</div>';
  }
}

function wireVendorActions(vendorKey){
  const btn = $('#redeemBtn'); 
  if (btn) {
    btn.onclick = async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Processing...';
      await redeem(vendorKey);
      e.target.disabled = false;
      e.target.textContent = 'Redeem now';
    };
  }
  const chg = $('#chooseShop'); 
  if (chg) chg.onclick = renderShopChoices;
  const useRetail = $('#useRetail'); 
  if (useRetail) useRetail.onclick = async (e) => {
    e.target.disabled = true;
    await redeem('KIDS_CREATE','RETAIL_15_1X');
    e.target.disabled = false;
  };
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

// Replace the /s endpoint with this fixed version:

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
const LOC = ` + JSON.stringify(LOC) + `;
const DEFAULT_BENEFIT = ` + JSON.stringify(DEFAULT_BENEFIT) + `;
const DEALS = ` + JSON.stringify(DEALS) + `;

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
    inner += '<div style="display:flex;flex-direction:column;gap:10px;width:100%">' +
             '<button class="primary" onclick="redeem(\'KIDS_CREATE\', \'FRIDAY_WORKSHOP\')">Use Friday Workshop</button>' +
             '<button class="primary" onclick="redeem(\'KIDS_CREATE\', \'RETAIL_15_1X\')">Use 15% Off Retail</button>' +
             '</div>';
    return box.innerHTML = inner;
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

async function redeem(vendorKey, overrideBenefit) {
  const benefitKey = overrideBenefit || DEFAULT_BENEFIT[vendorKey];
  const geo = await getGeo();
  const body = { passId: PID, geo };

  // Show loading state
  const out = $('#result');
  out.style.display = 'block';
  out.innerHTML = '<div class="muted">Processing redemption...</div>';

  // Add vendor-specific data
  if (vendorKey === 'SONOMA') {
    body.cart = { hasBottle: $('#hasBottle')?.checked || false };
  }
  if (vendorKey === 'FAT_CAT') {
    const paid = $('#paidScoop')?.checked ? 1 : 0;
    body.cart = { paidItems: { scoop: paid } };
  }
  if (vendorKey === 'LITTLE_SISTER') {
    body.context = { purchaseScope: 'CAFE' };
  }

  try {
    const r = await fetch('/redeem/'+vendorKey+'/'+benefitKey, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    });
    
    const j = await r.json();
    
    // Replace the success handler:
    if (j && j.ok) {
      const remainingField = DEALS[vendorKey].benefits[benefitKey].passFieldRemaining;
      const remaining = j.balances[remainingField];
      
      out.innerHTML = '<div style="text-align:center;padding:20px 0;">' +
        '<div class="ok" style="font-size:24px;margin-bottom:15px">✅ APPROVED</div>' +
        '<div style="margin-bottom:10px">' +
        '<strong>' + DEALS[vendorKey].label + '</strong><br>' +
        '<span class="muted">' + DEALS[vendorKey].benefits[benefitKey].label + '</span>' +
        '</div>' +
        '<div style="margin-top:15px">' +
        '<div class="muted">Remaining this month:</div>' +
        '<div style="font-size:20px;margin-top:5px">' +
        (remaining === "0" ? "⚠️ No more visits" : "✨ " + remaining + " visit left") +
        '</div>' +
        '</div>' +
        '</div>';
    } else {
      const reason = j.reason || 'HTTP ' + r.status;
      out.innerHTML = '<div style="text-align:center;padding:20px 0;">' +
        '<div class="err" style="font-size:24px;margin-bottom:15px">❌ DENIED</div>' +
        '<div>' + reason + '</div>' +
        '</div>';
    }
  } catch (error) {
    out.innerHTML = '<div class="err" style="text-align:center;padding:20px 0;">' +
      '<div style="font-size:24px;margin-bottom:15px">❌ ERROR</div>' +
      '<div>' + error.message + '</div>' +
      '</div>';
  }
}

function wireVendorActions(vendorKey){
  const btn = $('#redeemBtn'); 
  if (btn) {
    btn.onclick = async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Processing...';
      await redeem(vendorKey);
      e.target.disabled = false;
      e.target.textContent = 'Redeem now';
    };
  }
  const chg = $('#chooseShop'); 
  if (chg) chg.onclick = renderShopChoices;
  const useRetail = $('#useRetail'); 
  if (useRetail) useRetail.onclick = async (e) => {
    e.target.disabled = true;
    await redeem('KIDS_CREATE','RETAIL_15_1X');
    e.target.disabled = false;
  };
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

// Replace the /issue endpoint with this fixed version:

app.get("/issue", (req, res) => {
  res.type("html").send('<!doctype html>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
    '<title>Issue Badge</title>' +
    '<h2>Issue New Collective Pass</h2>' +
    '<div>' +
    '  <div>' +
    '    <label>Full Name:</label><br>' +
    '    <input type="text" id="name" placeholder="Enter member\'s full name">' +
    '  </div>' +
    '  <br>' +
    '  <div>' +
    '    <label>Email:</label><br>' +
    '    <input type="email" id="email" placeholder="Enter member\'s email">' +
    '  </div>' +
    '  <br>' +
    '  <div>' +
    '    <label>Member ID:</label><br>' +
    '    <input type="text" id="memberId" readonly>' +
    '    <button onclick="generateId()">Generate New ID</button>' +
    '  </div>' +
    '  <br>' +
    '  <button onclick="issueBadge()">Create Pass</button>' +
    '  <div id="result"></div>' +
    '</div>' +
    '<script>' +
    'var lastNum = parseInt(localStorage.getItem("lastMemberId") || "0");' +
    'function padNumber(n) { return ("0000" + n).slice(-4); }' +
    'function generateId() {' +
    '  var now = new Date();' +
    '  var year = now.getFullYear();' +
    '  var month = ("0" + (now.getMonth() + 1)).slice(-2);' +
    '  var day = ("0" + now.getDate()).slice(-2);' +
    '  lastNum++;' +
    '  localStorage.setItem("lastMemberId", lastNum);' +
    '  var id = year + month + day + "_FC" + padNumber(lastNum);' +
    '  document.getElementById("memberId").value = id;' +
    '  return id;' +
    '}' +
    'document.addEventListener("DOMContentLoaded", generateId);' +
    'async function issueBadge() {' +
    '  var name = document.getElementById("name").value.trim();' +
    '  var email = document.getElementById("email").value.trim();' +
    '  var memberId = document.getElementById("memberId").value.trim();' +
    '  var resultEl = document.getElementById("result");' +
    '  if (!name || !email || !memberId) {' +
    '    resultEl.innerHTML = "Please fill in all fields";' +
    '    return;' +
    '  }' +
    '  try {' +
    '    var response = await fetch("/issue-badge", {' +
    '      method: "POST",' +
    '      headers: { "Content-Type": "application/json" },' +
    '      body: JSON.stringify({ name: name, email: email, memberId: memberId })' +
    '    });' +
    '    var result = await response.json();' +
    '    if (result.ok) {' +
    '      var downloadUrl = result.data.pass.downloadUrl;' +
    '      resultEl.innerHTML = "<div>Pass created successfully!</div><div><a href=\\"" + downloadUrl + "\\" target=\\"_blank\\">Download Pass</a> <a href=\\"/s?pid=" + encodeURIComponent(memberId) + "\\">View Redemption Page</a></div>";' +
    '      if (downloadUrl) {' +
    '        window.location.href = downloadUrl;' +
    '      }' +
    '    } else {' +
    '      resultEl.innerHTML = "Error: " + (result.error || "Failed to create pass");' +
    '    }' +
    '  } catch (error) {' +
    '    resultEl.innerHTML = "Error: " + error.message;' +
    '  }' +
    '}' +
    '</script>');
});

// Add before app.listen()

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
    <option value="SONOMA">Sonoma</option>
    <option value="LITTLE_SISTER">Little Sister</option>
    <option value="FAT_CAT">Fat Cat</option>
    <option value="POLISH_BAR">Polish Bar</option>
    <option value="THREADFARE">Threadfare</option>
    <option value="KIDS_CREATE">Kids Create</option>
    <option value="TULUM">Tulum</option>
  </select>
</div>

<div id="kidsCreateOptions" class="kids-create-options" style="display:none">
  <label>Kids Create Benefit:</label>
  <div>
    <label><input type="radio" name="kidsBenefit" value="FRIDAY_WORKSHOP" checked> Friday Workshop</label>
  </div>
  <div>
    <label><input type="radio" name="kidsBenefit" value="RETAIL_15_1X"> 15% Off Retail</label>
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