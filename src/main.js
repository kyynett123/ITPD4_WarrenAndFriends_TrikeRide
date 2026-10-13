import { supabase } from './supabase.js';

// State Management
let mapInstance = null;
let terminalMarkers = [];
let routePolyline = null;
let routeEndpointMarkers = [];
let allTerminals = [];
let fareMatrixData = [];
let isDriverOnline = true;

// Known Coordinates for Core Commuter Hubs in Iloilo
const LOCATION_COORDINATES = {
  'WIT': {
    lat: 10.7153,
    lng: 122.5627,
    name: 'WIT (Western Institute of Technology)',
    landmark: 'Commission Civil / Luna St., La Paz'
  },
  'CPU': {
    lat: 10.7303,
    lng: 122.5532,
    name: 'CPU (Central Philippine University)',
    landmark: 'Lopez Jaena St., Jaro'
  },
  'Jaro Plaza': {
    lat: 10.7246,
    lng: 122.5583,
    name: 'Jaro Plaza (Metropolitan Belfry)',
    landmark: 'Opposite Jaro Metropolitan Cathedral'
  },
  'SM City': {
    lat: 10.7142,
    lng: 122.5502,
    name: 'SM City Iloilo (Mandurriao)',
    landmark: 'Benigno Aquino Ave. (Diversion Road)'
  },
  'Robinsons Jaro': {
    lat: 10.7262,
    lng: 122.5601,
    name: 'Robinsons Place Jaro',
    landmark: 'E. Lopez St., Jaro'
  },
  'Pavia': {
    lat: 10.7745,
    lng: 122.5401,
    name: 'Pavia Public Plaza',
    landmark: 'Pavia Municipal Hall & Market'
  },
  'Tagbak': {
    lat: 10.7485,
    lng: 122.5694,
    name: 'Tagbak Transport Terminal',
    landmark: 'McArthur Highway / Tagbak Hub'
  },
  'WVSU': {
    lat: 10.7118,
    lng: 122.5586,
    name: 'WVSU (West Visayas State University)',
    landmark: 'Luna St., La Paz'
  }
};

// Resilient Fallback Dataset for Iloilo TODA Terminals
const FALLBACK_TERMINALS = [
  {
    terminal_name: 'WIT Main Gate Terminal',
    landmark: 'Commission Civil / Luna St., La Paz',
    toda_association: 'La Paz - WIT TODA',
    operating_hours: '5:00 AM - 9:30 PM',
    latitude: 10.7153,
    longitude: 122.5627
  },
  {
    terminal_name: 'CPU Gate 1 Terminal',
    landmark: 'Lopez Jaena St., CPU Halfway',
    toda_association: 'CPU - Jaro TODA',
    operating_hours: '5:30 AM - 10:00 PM',
    latitude: 10.7303,
    longitude: 122.5532
  },
  {
    terminal_name: 'Jaro Belfry & Plaza Terminal',
    landmark: 'Opposite Jaro Metropolitan Cathedral',
    toda_association: 'Jaro Commercial Center TODA',
    operating_hours: '24 Hours Available',
    latitude: 10.7246,
    longitude: 122.5583
  },
  {
    terminal_name: 'SM City Tricycle Commuter Bay',
    landmark: 'Benigno Aquino Ave. Service Road',
    toda_association: 'Mandurriao - SM North TODA',
    operating_hours: '6:00 AM - 10:00 PM',
    latitude: 10.7142,
    longitude: 122.5502
  },
  {
    terminal_name: 'Robinsons Place Jaro Station',
    landmark: 'E. Lopez St., Jaro District',
    toda_association: 'E. Lopez Commercial TODA',
    operating_hours: '7:00 AM - 9:30 PM',
    latitude: 10.7262,
    longitude: 122.5601
  },
  {
    terminal_name: 'Pavia Town Plaza Terminal',
    landmark: 'Pavia Municipal Hall & Market',
    toda_association: 'Pavia Poblacion TODA',
    operating_hours: '5:00 AM - 9:00 PM',
    latitude: 10.7745,
    longitude: 122.5401
  },
  {
    terminal_name: 'Tagbak Integrated Hub Terminal',
    landmark: 'Tagbak Transport Terminal Entrance',
    toda_association: 'Metro Tagbak - Jaro TODA',
    operating_hours: '4:30 AM - 10:30 PM',
    latitude: 10.7485,
    longitude: 122.5694
  },
  {
    terminal_name: 'WVSU Medical / Campus Terminal',
    landmark: 'Luna St., La Paz / Jaro Border',
    toda_association: 'WVSU - Luna TODA',
    operating_hours: '5:30 AM - 9:30 PM',
    latitude: 10.7118,
    longitude: 122.5586
  }
];

// Official Fare Matrix Brackets
const FALLBACK_FARES = [
  { distance_range: '1 - 2 km', regular_fare: 10, special_fare: 30, student_fare: 8, min_km: 1, max_km: 2 },
  { distance_range: '2 - 3 km', regular_fare: 15, special_fare: 45, student_fare: 12, min_km: 2, max_km: 3 },
  { distance_range: '3 - 5 km', regular_fare: 25, special_fare: 65, student_fare: 20, min_km: 3, max_km: 5 },
  { distance_range: '5 - 8 km', regular_fare: 30, special_fare: 80, student_fare: 24, min_km: 5, max_km: 8 }
];

// Helper: Haversine Distance Formula in Kilometers
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

// 1. Navigation / Tab Switcher (Syncs both Desktop pill tabs & Mobile bottom nav)
window.switchTab = function (screenId, btnElement) {
  document.querySelectorAll('.screen-view').forEach(screen => screen.classList.remove('active'));
  document.querySelectorAll('.nav-btn, .tab-pill').forEach(btn => btn.classList.remove('active'));

  const targetScreen = document.getElementById(screenId);
  if (targetScreen) targetScreen.classList.add('active');

  // Activate matching buttons on both views
  document.querySelectorAll(`button[onclick*="'${screenId}'"]`).forEach(btn => btn.classList.add('active'));

  // Trigger Leaflet viewport recalculation for responsive split/stacked layout
  if (mapInstance) {
    setTimeout(() => {
      mapInstance.invalidateSize();
    }, 150);
  }
};

// Swap Origin and Destination
window.swapOriginAndDestination = function () {
  const originEl = document.getElementById('originSelect');
  const destEl = document.getElementById('destSelect');
  if (!originEl || !destEl) return;

  const temp = originEl.value;
  originEl.value = destEl.value;
  destEl.value = temp;

  // Auto-recalculate if already showing result
  const resultCard = document.getElementById('routeCalculationResult');
  if (resultCard && resultCard.style.display !== 'none') {
    window.calculateSelectedRoute();
  }
};

// Quick Demo Route Selector for Presentations
window.setQuickRoute = function (originKey, destKey) {
  const originEl = document.getElementById('originSelect');
  const destEl = document.getElementById('destSelect');

  if (originEl && destEl) {
    originEl.value = originKey;
    destEl.value = destKey;
  }

  // Switch to Route Finder screen if not active
  const routeBtn = document.querySelector('button[onclick*="screenRoute"]');
  window.switchTab('screenRoute', routeBtn);

  // Compute and show result
  window.calculateSelectedRoute();
};

// Quick Route from Terminal card
window.routeFromTerminal = function (originKey) {
  const originEl = document.getElementById('originSelect');
  if (originEl) originEl.value = originKey;

  const routeBtn = document.querySelector('button[onclick*="screenRoute"]');
  window.switchTab('screenRoute', routeBtn);
  window.calculateSelectedRoute();
};

// Filter terminals by category chips
window.filterTerminalsByChip = function (query, chipElement) {
  document.querySelectorAll('.chip-btn').forEach(c => c.classList.remove('active'));
  if (chipElement) chipElement.classList.add('active');

  const searchInput = document.getElementById('terminalSearchInput');
  if (searchInput) {
    searchInput.value = query === 'all' ? '' : query;
  }

  if (query === 'all') {
    renderTerminalsList(allTerminals);
    renderMarkers(allTerminals);
  } else {
    const q = query.toLowerCase();
    const filtered = allTerminals.filter(t => 
      t.terminal_name.toLowerCase().includes(q) ||
      (t.landmark && t.landmark.toLowerCase().includes(q)) ||
      (t.toda_association && t.toda_association.toLowerCase().includes(q))
    );
    renderTerminalsList(filtered);
    renderMarkers(filtered);
  }
};

// 2. Leaflet Map Initialization
function initMap() {
  const mapElement = document.getElementById('map');
  if (!mapElement) return;

  // Center on Jaro / CPU Area
  mapInstance = L.map('map', {
    zoomControl: true,
    scrollWheelZoom: true
  }).setView([10.7270, 122.5560], 13);

  window.mapInstance = mapInstance;

  // OpenStreetMap Layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(mapInstance);
}

// Custom Leaflet Tricycle Pin Icon
function createTricyclePinIcon() {
  return L.divIcon({
    className: 'custom-trike-pin',
    html: `
      <div style="
        background: #DDB892;
        border: 2px solid #2B2D42;
        border-radius: 50%;
        width: 34px;
        height: 34px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 17px;
        box-shadow: 0 3px 8px rgba(43,45,66,0.25);
        cursor: pointer;
        transition: transform 0.15s ease;
      ">🛺</div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18]
  });
}

// Route Start & End Pin Icons
function createRouteEndpointIcon(letter, isOrigin = true) {
  const bg = isOrigin ? '#10B981' : '#E63946';
  return L.divIcon({
    className: 'route-endpoint-pin',
    html: `
      <div style="
        background: ${bg};
        color: #FFFFFF;
        border: 2px solid #2B2D42;
        border-radius: 50%;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: 800;
        box-shadow: 0 3px 6px rgba(0,0,0,0.3);
      ">${letter}</div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16]
  });
}

// 3. Fetch & Render Terminals (Supabase + Resilient Fallback)
async function loadTerminals() {
  const listEl = document.getElementById('terminalList');
  if (!listEl) return;

  try {
    const { data, error } = await supabase.from('tbl_terminals').select('*');
    if (error || !data || data.length === 0) {
      console.warn('Supabase tbl_terminals unavailable or empty. Utilizing seeded fallback dataset:', error);
      allTerminals = FALLBACK_TERMINALS;
    } else {
      allTerminals = data;
    }
  } catch (err) {
    console.warn('Network issue fetching terminals, falling back to local dataset:', err);
    allTerminals = FALLBACK_TERMINALS;
  }

  renderTerminalsList(allTerminals);
  renderMarkers(allTerminals);
}

// Render Terminal Listing Cards
function renderTerminalsList(terminals) {
  const listEl = document.getElementById('terminalList');
  if (!listEl) return;

  listEl.innerHTML = '';

  if (terminals.length === 0) {
    listEl.innerHTML = `
      <div style="font-size: 0.85rem; color: #5C5C5C; text-align: center; padding: 20px; background: #FAF6F0; border-radius: 10px; border: 1px dashed #2B2D42;">
        No terminals match your search.
      </div>
    `;
    return;
  }

  terminals.forEach((term, index) => {
    const card = document.createElement('div');
    card.className = 'tan-card';
    card.style.cursor = 'pointer';
    card.style.transition = 'transform 0.15s, box-shadow 0.15s';

    // Find location key if applicable
    const matchedKey = Object.keys(LOCATION_COORDINATES).find(k => 
      term.terminal_name.includes(k) || (term.landmark && term.landmark.includes(k))
    ) || 'WIT';

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div style="font-weight: 800; font-size: 0.94rem; color: #1A1A1A;">🛺 ${term.terminal_name}</div>
          <div style="font-size: 0.78rem; color: #5C5C5C; margin-top: 3px;">📍 ${term.landmark || 'Neighborhood Hub'}</div>
        </div>
        <span style="font-size: 0.7rem; background: #FFFFFF; border: 1.5px solid #2B2D42; padding: 2px 7px; border-radius: 6px; font-weight: 700; color: #2B2D42;">
          Locate
        </span>
      </div>
      
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(43,45,66,0.15);">
        <div style="font-size: 0.72rem; font-weight: 700; color: #2B2D42;">
          ${term.toda_association || 'Local Tricycle Assoc.'}
        </div>
        <button 
          style="
            background: #EDE0D4; border: 1px solid #2B2D42; border-radius: 6px;
            font-size: 0.7rem; font-weight: 700; padding: 3px 8px; cursor: pointer;
          "
          onclick="event.stopPropagation(); routeFromTerminal('${matchedKey}')"
        >
          📍 Route from here
        </button>
      </div>
    `;

    // Click card to zoom to marker on map
    card.addEventListener('click', () => {
      if (mapInstance && term.latitude && term.longitude) {
        mapInstance.flyTo([term.latitude, term.longitude], 16, { animate: true, duration: 1 });
        const marker = terminalMarkers[index];
        if (marker) marker.openPopup();
      }
    });

    listEl.appendChild(card);
  });
}

// Render Markers on Leaflet Map
function renderMarkers(terminals) {
  if (!mapInstance) return;

  // Clear previous markers
  terminalMarkers.forEach(m => mapInstance.removeLayer(m));
  terminalMarkers = [];

  const bounds = [];

  terminals.forEach(term => {
    if (!term.latitude || !term.longitude) return;

    const latLng = [term.latitude, term.longitude];
    bounds.push(latLng);

    const marker = L.marker(latLng, { icon: createTricyclePinIcon() })
      .addTo(mapInstance)
      .bindPopup(`
        <div style="font-family: inherit; min-width: 170px;">
          <div style="font-weight: 800; font-size: 0.95rem; color: #1A1A1A;">🛺 ${term.terminal_name}</div>
          <div style="font-size: 0.78rem; color: #5C5C5C; margin: 4px 0;">📍 ${term.landmark}</div>
          <div style="font-size: 0.72rem; font-weight: 700; color: #2B2D42; background: #DDB892; padding: 3px 6px; border-radius: 4px; display: inline-block;">
            ${term.toda_association}
          </div>
          <div style="font-size: 0.7rem; color: #5C5C5C; margin-top: 4px;">⏰ ${term.operating_hours || 'Daily Service'}</div>
        </div>
      `);

    terminalMarkers.push(marker);
  });

  if (bounds.length > 0 && !routePolyline) {
    mapInstance.fitBounds(bounds, { padding: [30, 30] });
  }
}

// 4. Quick Terminal Search Filter
function setupTerminalSearch() {
  const searchInput = document.getElementById('terminalSearchInput');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const filtered = allTerminals.filter(t => 
      t.terminal_name.toLowerCase().includes(query) ||
      (t.landmark && t.landmark.toLowerCase().includes(query)) ||
      (t.toda_association && t.toda_association.toLowerCase().includes(query))
    );
    renderTerminalsList(filtered);
    renderMarkers(filtered);
  });
}

// 5. Fetch & Render Fare Matrix (Supabase + Resilient Fallback)
async function loadFares() {
  const fareContainer = document.getElementById('fareBracketsContainer');
  if (!fareContainer) return;

  try {
    const { data, error } = await supabase.from('tbl_fare_matrix').select('*').order('min_km', { ascending: true });
    if (error || !data || data.length === 0) {
      console.warn('Supabase tbl_fare_matrix unavailable or empty. Using wireframe fallback brackets:', error);
      fareMatrixData = FALLBACK_FARES;
    } else {
      fareMatrixData = data;
    }
  } catch (err) {
    console.warn('Network issue fetching fare matrix, falling back to local dataset:', err);
    fareMatrixData = FALLBACK_FARES;
  }

  fareContainer.innerHTML = '';
  fareMatrixData.forEach(f => {
    const box = document.createElement('div');
    box.className = 'fare-bracket';
    const regFare = parseFloat(f.regular_fare || 0).toFixed(0);
    const specFare = f.special_fare ? parseFloat(f.special_fare).toFixed(0) : (regFare * 3);
    const studentFare = f.student_fare ? parseFloat(f.student_fare).toFixed(0) : Math.round(regFare * 0.8);

    box.innerHTML = `
      <div>
        <div style="font-weight: 800; font-size: 0.92rem; color: #1A1A1A;">${f.distance_range}</div>
        <div style="font-size: 0.72rem; color: #5C5C5C; font-weight: 500;">
          Special: <b>₱${specFare}</b> • Student/Senior: <b>₱${studentFare}</b>
        </div>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 1.15rem; font-weight: 800; color: #2B2D42;">₱${regFare}</span>
        <div style="font-size: 0.65rem; color: #5C5C5C; font-weight: 600;">Regular Shared</div>
      </div>
    `;
    fareContainer.appendChild(box);
  });
}

// Interactive Per-KM Fare Estimator Simulator
window.simulateFareDistance = function (km, btnElement) {
  document.querySelectorAll('.fare-sim-btn').forEach(b => b.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');

  let reg = 10;
  let spec = 30;
  let zoneName = 'Base Neighborhood Zone (First 1-2 km)';

  if (km <= 2.0) {
    reg = 10;
    spec = 30;
    zoneName = 'Base Zone (First 1-2 km)';
  } else if (km <= 3.0) {
    reg = 15;
    spec = 45;
    zoneName = 'Mid-Transit Zone (2-3 km)';
  } else if (km <= 5.0) {
    reg = 25;
    spec = 65;
    zoneName = 'Extended Corridor (3-5 km)';
  } else {
    reg = 30;
    spec = 80;
    zoneName = 'Outer Boundary Zone (5-8 km)';
  }

  const student = Math.round(reg * 0.8);

  const regEl = document.getElementById('simRegFare');
  const studentEl = document.getElementById('simStudentFare');
  const specEl = document.getElementById('simSpecFare');
  const zoneEl = document.getElementById('simZoneDesc');

  if (regEl) regEl.innerText = `₱${reg}.00`;
  if (studentEl) studentEl.innerText = `₱${student}.00`;
  if (specEl) specEl.innerText = `₱${spec}.00`;
  if (zoneEl) zoneEl.innerText = `${km} km • ${zoneName}`;
};

// Realistic Road Waypoints Interpolation between Key Iloilo Landmarks
function getRealisticRouteWaypoints(originKey, destKey) {
  const orig = LOCATION_COORDINATES[originKey];
  const dest = LOCATION_COORDINATES[destKey];
  if (!orig || !dest) return [];

  // Intermediate landmarks to route naturally along major roads (Luna St, Diversion, Lopez Jaena)
  const JaroJunction = [10.7238, 122.5575]; // Luna St / Commission Civil / E Lopez junction
  const DiversionMid = [10.7180, 122.5520]; // Benigno Aquino Ave near SM City

  // WIT ↔ SM City route follows Luna St then Diversion Rd
  if ((originKey === 'WIT' && destKey === 'SM City') || (originKey === 'SM City' && destKey === 'WIT')) {
    return [
      [orig.lat, orig.lng],
      [10.7145, 122.5570], // Forbes bridge approach
      [10.7135, 122.5535], // Diversion intersection
      [dest.lat, dest.lng]
    ];
  }

  // CPU ↔ SM City route follows El 98 / Lopez Jaena to Diversion
  if ((originKey === 'CPU' && destKey === 'SM City') || (originKey === 'SM City' && destKey === 'CPU')) {
    return [
      [orig.lat, orig.lng],
      [10.7265, 122.5545], // El 98 St
      DiversionMid,
      [dest.lat, dest.lng]
    ];
  }

  // Jaro Plaza ↔ Pavia route follows Jaro - Pavia highway
  if ((originKey === 'Jaro Plaza' && destKey === 'Pavia') || (originKey === 'Pavia' && destKey === 'Jaro Plaza')) {
    return [
      [orig.lat, orig.lng],
      [10.7350, 122.5530], // Lopez Jaena Jaro
      [10.7520, 122.5480], // Sambag / Ungka flyover
      [dest.lat, dest.lng]
    ];
  }

  // Default natural curvature
  return [
    [orig.lat, orig.lng],
    [
      (orig.lat + dest.lat) / 2 + 0.0012,
      (orig.lng + dest.lng) / 2 - 0.0015
    ],
    [dest.lat, dest.lng]
  ];
}

// 6. Point-to-Point Route & Fare Calculator
window.calculateSelectedRoute = function () {
  const originVal = document.getElementById('originSelect')?.value || 'WIT';
  const destVal = document.getElementById('destSelect')?.value || 'SM City';
  const resultCard = document.getElementById('routeCalculationResult');

  if (!resultCard) return;

  const originCoords = LOCATION_COORDINATES[originVal];
  const destCoords = LOCATION_COORDINATES[destVal];

  let distanceKm = 0;
  let travelTimeMinutes = '5-8 mins';
  let regFare = 10;
  let specFare = 30;

  if (originVal === destVal) {
    distanceKm = 0.8;
    travelTimeMinutes = '3-5 mins (Within same barangay zone)';
    regFare = 10;
    specFare = 30;
  } else if (originCoords && destCoords) {
    distanceKm = calculateDistanceKm(originCoords.lat, originCoords.lng, destCoords.lat, destCoords.lng);
    
    // Add realistic 15% road curvature factor to pure aerial distance
    distanceKm = Number((distanceKm * 1.15).toFixed(1));

    // Estimated tricycle travel time @ 18-22 km/h plus stops
    const estMin = Math.max(5, Math.round(distanceKm * 3.5));
    const estMax = estMin + 5;
    travelTimeMinutes = `${estMin}-${estMax} mins estimated travel time`;

    // Compute according to TODA Distance Matrix brackets
    if (distanceKm <= 2.0) {
      regFare = 10;
      specFare = 30;
    } else if (distanceKm <= 3.0) {
      regFare = 15;
      specFare = 45;
    } else if (distanceKm <= 5.0) {
      regFare = 25;
      specFare = 65;
    } else {
      regFare = 30;
      specFare = 80;
    }
  }

  // Update UI Elements
  const routeTitleEl = document.getElementById('resRouteTitle');
  const distanceEl = document.getElementById('resDistance');
  const travelTimeEl = document.getElementById('resTravelTime');
  const regFareEl = document.getElementById('resRegFare');
  const specFareEl = document.getElementById('resSpecFare');

  if (routeTitleEl) routeTitleEl.innerText = `${originVal} ➔ ${destVal}`;
  if (distanceEl) distanceEl.innerText = `${distanceKm} km`;
  if (travelTimeEl) travelTimeEl.innerText = `⏱ ${travelTimeMinutes}`;
  if (regFareEl) regFareEl.innerText = `₱${regFare.toFixed(2)}`;
  if (specFareEl) specFareEl.innerText = `₱${specFare.toFixed(2)}`;

  // Display Result Card with smooth animation
  resultCard.style.display = 'block';

  // Draw Route Polyline & Endpoint Markers on Leaflet Map
  if (mapInstance && originCoords && destCoords && originVal !== destVal) {
    // Clear previous route
    if (routePolyline) mapInstance.removeLayer(routePolyline);
    routeEndpointMarkers.forEach(m => mapInstance.removeLayer(m));
    routeEndpointMarkers = [];

    const waypoints = getRealisticRouteWaypoints(originVal, destVal);

    // Draw high-visibility route polyline
    routePolyline = L.polyline(waypoints, {
      color: '#2B2D42',
      weight: 5,
      dashArray: '8, 8',
      opacity: 0.9
    }).addTo(mapInstance);

    // Origin marker (A in green)
    const startMarker = L.marker([originCoords.lat, originCoords.lng], {
      icon: createRouteEndpointIcon('A', true)
    }).addTo(mapInstance).bindPopup(`<b>Pickup:</b> ${originCoords.name}`);

    // Destination marker (B in red)
    const endMarker = L.marker([destCoords.lat, destCoords.lng], {
      icon: createRouteEndpointIcon('B', false)
    }).addTo(mapInstance).bindPopup(`<b>Dropoff:</b> ${destCoords.name}`);

    routeEndpointMarkers.push(startMarker, endMarker);

    // Auto-fit bounds
    mapInstance.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });
  }
};

// Switch directly to Map and zoom in on route
window.viewRouteOnMap = function () {
  const homeNavBtn = document.querySelector('.nav-btn[onclick*="screenHome"], .tab-pill[onclick*="screenHome"]');
  window.switchTab('screenHome', homeNavBtn);
  if (routePolyline && mapInstance) {
    setTimeout(() => {
      mapInstance.invalidateSize();
      mapInstance.fitBounds(routePolyline.getBounds(), { padding: [60, 60] });
    }, 250);
  }
};

// Locate TODA Hub on Map from TODA Directory
window.locateTodaOnMap = function (locationKey) {
  const coords = LOCATION_COORDINATES[locationKey];
  const homeNavBtn = document.querySelector('.nav-btn[onclick*="screenHome"], .tab-pill[onclick*="screenHome"]');
  window.switchTab('screenHome', homeNavBtn);

  if (mapInstance && coords) {
    setTimeout(() => {
      mapInstance.invalidateSize();
      mapInstance.flyTo([coords.lat, coords.lng], 16, { animate: true, duration: 1 });
      const marker = terminalMarkers.find(m => {
        const pos = m.getLatLng();
        return Math.abs(pos.lat - coords.lat) < 0.005 && Math.abs(pos.lng - coords.lng) < 0.005;
      });
      if (marker) marker.openPopup();
    }, 250);
  }
};

// 7. TODA Dispatch Service Availability Toggle
window.toggleDriverOnline = function () {
  isDriverOnline = !isDriverOnline;
  const tag = document.getElementById('driverStatusTag');
  const desc = document.getElementById('driverStatusDesc');
  const btn = document.getElementById('toggleOnlineBtn');
  const headerBadge = document.getElementById('statusIndicator');

  if (isDriverOnline) {
    if (tag) {
      tag.innerText = 'In Service';
      tag.style.background = '#10B981';
    }
    if (desc) desc.innerText = 'Waiting for passengers / Active Dispatch';
    if (btn) btn.innerText = 'Set Offline';
    if (headerBadge) {
      headerBadge.innerHTML = `<span class="status-dot"></span><span>TODA Live</span>`;
      headerBadge.style.background = '#10B981';
    }
  } else {
    if (tag) {
      tag.innerText = 'Off Duty';
      tag.style.background = '#6B7280';
    }
    if (desc) desc.innerText = 'Off duty / Standby';
    if (btn) btn.innerText = 'Set Online';
    if (headerBadge) {
      headerBadge.innerHTML = `<span class="status-dot"></span><span>TODA Standby</span>`;
      headerBadge.style.background = '#6B7280';
    }
  }
};

// 8. Simulated TODA Dispatch Logs Viewer
window.viewRideHistoryModal = function () {
  const historyItems = [
    { from: 'CPU Gate 1 Terminal', to: 'SM City Commuter Bay', fare: '₱45.00', unit: 'Unit #102', type: 'Special Direct', time: '12 mins ago' },
    { from: 'WIT Main Gate', to: 'Jaro Plaza Belfry', fare: '₱15.00', unit: 'Unit #038', type: 'Regular Shared', time: '28 mins ago' },
    { from: 'Jaro Belfry Terminal', to: 'Pavia Town Plaza', fare: '₱80.00', unit: 'Unit #074', type: 'Special Direct', time: '1 hour ago' },
    { from: 'Robinsons Place Jaro', to: 'WVSU Luna St.', fare: '₱15.00', unit: 'Unit #019', type: 'Regular Shared', time: '2 hours ago' },
    { from: 'Tagbak Terminal Bay', to: 'CPU Main Gate', fare: '₱25.00', unit: 'Unit #088', type: 'Regular Shared', time: 'Yesterday' }
  ];

  const modalHtml = `
    <div id="historyModalOverlay" style="
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.55); z-index: 100;
      display: flex; align-items: flex-end; justify-content: center;
      animation: fadeIn 0.2s ease-in-out;
    ">
      <div style="
        background: #FFFFFF; width: 100%; max-width: 440px;
        border-top-left-radius: 18px; border-top-right-radius: 18px;
        padding: 20px; border: 1.5px solid #2B2D42; box-shadow: 0 -4px 20px rgba(0,0,0,0.25);
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
          <div>
            <h4 style="font-size: 1.05rem; font-weight: 800; color: #1A1A1A;">TODA Terminal Dispatch Logs</h4>
            <div style="font-size: 0.72rem; color: #5C5C5C;">Central Jaro-CPU Dispatch Records (Today)</div>
          </div>
          <button onclick="document.getElementById('historyModalOverlay').remove()" style="
            background: #EDE0D4; border: 1px solid #2B2D42; border-radius: 50%;
            width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
            font-size: 1.1rem; cursor: pointer; font-weight: 800;
          ">&times;</button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; max-height: 280px; overflow-y: auto;">
          ${historyItems.map(item => `
            <div style="background: #FAF6F0; border: 1.5px solid #2B2D42; border-radius: 10px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 800; font-size: 0.88rem; color: #1A1A1A;">${item.from} → ${item.to}</div>
                <div style="font-size: 0.72rem; color: #5C5C5C; margin-top: 2px;">${item.unit} • ${item.time} • ${item.type}</div>
              </div>
              <div style="font-weight: 800; font-size: 1rem; color: #2B2D42;">${item.fare}</div>
            </div>
          `).join('')}
        </div>
        <button class="tan-btn" onclick="document.getElementById('historyModalOverlay').remove()" style="margin-top: 14px;">
          Close Dispatch Logs
        </button>
      </div>
    </div>
  `;

  const existingModal = document.getElementById('historyModalOverlay');
  if (existingModal) existingModal.remove();
  document.body.insertAdjacentHTML('beforeend', modalHtml);
};

// 9. Application Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadTerminals();
  loadFares();
  setupTerminalSearch();

  // Attach ride history modal to driver screen button
  const historyBtn = document.querySelector('#screenDriver button[onclick*="alert"]');
  if (historyBtn) {
    historyBtn.setAttribute('onclick', 'viewRideHistoryModal()');
  }
});

// Handle window resize dynamically across laptop and phone screens
window.addEventListener('resize', () => {
  if (mapInstance) {
    mapInstance.invalidateSize();
  }
});
