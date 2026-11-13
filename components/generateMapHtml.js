export function getMapHtml(initialCoords, customers = []) {
  const initLat = (initialCoords && typeof initialCoords.lat === 'number') ? initialCoords.lat : -7.1539;
  const initLng = (initialCoords && typeof initialCoords.lng === 'number') ? initialCoords.lng : 112.6561;

  const parseVal = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return (!isNaN(v) && isFinite(v) && v !== 0) ? v : null;
    if (typeof v === 'string') {
      const s = v.trim().replace(',', '.');
      if (!s || s === '-' || s === '0' || s.toLowerCase() === 'null' || s.toLowerCase() === 'nan') return null;
      const num = parseFloat(s);
      return (!isNaN(num) && isFinite(num) && num !== 0) ? num : null;
    }
    return null;
  };

  const sanitizeLatLng = (rawLat, rawLng) => {
    if (rawLat === null || rawLng === null) return null;
    let lat = rawLat;
    let lng = rawLng;
    if (lat > 50 && lng < 20) {
      const temp = lat;
      lat = lng;
      lng = temp;
    }
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)) {
      return { lat, lng };
    }
    return null;
  };

  // Ekstrak & sanitasi data koordinat pelanggan asli (100% selaras dengan Daftar Tagihan)
  const sanitizedCustomers = Array.isArray(customers)
    ? customers
        .map((c, index) => {
          if (!c) return null;
          let lat = null;
          let lng = null;

          const directLat = parseVal(c.lat !== undefined ? c.lat : c.latitude);
          const directLng = parseVal(c.lng !== undefined ? c.lng : c.longitude);
          const directRes = sanitizeLatLng(directLat, directLng);
          if (directRes) {
            lat = directRes.lat;
            lng = directRes.lng;
          } else if (c.koordinat && typeof c.koordinat === 'string') {
            const cleanStr = c.koordinat.replace(/[()]/g, '').trim();
            if (cleanStr && cleanStr !== '-' && cleanStr !== '0' && cleanStr !== '0,0' && cleanStr !== '0, 0') {
              const parts = cleanStr.includes(';') ? cleanStr.split(';') : cleanStr.split(',');
              if (parts.length >= 2) {
                const strRes = sanitizeLatLng(parseVal(parts[0]), parseVal(parts[1]));
                if (strRes) {
                  lat = strRes.lat;
                  lng = strRes.lng;
                }
              }
            }
          } else if (c._coords && typeof c._coords === 'object') {
            const coordsRes = sanitizeLatLng(
              parseVal(c._coords.lat !== undefined ? c._coords.lat : c._coords.latitude),
              parseVal(c._coords.lng !== undefined ? c._coords.lng : c._coords.longitude)
            );
            if (coordsRes) {
              lat = coordsRes.lat;
              lng = coordsRes.lng;
            }
          }

          if (lat === null || lng === null) return null;

          return {
            id: String(c.id || c.tagihanId || Math.random()),
            nama: String(c.nama || c.name || 'Pelanggan'),
            noSmb: String(c.noSmb || c.smb || c.nomorSmb || c.no_smb || c.nosmb || ''),
            fotoPersil: c.fotoPersil || null,
            lat,
            lng,
          };
        })
        .filter(Boolean)
    : [];

  let startLat = initLat;
  let startLng = initLng;
  if (sanitizedCustomers.length > 0 && typeof sanitizedCustomers[0].lat === 'number' && typeof sanitizedCustomers[0].lng === 'number') {
    startLat = sanitizedCustomers[0].lat;
    startLng = sanitizedCustomers[0].lng;
  }

  const customersJson = JSON.stringify(sanitizedCustomers);

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <!-- Kebijakan Keamanan Terbuka Bebas Blokir untuk Semua CDN, Script, Tile, dan API Rute -->
  <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob: gap: https: http:; script-src * 'unsafe-inline' 'unsafe-eval' data: blob: https: http:; style-src * 'unsafe-inline' data: blob: https: http:; img-src * data: blob: https: http:; connect-src * https: http: ws: wss:; font-src * data: https: http:;" />
  <title>Google Maps Rute Tagihan PDAM Real-Time</title>
  
  <!-- Leaflet CSS (Multi-CDN Anti-Blokir: unpkg -> cdnjs) -->
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" onerror="this.onerror=null;this.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';" />
  
  <!-- Leaflet JS (Multi-CDN Anti-Blokir dengan Failover Otomatis) -->
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    if (typeof L === 'undefined') {
      document.write('<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"><\\/script>');
    }
  </script>
  <script>
    if (typeof L === 'undefined') {
      document.write('<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"><\\/script>');
    }
  </script>

  <!-- Leaflet Rotate Plugin (dengan fallback failover) -->
  <script src="https://unpkg.com/leaflet-rotate@0.5.2/dist/leaflet-rotate.js" onerror="this.onerror=null;var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/leaflet-rotate@0.5.2/dist/leaflet-rotate.js';document.head.appendChild(s);"></script>

  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    html, body, #map {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: #e5e7eb;
      touch-action: none;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
    }

    /* Top Floating Search Bar */
    .top-controls {
      position: absolute;
      top: 12px;
      left: 12px;
      right: 12px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .search-box {
      display: flex;
      align-items: center;
      background: #ffffff;
      border-radius: 14px;
      padding: 6px 12px;
      box-shadow: 0 4px 14px rgba(15, 23, 42, 0.16);
      border: 1px solid #e2e8f0;
    }
    .search-icon {
      font-size: 16px;
      color: #64748b;
      margin-right: 8px;
    }
    .search-input {
      flex: 1;
      border: none;
      outline: none;
      font-size: 13.5px;
      color: #0f172a;
      background: transparent;
    }
    .search-input::placeholder {
      color: #94a3b8;
    }
    .clear-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px 8px;
      font-size: 14px;
      color: #64748b;
      border-radius: 6px;
    }
    .search-action-btn {
      background: #07326e;
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 12px;
      margin-left: 6px;
      border-radius: 10px;
      border: none;
      cursor: pointer;
    }
    .search-action-btn:hover {
      background: #0a3871;
    }

    /* Autocomplete Suggestions */
    .suggestions-list {
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.2);
      border: 1px solid #e2e8f0;
      max-height: 180px;
      overflow-y: auto;
      display: none;
    }
    .suggestion-item {
      padding: 10px 14px;
      font-size: 12.5px;
      color: #334155;
      border-bottom: 1px solid #f1f5f9;
      cursor: pointer;
      display: flex;
      align-items: center;
    }
    .suggestion-item:last-child {
      border-bottom: none;
    }
    .suggestion-item:hover, .suggestion-item:active {
      background: #f8fafc;
      color: #07326e;
      font-weight: 600;
    }
    .suggestion-item span {
      margin-right: 8px;
    }

    /* Quick Badges below search */
    .chip-row {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding: 2px 0;
    }
    .chip {
      background: rgba(255, 255, 255, 0.95);
      border: 1px solid #cbd5e1;
      padding: 5px 11px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      color: #1e293b;
      cursor: pointer;
      white-space: nowrap;
      box-shadow: 0 2px 6px rgba(0,0,0,0.08);
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .chip.active {
      background: #07326e;
      color: #ffffff;
      border-color: #07326e;
    }
    .chip.following {
      background: #059669;
      color: #ffffff;
      border-color: #059669;
    }


    /* Custom GPS Marker Pulse Radar dengan Pergerakan Halus & Panah Arah Hadap */
    .gps-ring-container {
      width: 32px;
      height: 32px;
      position: relative;
      pointer-events: none;
    }
    .gps-marker-ring {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(37, 99, 235, 0.25);
      border: 1.5px solid rgba(37, 99, 235, 0.7);
      animation: ring-pulse 1.8s infinite ease-out;
    }
    .gps-marker-core {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #2563eb;
      position: absolute;
      top: 8px;
      left: 8px;
      border: 3px solid #ffffff;
      box-shadow: 0 0 12px rgba(37, 99, 235, 0.9);
    }
    /* Panah Arah Hadap pada Marker GPS */
    .gps-heading-cone {
      position: absolute;
      top: -14px;
      left: 8px;
      width: 16px;
      height: 16px;
      transform-origin: 8px 30px;
      transition: transform 0.2s ease-out;
      pointer-events: none;
      display: none;
    }
    @keyframes ring-pulse {
      0% { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(2.2); opacity: 0; }
    }

    /* Tooltip Penanda Lokasi Saya */
    .my-location-tooltip {
      background-color: #2563eb !important;
      color: #ffffff !important;
      font-weight: 800 !important;
      font-size: 11.5px !important;
      padding: 3px 9px !important;
      border-radius: 12px !important;
      border: 1.5px solid #ffffff !important;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.45) !important;
      white-space: nowrap !important;
      pointer-events: none !important;
      user-select: none !important;
      -webkit-user-select: none !important;
    }
    .my-location-tooltip::before {
      border-top-color: #2563eb !important;
    }

    /* Custom Pin Marker Pelanggan */
    .custom-customer-pin {
      background: transparent !important;
      border: none !important;
    }

    /* Tooltip & Popup Nama Pelanggan pada Maps (Hanya Nama Pelanggan Saja) */
    .customer-name-tooltip {
      background-color: #07326e !important;
      color: #ffffff !important;
      font-weight: 700 !important;
      font-size: 12px !important;
      padding: 4px 9px !important;
      border-radius: 6px !important;
      border: 1.5px solid #ffffff !important;
      box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3) !important;
      white-space: nowrap !important;
      pointer-events: auto !important;
      cursor: pointer !important;
      user-select: none !important;
      -webkit-user-select: none !important;
      transition: transform 0.15s ease, background-color 0.15s ease;
    }
    .customer-name-tooltip:active {
      transform: scale(0.94);
      background-color: #0a3871 !important;
    }
    .customer-name-tooltip::before {
      border-top-color: #07326e !important;
    }
    .leaflet-popup-content {
      margin: 8px 12px !important;
      line-height: 1.3 !important;
    }

    /* Floating Zoom Controls (+ / -) */
    .floating-zoom-container {
      position: absolute;
      bottom: 22px;
      right: 14px;
      z-index: 999;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .floating-zoom-btn {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.96);
      color: #07326e;
      border: 1px solid #cbd5e1;
      font-size: 22px;
      font-weight: 700;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 14px rgba(15, 23, 42, 0.2);
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      touch-action: manipulation;
      transition: transform 0.12s ease, background 0.15s ease;
    }
    .floating-zoom-btn:active {
      transform: scale(0.92);
      background: #e2e8f0;
    }
  </style>
</head>
<body>
  <div id="map"></div>

  <!-- Floating Zoom In / Zoom Out Controls (Ultra Halus) -->
  <div class="floating-zoom-container">
    <button id="btn-zoom-in" class="floating-zoom-btn" type="button" aria-label="Perbesar">+</button>
    <button id="btn-zoom-out" class="floating-zoom-btn" type="button" aria-label="Perkecil">−</button>
  </div>

  <!-- Top Search Controls -->
  <div class="top-controls">
    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input
        type="text"
        id="search-input"
        class="search-input"
        placeholder="Cari No. SMB rute (xx-xxxxx)..."
        autocomplete="off"
        inputmode="numeric"
        maxlength="8"
      />
      <button id="clear-btn" class="clear-btn" style="display:none;">✕</button>
      <button id="search-btn" class="search-action-btn">Cari</button>
    </div>

    <!-- Autocomplete Results -->
    <div id="suggestions" class="suggestions-list"></div>

    <!-- Quick Filter Chips -->
    <div class="chip-row">
      <div id="chip-follow" class="chip">🎯 Ikuti Posisi Saya</div>
      <div id="chip-heading" class="chip">🧭 Sesuai Arah</div>
      <div id="chip-rute" class="chip active">🛣️ Rute Jalan Pelanggan</div>
      <div id="chip-layer" class="chip">🛰️ Peta Satelit</div>
    </div>
  </div>


  <!-- Standalone Photo Viewer Modal Fallback -->
  <div id="standalone-photo-modal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(15,23,42,0.85); z-index:9999; flex-direction:column; justify-content:center; align-items:center; padding:16px; backdrop-filter:blur(4px);">
    <div style="width:100%; max-width:380px; background:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 12px 36px rgba(0,0,0,0.4); display:flex; flex-direction:column;">
      <div style="background:#07326e; color:#ffffff; padding:12px 16px; display:flex; justify-content:space-between; align-items:center;">
        <span id="standalone-modal-title" style="font-size:13.5px; font-weight:700;">Foto Persil</span>
        <button id="standalone-modal-close" style="background:none; border:none; color:#ffffff; font-size:18px; cursor:pointer; padding:2px 8px; border-radius:6px;">✕</button>
      </div>
      <div id="standalone-modal-body" style="padding:14px; text-align:center; min-height:160px; display:flex; justify-content:center; align-items:center;">
      </div>
    </div>
  </div>

  <!-- Map Script -->
  <script>
    let currentLat = ${startLat};
    let currentLng = ${startLng};
    let userGpsLat = ${initLat};
    let userGpsLng = ${initLng};
    let followUser = false; // Mode otomatis mengikuti pergerakan pengguna (non-aktif secara default agar peta fokus ke rute pelanggan)
    let hasInitializedRoute = false;
    let isMapZooming = false;
    let isUserTouching = false;
    let pendingLocationUpdate = null;

    // Pastikan L.version kompatibel dengan leaflet-rotate untuk penanganan animasi vektor
    if (typeof L !== 'undefined') {
      L.version = '1.9.3';
    }

    // Helper konversi titik sentuh ke koordinat kontainer peta
    function getTouchPoint(mapInstance, touch) {
      const container = mapInstance.getContainer();
      const rect = container.getBoundingClientRect();
      return new L.Point(
        touch.clientX - rect.left - container.clientLeft,
        touch.clientY - rect.top - container.clientTop
      );
    }

    // 1. Penanganan Renderer Transform agar Garis Rute Menyatu dengan Peta (Anti-Drift / Anti-Geser seperti Google Maps)
    try {
      if (typeof L !== 'undefined' && L.Renderer) {
        const origUpdateTransform = L.Renderer.prototype._updateTransform;
        L.Renderer.prototype._updateTransform = function(center, zoom) {
          // Ketika peta dalam orientasi normal (menghadap Utara), gunakan proyeksi standar Leaflet yang 100% presisi sub-pixel
          if (!this._map || !this._map._rotate || Math.abs(this._map._bearing || 0) < 0.05) {
            const scale = this._map.getZoomScale(zoom, this._zoom);
            const viewHalf = this._map.getSize().multiplyBy(0.5 + (this.options.padding || 0.1));
            const currentCenterPoint = this._map.project(this._center, zoom);
            const topLeftOffset = viewHalf.multiplyBy(-scale).add(currentCenterPoint)
              .subtract(this._map._getNewPixelOrigin(center, zoom));
            L.DomUtil.setTransform(this._container, topLeftOffset, scale);
            return;
          }
          return origUpdateTransform.apply(this, arguments);
        };
      }
    } catch (e) {
      console.warn('Renderer transform patch error:', e);
    }

    // 1. Inisialisasi Peta & Layer Google Maps dengan Dukungan Rotasi Peta Penuh & Zoom Ultra Halus
    const hasRotate = typeof L !== 'undefined' && typeof L.Map !== 'undefined' && typeof L.Map.prototype.setBearing === 'function';

    const mapOptions = {
      preferCanvas: true, // AKTIF: Satukan layer vektor rute ke dalam Canvas hardware-accelerated seperti Google Maps
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 0.5, // Snap halus per 0.5 level agar tile tajam tanpa efek reload
      zoomDelta: 0.5, // Perubahan zoom naik/turun bertahap dan halus
      wheelPxPerZoomLevel: 120,
      wheelDebounceTime: 60,
      zoomAnimation: true, // Animasi transisi zoom CSS mulus
      zoomAnimationThreshold: 8,
      fadeAnimation: true, // Transisi gambar antar level zoom memudar mulus
      markerZoomAnimation: true, // Marker skala mulus dengan hardware transform
      bounceAtZoomLimits: false, // Hindari efek membal kasar saat batas zoom tercapai
      touchZoom: true,
      tap: false,
    };

    if (hasRotate) {
      mapOptions.rotate = true;
      mapOptions.touchRotate = true; // AKTIF: Peta bisa diputar bebas dengan 2 jari
      mapOptions.rotateControl = false;
      mapOptions.bearing = 0;
    }

    const map = L.map('map', mapOptions).setView([currentLat, currentLng], 15);

    // Pastikan ukuran kontainer peta segera terdeteksi akurat saat WebView / iframe selesai dimuat
    setTimeout(function() { if (map && typeof map.invalidateSize === 'function') map.invalidateSize(false); }, 100);
    setTimeout(function() { if (map && typeof map.invalidateSize === 'function') map.invalidateSize(false); }, 300);
    setTimeout(function() { if (map && typeof map.invalidateSize === 'function') map.invalidateSize(false); }, 700);
    setTimeout(function() { if (map && typeof map.invalidateSize === 'function') map.invalidateSize(false); }, 1400);

    // Opsi Tile Layer Anti-Reload saat Pinch/Zoom (Ultra Halus 60 FPS)
    const tileOptions = {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      updateWhenZooming: false, // JANGAN reload atau hapus tile selama proses cubit/zoom (biarkan CSS transform bekerja)
      updateWhenIdle: true,    // Hanya unduh tile baru setelah gerakan zoom berhenti
      keepBuffer: 6,           // Simpan cache tile sekitar agar tidak muncul kotak putih kosong saat zoom
    };

    const googleRoads = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', tileOptions);

    const googleHybrid = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', tileOptions);

    const osmFallback = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
      updateWhenZooming: false,
      updateWhenIdle: true,
      keepBuffer: 6,
    });

    let currentLayer = 'roads';
    googleRoads.addTo(map);

    function toggleLayer() {
      if (currentLayer === 'roads') {
        map.removeLayer(googleRoads);
        googleHybrid.addTo(map);
        currentLayer = 'hybrid';
        document.getElementById('chip-layer').classList.add('active');
        document.getElementById('chip-layer').innerText = '🗺️ Peta Jalan';
      } else {
        map.removeLayer(googleHybrid);
        googleRoads.addTo(map);
        currentLayer = 'roads';
        document.getElementById('chip-layer').classList.remove('active');
        document.getElementById('chip-layer').innerText = '🛰️ Peta Satelit';
      }
    }

    document.getElementById('chip-layer').addEventListener('click', toggleLayer);

    // 2. Marker Radar GPS Saya & Variabel Rute
    let gpsRadarMarker = null;
    let gpsAccuracyCircle = null;
    let isProgrammaticMove = false;

    function createOrUpdateGpsMarker(lat, lng, accuracy, heading) {
      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return;
      currentLat = lat;
      currentLng = lng;
      userGpsLat = lat;
      userGpsLng = lng;

      const acc = (typeof accuracy === 'number' && accuracy > 0 && accuracy < 150) ? accuracy : 15;

      if (!gpsRadarMarker) {
        const gpsIcon = L.divIcon({
          className: 'gps-ring-container',
          html: '<div class="gps-marker-ring"><div class="gps-marker-core"></div></div>' +
                '<div id="gps-heading-cone" class="gps-heading-cone">' +
                  '<svg viewBox="0 0 16 16" width="16" height="16">' +
                    '<polygon points="8,0 15,15 8,11 1,15" fill="#2563EB" />' +
                  '</svg>' +
                '</div>',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });
        gpsRadarMarker = L.marker([lat, lng], { icon: gpsIcon, zIndexOffset: 2000 }).addTo(map);
      } else {
        gpsRadarMarker.setLatLng([lat, lng]);
      }

      if (!gpsAccuracyCircle) {
        gpsAccuracyCircle = L.circle([lat, lng], {
          radius: acc,
          color: '#2563eb',
          weight: 1.5,
          fillColor: '#3b82f6',
          fillOpacity: 0.08
        }).addTo(map);
      } else {
        gpsAccuracyCircle.setLatLng([lat, lng]);
        gpsAccuracyCircle.setRadius(acc);
      }

      if (typeof heading === 'number' && !isNaN(heading) && heading >= 0) {
        applyHeadingUpdate(heading);
      }
    }

    // Tampilkan posisi saya langsung di peta sejak awal jika koordinat tersedia
    if (typeof userGpsLat === 'number' && typeof userGpsLng === 'number' && !isNaN(userGpsLat) && !isNaN(userGpsLng)) {
      createOrUpdateGpsMarker(userGpsLat, userGpsLng, 15, null);
    }

    // 3. Rute Titik Koordinat Real Pelanggan PDAM (Sesuai Rute Jalan Asli)
    let initialCustomers = ${JSON.stringify(sanitizedCustomers)};
    if (!Array.isArray(initialCustomers)) initialCustomers = [];
    let customerMarkers = [];
    let routeBgPolyline = null;
    let routePolyline = null;
    let lastRoadPoints = null;
    let isRouteVisible = true;
    let currentValidCustomers = [];
    let isFetchingRoute = false;
    let lastRouteOriginLat = null;
    let lastRouteOriginLng = null;
    let lastPanLat = null;
    let lastPanLng = null;
    let hasReceivedNativeGps = false;
    let hasFittedInitialBounds = false;
    let userHasInteractedWithMap = false;

    // Helper Pusatkan Peta Membingkai Seluruh Titik Pelanggan & Posisi Saya
    function fitMapToRoute(force = false) {
      if (!map) return;
      // Jika pengguna sudah pernah zoom atau geser peta secara manual, JANGAN PERNAH zoom out otomatis
      // kecuali dipicu secara eksplisit (force === true, misalnya saat tombol chip rute ditekan)
      if (!force && (hasFittedInitialBounds || userHasInteractedWithMap)) {
        return;
      }
      hasFittedInitialBounds = true;

      try {
        if (typeof map.invalidateSize === 'function') map.invalidateSize(false);
      } catch(e) {}

      const points = [];
      if (Array.isArray(currentValidCustomers) && currentValidCustomers.length > 0) {
        currentValidCustomers.forEach(c => {
          if (typeof c.lat === 'number' && typeof c.lng === 'number' && !isNaN(c.lat) && !isNaN(c.lng) && c.lat !== 0 && c.lng !== 0) {
            points.push([c.lat, c.lng]);
          }
        });
      }

      if (points.length === 0) {
        if (typeof userGpsLat === 'number' && typeof userGpsLng === 'number' && !isNaN(userGpsLat)) {
          map.setView([userGpsLat, userGpsLng], 15);
        }
        return;
      }

      // Jika lokasi saya tersedia dan dalam radius wajar (< 50 km) dengan pelanggan pertama, sertakan posisi saya
      if (typeof userGpsLat === 'number' && typeof userGpsLng === 'number' && !isNaN(userGpsLat) && userGpsLat !== 0) {
        const dist = calculateDistanceMeters(userGpsLat, userGpsLng, points[0][0], points[0][1]);
        if (dist <= 50000) {
          points.push([userGpsLat, userGpsLng]);
        }
      }

      try {
        const bounds = L.latLngBounds(points);
        if (bounds && bounds.isValid()) {
          isProgrammaticMove = true;
          map.fitBounds(bounds, { padding: [55, 55], maxZoom: 16 });
          setTimeout(function() { isProgrammaticMove = false; }, 900);
        }
      } catch(e) {
        console.warn('Gagal fitBounds:', e);
      }
    }

    window.fitMapToRoute = fitMapToRoute;

    function scheduleFitRoute() {
      setTimeout(function() {
        if (!userHasInteractedWithMap && !hasFittedInitialBounds) {
          if (map && typeof map.invalidateSize === 'function') map.invalidateSize(false);
          fitMapToRoute(false);
        }
      }, 100);
      setTimeout(function() {
        if (!userHasInteractedWithMap && !hasFittedInitialBounds) {
          if (map && typeof map.invalidateSize === 'function') map.invalidateSize(false);
          fitMapToRoute(false);
        }
      }, 350);
      setTimeout(function() {
        if (!userHasInteractedWithMap && !hasFittedInitialBounds) {
          if (map && typeof map.invalidateSize === 'function') map.invalidateSize(false);
          fitMapToRoute(false);
        }
      }, 800);
    }

    // Satu Layer Canvas untuk Garis Rute (Terkunci Menjadi Satu Kesatuan dengan Peta seperti Google Maps)
    const routeCanvasRenderer = L.canvas({ padding: 0.5 });

    // Helper Menggambar & Memperbarui Garis Rute (Kontras Tinggi & Mulus)
    function updateRouteDisplay(points) {
      if (!Array.isArray(points) || points.length < 2 || !isRouteVisible) {
        if (routeBgPolyline) { map.removeLayer(routeBgPolyline); routeBgPolyline = null; }
        if (routePolyline) { map.removeLayer(routePolyline); routePolyline = null; }
        return;
      }
      lastRoadPoints = points;

      // 1. Lapisan Border Putih Luar agar garis selalu kontras terlihat di atas peta satelit maupun peta jalan
      if (!routeBgPolyline) {
        routeBgPolyline = L.polyline(points, {
          renderer: routeCanvasRenderer,
          color: '#FFFFFF',
          weight: 9,
          opacity: 0.95,
          lineJoin: 'round',
          lineCap: 'round',
          interactive: false,
        }).addTo(map);
      } else {
        if (!map.hasLayer(routeBgPolyline)) routeBgPolyline.addTo(map);
        routeBgPolyline.setLatLngs(points);
      }

      // 2. Lapisan Inti Garis Biru PDAM (Satu Layer dengan Border Putih & Tile Peta)
      if (!routePolyline) {
        routePolyline = L.polyline(points, {
          renderer: routeCanvasRenderer,
          color: '#0284c7',
          weight: 5.5,
          opacity: 0.96,
          lineJoin: 'round',
          lineCap: 'round',
          smoothFactor: 1.2,
          interactive: false,
        }).addTo(map);
      } else {
        if (!map.hasLayer(routePolyline)) routePolyline.addTo(map);
        routePolyline.setLatLngs(points);
      }
    }

    // Perhitungan jarak meter antara dua koordinat (Haversine)
    function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    // Baca dan gambar rute jalan asli dari lokasi saya ke pelanggan via OSRM (BUKAN garis lurus)
    function fetchAndDrawRoadRoute(originLat, originLng, custList, shouldFitBounds = false) {
      if (!isRouteVisible) return;
      if (!Array.isArray(custList) || custList.length === 0) return;

      const validTargets = custList.filter(
        c => typeof c.lat === 'number' && typeof c.lng === 'number' && !isNaN(c.lat) && !isNaN(c.lng) && c.lat !== 0 && c.lng !== 0
      );
      if (validTargets.length === 0) return;

      // Tentukan titik awal rute:
      // Mulai rute dari Lokasi Saya (posisi GPS) -> seluruh pelanggan pada daftar tagihan
      let routePoints = [];
      const originLatToUse = (typeof userGpsLat === 'number' && userGpsLat !== 0) ? userGpsLat : originLat;
      const originLngToUse = (typeof userGpsLng === 'number' && userGpsLng !== 0) ? userGpsLng : originLng;

      let distFromUserToFirst = 999999;
      if (typeof originLatToUse === 'number' && typeof originLngToUse === 'number' && validTargets.length > 0) {
        distFromUserToFirst = calculateDistanceMeters(originLatToUse, originLngToUse, validTargets[0].lat, validTargets[0].lng);
      }

      if (typeof originLatToUse === 'number' && typeof originLngToUse === 'number' && originLatToUse !== 0 && distFromUserToFirst <= 50000) {
        // Jika lokasi saya tersedia dan dalam radius wajar (<= 50 km), hubungkan posisi saya ke seluruh pelanggan
        routePoints = [[originLatToUse, originLngToUse], ...validTargets.map(c => [c.lat, c.lng])];
      } else {
        // Jika posisi saya belum siap atau jauh (> 50 km), hubungkan antar pelanggan rute
        routePoints = validTargets.map(c => [c.lat, c.lng]);
        if (routePoints.length === 1 && typeof originLatToUse === 'number' && typeof originLngToUse === 'number') {
          // Khusus jika hanya 1 pelanggan, hubungkan ke posisi saya
          routePoints = [[originLatToUse, originLngToUse], [validTargets[0].lat, validTargets[0].lng]];
        }
      }

      // 1. Gambar rute penghubung langsung terlebih dahulu (instan SVG) agar rute PASTI langsung tampil tanpa jeda
      if (routePoints.length >= 2) {
        updateRouteDisplay(routePoints);
      }

      if (shouldFitBounds && !userHasInteractedWithMap && !hasFittedInitialBounds) {
        fitMapToRoute(false);
      }

      const chip = document.getElementById('chip-rute');
      if (chip && isRouteVisible) {
        chip.innerText = '🛣️ Rute Jalan (' + validTargets.length + ' Pelanggan)';
      }

      if (routePoints.length < 2) return;

      isFetchingRoute = true;

      // 2. Ambil rute jalan riil dari OSRM (batasi maksimal 12 titik waypoints per panggilan agar respon instan & anti-timeout)
      const chunkWaypoints = routePoints.slice(0, 12);
      let canQueryOsrm = true;
      for (let i = 0; i < chunkWaypoints.length - 1; i++) {
        const d = calculateDistanceMeters(chunkWaypoints[i][0], chunkWaypoints[i][1], chunkWaypoints[i+1][0], chunkWaypoints[i+1][1]);
        if (d > 40000) { canQueryOsrm = false; break; }
      }

      if (!canQueryOsrm) {
        isFetchingRoute = false;
        return;
      }

      const waypoints = chunkWaypoints.map(pt => pt[1].toFixed(6) + ',' + pt[0].toFixed(6)).join(';');
      const osrmUrl = 'https://router.project-osrm.org/route/v1/driving/' + waypoints + '?overview=full&geometries=geojson';

      fetch(osrmUrl)
        .then(res => res.json())
        .then(data => {
          isFetchingRoute = false;
          if (data && data.code === 'Ok' && data.routes && data.routes[0]) {
            const route = data.routes[0];
            const roadPoints = route.geometry.coordinates.map(pt => [pt[1], pt[0]]);
            updateRouteDisplay(roadPoints);

            const distMeters = route.distance;
            const distFormatted = distMeters < 1000
              ? Math.round(distMeters) + ' m'
              : (distMeters / 1000).toFixed(1) + ' km';

            if (chip && isRouteVisible) {
              chip.innerText = '🛣️ Rute Jalan: ' + distFormatted;
              chip.classList.add('active');
            }
          }
        })
        .catch(err => {
          isFetchingRoute = false;
          console.warn('Gagal membaca rute jalan OSRM (menggunakan garis rute langsung):', err);
        });
    }

    window.triggerShowFotoPersilById = function(id) {
      const found = currentValidCustomers.find(c => String(c.id) === String(id));
      if (found) {
        triggerShowFotoPersil(found);
      }
    };

    function triggerShowFotoPersil(cust) {
      if (!cust) return;
      const smb = cust.noSmb || cust.nama || 'Pelanggan';
      const payload = {
        type: 'OPEN_FOTO_PERSIL',
        id: cust.id,
        noSmb: cust.noSmb || '',
        nama: cust.nama || '',
        fotoPersil: cust.fotoPersil || null
      };

      let sent = false;
      if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        sent = true;
      }
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(JSON.stringify(payload), '*');
        sent = true;
      }

      // Jika berjalan mandiri tanpa host React Native / iframe, gunakan modal bawaan HTML
      if (!sent) {
        showStandalonePhotoModal(cust);
      }
    }

    function showStandalonePhotoModal(cust) {
      const modal = document.getElementById('standalone-photo-modal');
      const title = document.getElementById('standalone-modal-title');
      const body = document.getElementById('standalone-modal-body');
      const closeBtn = document.getElementById('standalone-modal-close');
      if (!modal || !title || !body) return;

      const smb = cust.noSmb || cust.nama || 'Pelanggan';
      title.innerText = 'Foto Persil - SMB ' + smb;
      if (cust.fotoPersil) {
        body.innerHTML = '<img src="' + cust.fotoPersil + '" style="max-width:100%; max-height:55vh; border-radius:10px; object-fit:contain; box-shadow:0 4px 12px rgba(0,0,0,0.15);" alt="Foto Persil" />';
      } else {
        body.innerHTML = '<div style="color:#64748B; font-size:13px; padding:24px; font-weight:500;">Foto persil untuk No. SMB ' + smb + ' belum tersedia.</div>';
      }
      modal.style.display = 'flex';
      if (closeBtn) {
        closeBtn.onclick = function() {
          modal.style.display = 'none';
        };
      }
      modal.onclick = function(e) {
        if (e.target === modal) modal.style.display = 'none';
      };
    }

    function renderRealCustomerMarkers(rawList, isInitial = false) {
      customerMarkers.forEach(m => map.removeLayer(m));
      customerMarkers = [];

      if (!Array.isArray(rawList)) return;

      const parseVal = (v) => {
        if (v === null || v === undefined) return null;
        if (typeof v === 'number') return (!isNaN(v) && isFinite(v) && v !== 0) ? v : null;
        if (typeof v === 'string') {
          const s = v.trim().replace(',', '.');
          if (!s || s === '-' || s === '0' || s.toLowerCase() === 'null' || s.toLowerCase() === 'nan') return null;
          const num = parseFloat(s);
          return (!isNaN(num) && isFinite(num) && num !== 0) ? num : null;
        }
        return null;
      };

      const sanitizeLatLng = (rawLat, rawLng) => {
        if (rawLat === null || rawLng === null) return null;
        let lat = rawLat;
        let lng = rawLng;
        if (lat > 50 && lng < 20) {
          const temp = lat;
          lat = lng;
          lng = temp;
        }
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)) {
          return { lat, lng };
        }
        return null;
      };

      const validList = rawList.map((c) => {
        if (!c) return null;
        let lat = null;
        let lng = null;

        const directLat = parseVal(c.lat !== undefined ? c.lat : c.latitude);
        const directLng = parseVal(c.lng !== undefined ? c.lng : c.longitude);
        const directRes = sanitizeLatLng(directLat, directLng);
        if (directRes) {
          lat = directRes.lat;
          lng = directRes.lng;
        } else if (c.koordinat && typeof c.koordinat === 'string') {
          const cleanStr = c.koordinat.replace(/[()]/g, '').trim();
          if (cleanStr && cleanStr !== '-' && cleanStr !== '0' && cleanStr !== '0,0' && cleanStr !== '0, 0') {
            const parts = cleanStr.includes(';') ? cleanStr.split(';') : cleanStr.split(',');
            if (parts.length >= 2) {
              const strRes = sanitizeLatLng(parseVal(parts[0]), parseVal(parts[1]));
              if (strRes) {
                lat = strRes.lat;
                lng = strRes.lng;
              }
            }
          }
        } else if (c._coords && typeof c._coords === 'object') {
          const coordsRes = sanitizeLatLng(
            parseVal(c._coords.lat !== undefined ? c._coords.lat : c._coords.latitude),
            parseVal(c._coords.lng !== undefined ? c._coords.lng : c._coords.longitude)
          );
          if (coordsRes) {
            lat = coordsRes.lat;
            lng = coordsRes.lng;
          }
        }

        if (lat === null || lng === null) return null;

        return {
          id: String(c.id || c.tagihanId || Math.random()),
          nama: c.nama || c.name || 'Pelanggan',
          noSmb: c.noSmb || c.smb || c.nomorSmb || c.no_smb || c.nosmb || '',
          fotoPersil: c.fotoPersil || null,
          lat: lat,
          lng: lng
        };
      }).filter(Boolean);

      currentValidCustomers = validList;

      // Anti-tertumpuk: Deteksi koordinat pelanggan yang saling berdekatan / identik (jarak <= 12 meter)
      // dan berikan offset alami mikro (~8 meter) agar pin & label nomor SMB tidak saling menutupi
      const threshold = 0.00012; // ~12 meter
      const offsetDistance = 0.000075; // ~8 meter
      const assigned = new Set();

      for (let i = 0; i < validList.length; i++) {
        if (assigned.has(i)) continue;
        const group = [i];
        assigned.add(i);

        for (let j = i + 1; j < validList.length; j++) {
          if (assigned.has(j)) continue;
          const dLat = Math.abs(validList[i].lat - validList[j].lat);
          const dLng = Math.abs(validList[i].lng - validList[j].lng);
          if (dLat < threshold && dLng < threshold) {
            group.push(j);
            assigned.add(j);
          }
        }

        if (group.length > 1) {
          const count = group.length;
          group.forEach((itemIdx, k) => {
            let angle;
            if (count === 2) {
              angle = k === 0 ? Math.PI : 0; // Kiri dan kanan berdampingan
            } else {
              angle = (2 * Math.PI * k) / count - Math.PI / 2;
            }

            const latOffset = offsetDistance * Math.sin(angle);
            const lngOffset = offsetDistance * Math.cos(angle) / Math.cos(validList[itemIdx].lat * Math.PI / 180);

            validList[itemIdx].lat += latOffset;
            validList[itemIdx].lng += lngOffset;
          });
        }
      }

      validList.forEach((cust, idx) => {
        // Tampilkan hanya nomor SMB pelanggan pada pin maps rute tagihan (tanpa kata 'SMB')
        const smbRaw = (cust.noSmb || '').trim();
        const cleanSmb = smbRaw.replace(/^SMB[-:\\s_]*/i, '').trim();
        const displaySmb = cleanSmb || smbRaw || cust.nama || ('Pelanggan ' + (idx + 1));

        // Pin Marker Pelanggan PDAM Sesuai Koordinat Asli
        const customerPinSvg = '<svg width="28" height="42" viewBox="0 0 26 40" fill="none" xmlns="http://www.w3.org/2000/svg">' +
          '<path d="M13 0C5.82 0 0 5.82 0 13C0 22.75 13 40 13 40C13 40 26 22.75 26 13C26 5.82 20.18 0 13 0Z" fill="#0284C7"/>' +
          '<path d="M13 1C6.37 1 1 6.37 1 13C1 22.1 12.5 38.3 13 39C13.5 38.3 25 22.1 25 13C25 6.37 19.63 1 13 1Z" stroke="#FFFFFF" stroke-width="1.2"/>' +
          '<circle cx="13" cy="13" r="5" fill="#FFFFFF"/>' +
          '</svg>';

        const customerPinIcon = L.divIcon({
          className: 'custom-customer-pin',
          html: '<div style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35)); width: 28px; height: 42px;">' + customerPinSvg + '</div>',
          iconSize: [28, 42],
          iconAnchor: [14, 42],
          popupAnchor: [0, -42],
          tooltipAnchor: [0, -42]
        });

        const m = L.marker([cust.lat, cust.lng], { icon: customerPinIcon, zIndexOffset: 1000 + idx }).addTo(map);
        m._cust = cust;
        cust._marker = m;

        const handleSmbAction = () => {
          if (!m.isPopupOpen()) {
            m.openPopup();
          }
          triggerShowFotoPersil(cust);
        };

        // Cantumkan nomor SMB pelanggan pada tooltip permanen
        m.bindTooltip(displaySmb, {
          permanent: true,
          direction: 'top',
          className: 'customer-name-tooltip',
          offset: [0, -10],
          interactive: true
        });

        // Popup saat marker diklik menampilkan nomor SMB pelanggan & aksi lihat foto
        const popupEl = document.createElement('div');
        popupEl.style.cssText = 'font-size:13px; color:#07326E; text-align:center; padding:4px 8px; cursor:pointer; min-width:130px;';
        popupEl.innerHTML = '<div style="font-weight:800; font-size:13px; color:#07326E;">' + displaySmb + '</div>' +
          '<div style="font-size:11px; color:#64748B; margin:2px 0;">' + (cust.nama || '') + '</div>' +
          '<div style="font-size:11px; color:#0284C7; margin-top:4px; font-weight:700; background:#E0F2FE; padding:3px 6px; border-radius:6px;">📷 Lihat Foto Persil</div>';
        popupEl.onclick = handleSmbAction;
        m.bindPopup(popupEl);

        m.on('click', handleSmbAction);

        // Dengarkan klik langsung pada label nomor SMB tooltip
        const tt = m.getTooltip();
        if (tt && typeof tt.on === 'function') {
          tt.on('click', handleSmbAction);
        }

        m.on('tooltipopen', function(e) {
          if (e && e.tooltip && e.tooltip._container) {
            e.tooltip._container.style.cursor = 'pointer';
            e.tooltip._container.onclick = function(ev) {
              ev.stopPropagation();
              handleSmbAction();
            };
          }
        });

        customerMarkers.push(m);
      });

      // Hubungkan rute dan pusatkan peta ke seluruh pelanggan (hanya saat pemuatan awal & belum ada interaksi manual pengguna)
      if (validList.length > 0) {
        const shouldFit = isInitial && !userHasInteractedWithMap && !hasFittedInitialBounds;
        fetchAndDrawRoadRoute(currentLat, currentLng, validList, shouldFit);
        if (shouldFit) {
          fitMapToRoute(false);
        }
      } else {
        if (routeBgPolyline) {
          map.removeLayer(routeBgPolyline);
          routeBgPolyline = null;
        }
        if (routePolyline) {
          map.removeLayer(routePolyline);
          routePolyline = null;
        }
        const chip = document.getElementById('chip-rute');
        if (chip) chip.innerText = '🛣️ Rute Jalan (0 Pelanggan)';
      }

      if (isInitial && !userHasInteractedWithMap && !hasFittedInitialBounds) {
        scheduleFitRoute();
      }
    }

    function toggleRoute() {
      if (isRouteVisible) {
        // Jika rute sudah aktif, klik chip-rute akan memusatkan kembali peta ke seluruh rute (Fit to Route)
        userHasInteractedWithMap = false;
        fitMapToRoute(true);
      } else {
        isRouteVisible = true;
        customerMarkers.forEach(m => map.addLayer(m));
        if (currentValidCustomers.length > 0) {
          fetchAndDrawRoadRoute(currentLat, currentLng, currentValidCustomers, false);
        }
        const chip = document.getElementById('chip-rute');
        if (chip) chip.classList.add('active');
        userHasInteractedWithMap = false;
        fitMapToRoute(true);
      }
    }

    document.getElementById('chip-rute').addEventListener('click', toggleRoute);

    // 4. Update Koordinat
    function updateCoordinateInfo(lat, lng, label, accuracy) {
      currentLat = lat;
      currentLng = lng;
    }

    // 5. Menerima Koordinat Real-Time dari Native / Host App (Ultra Smooth)
    window.handleLocationUpdate = function(lat, lng, accuracy, heading) {
      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return;
      hasReceivedNativeGps = true;

      userGpsLat = lat;
      userGpsLng = lng;
      currentLat = lat;
      currentLng = lng;

      // Jika peta sedang aktif di-zoom oleh pengguna atau dalam animasi zoom, tunda update agar tidak loncat
      if (isMapZooming || isUserTouching || (map && map._animatingZoom)) {
        pendingLocationUpdate = { lat, lng, accuracy, heading };
        return;
      }

      // 1. Tampilkan dan perbarui marker posisi saya secara real-time
      createOrUpdateGpsMarker(lat, lng, accuracy, heading);

      // 2. Smooth Camera Follow: Kamera peta otomatis bergerak mengikuti posisi saya saat berjalan secara real-time
      if (followUser && !isMapZooming && !isUserTouching && !(map && map._animatingZoom)) {
        let distFromLastPan = 999;
        if (lastPanLat !== null && lastPanLng !== null) {
          distFromLastPan = calculateDistanceMeters(lastPanLat, lastPanLng, lat, lng);
        }
        // Ambang batas 1.5 meter: cukup sensitif untuk langkah kaki orang berjalan, sekaligus mencegah getaran micro-jitter
        if (distFromLastPan >= 1.5) {
          lastPanLat = lat;
          lastPanLng = lng;
          map.panTo([lat, lng], { animate: true, duration: 0.6, easeLinearity: 0.25 });
        }
      }

      // 3. Update rute jalan dari posisi saya ke pelanggan berikutnya secara real-time
      if (currentValidCustomers && currentValidCustomers.length > 0 && isRouteVisible && !isFetchingRoute && !isMapZooming && !isUserTouching) {
        let distFromLastRoute = 999;
        if (lastRouteOriginLat !== null && lastRouteOriginLng !== null) {
          distFromLastRoute = calculateDistanceMeters(lastRouteOriginLat, lastRouteOriginLng, lat, lng);
        }
        if (distFromLastRoute >= 15 || !routePolyline) {
          lastRouteOriginLat = lat;
          lastRouteOriginLng = lng;
          fetchAndDrawRoadRoute(lat, lng, currentValidCustomers, false);
        } else if (lastRoadPoints && lastRoadPoints.length > 0 && !userHasInteractedWithMap) {
          // Hubungkan titik awal garis rute polyline langsung ke posisi saya HANYA jika pengguna belum zoom/geser manual
          const updatedPoints = [[lat, lng], ...lastRoadPoints.slice(1)];
          updateRouteDisplay(updatedPoints);
        }
      }
    };

    // Update data pelanggan secara dinamis dari native/web
    let lastCustFingerprint = '';
    window.updateCustomersData = function(data) {
      let parsed = data;
      while (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch(e) { break; }
      }
      if (!Array.isArray(parsed)) return;

      const newFingerprint = parsed.map(c => {
        if (!c) return '';
        const id = c.id || c.tagihanId || c.noSmb || '';
        const lat = c.lat !== undefined ? c.lat : c.latitude;
        const lng = c.lng !== undefined ? c.lng : c.longitude;
        const foto = c.fotoPersil ? '1' : '0';
        return id + ':' + lat + ':' + lng + ':' + foto;
      }).join('|');

      if (newFingerprint && newFingerprint === lastCustFingerprint) {
        // Data pelanggan sama persis, jangan render ulang marker atau ubah posisi kamera
        return;
      }
      lastCustFingerprint = newFingerprint;

      // Render marker baru tanpa mereset zoom kamera jika pengguna sedang berinteraksi/zoom
      renderRealCustomerMarkers(parsed, false);
    };

    // 5b. Logika Rotasi Peta & Arah Hadap (Heading-Up & Free Rotation)
    let currentHeading = null;
    let isHeadingFollowActive = false;
    let lastBearingApplied = 0;

    function applyHeadingUpdate(heading) {
      if (typeof heading !== 'number' || isNaN(heading) || heading < 0) return;
      currentHeading = (heading % 360 + 360) % 360;

      // Update icon panah arah di marker GPS
      const cone = document.getElementById('gps-heading-cone');
      if (cone) {
        cone.style.display = 'block';
        if (!isHeadingFollowActive) {
          const mapBearing = map.getBearing ? map.getBearing() : 0;
          cone.style.transform = 'rotate(' + (currentHeading - mapBearing) + 'deg)';
        } else {
          cone.style.transform = 'rotate(0deg)';
        }
      }

      // Jika mode "Sesuai Arah" aktif, putar peta mengikuti arah perjalanan kita (jangan putar saat zoom sedang aktif)
      if (isHeadingFollowActive && map.setBearing && !isMapZooming && !isUserTouching && !(map && map._animatingZoom)) {
        const diff = Math.abs((currentHeading - lastBearingApplied + 540) % 360 - 180);
        if (diff >= 3.0) {
          lastBearingApplied = currentHeading;
          map.setBearing(currentHeading);
        }
      }
    }

    window.handleHeadingUpdate = function(heading) {
      applyHeadingUpdate(heading);
    };

    // Update cone marker arah hadap GPS setiap kali peta berputar
    map.on('rotate', function() {
      const bearing = map.getBearing ? map.getBearing() : 0;
      const cone = document.getElementById('gps-heading-cone');
      if (cone && !isHeadingFollowActive && currentHeading !== null) {
        cone.style.transform = 'rotate(' + (currentHeading - bearing) + 'deg)';
      }
    });

    // Jika pengguna memutar peta secara manual dengan 2 jari (touch gesture)
    map.on('rotatestart', function() {
      if (isHeadingFollowActive) {
        isHeadingFollowActive = false;
        const chipHeading = document.getElementById('chip-heading');
        if (chipHeading) {
          chipHeading.classList.remove('following');
          chipHeading.innerText = '🧭 Sesuai Arah';
        }
      }
    });

    // Reset ke arah Utara
    function resetNorth() {
      isHeadingFollowActive = false;
      const chipHeading = document.getElementById('chip-heading');
      if (chipHeading) {
        chipHeading.classList.remove('following');
        chipHeading.innerText = '🧭 Sesuai Arah';
      }
      if (map.setBearing) {
        map.setBearing(0);
      }
    }

    // Toggle Mode "Sesuai Arah"
    function toggleHeadingFollow() {
      isHeadingFollowActive = !isHeadingFollowActive;
      const chipHeading = document.getElementById('chip-heading');
      if (isHeadingFollowActive) {
        if (chipHeading) {
          chipHeading.classList.add('following');
          chipHeading.innerText = '🧭 Sesuai Arah (Aktif)';
        }
        if (currentHeading !== null && map.setBearing) {
          lastBearingApplied = currentHeading;
          map.setBearing(currentHeading);
        }
      } else {
        if (chipHeading) {
          chipHeading.classList.remove('following');
          chipHeading.innerText = '🧭 Sesuai Arah';
        }
      }
    }
    document.getElementById('chip-heading').addEventListener('click', toggleHeadingFollow);

    // Dengarkan pesan postMessage dari parent iframe / webview
    function handleMessageEvent(event) {
      let data = event.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch(e) { return; }
      }
      if (data && data.type === 'UPDATE_LOCATION') {
        window.handleLocationUpdate(data.lat, data.lng, data.accuracy, data.heading);
      } else if (data && data.type === 'UPDATE_HEADING') {
        window.handleHeadingUpdate(data.heading);
      } else if (data && data.type === 'UPDATE_CUSTOMERS') {
        window.updateCustomersData(data.customers);
      } else if (data && data.type === 'REFRESH_MAP') {
        if (typeof refreshMapAndRoute === 'function') {
          refreshMapAndRoute();
        }
      }
    }
    window.addEventListener('message', handleMessageEvent);
    document.addEventListener('message', handleMessageEvent);

    // 6. Geolocation Otomatis Mandiri di Browser / WebView (Hanya aktif jika native GPS belum aktif)
    function triggerAutoGPS() {
      if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
          function(pos) {
            if (hasReceivedNativeGps) return; // Prioritaskan GPS Native dari host app
            window.handleLocationUpdate(
              pos.coords.latitude,
              pos.coords.longitude,
              pos.coords.accuracy,
              pos.coords.heading
            );
          },
          function(err) {
            console.warn('Geolocation warning:', err);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
        );
      }

      if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', function(e) {
          let heading = null;
          if (typeof e.webkitCompassHeading === 'number') {
            heading = e.webkitCompassHeading;
          } else if (typeof e.alpha === 'number') {
            heading = (360 - e.alpha) % 360;
          }
          if (heading !== null && !isNaN(heading)) {
            applyHeadingUpdate(heading);
          }
        });
      }
    }
    triggerAutoGPS();

    // 7. Toggle Mode "Ikuti Posisi Saya"
    function toggleFollowUser() {
      if (!followUser) {
        followUser = true;
        lastPanLat = currentLat;
        lastPanLng = currentLng;
        const chipFollow = document.getElementById('chip-follow');
        if (chipFollow) {
          chipFollow.classList.add('following');
          chipFollow.innerText = '🎯 Ikuti Posisi Saya (Aktif)';
        }
        isProgrammaticMove = true;
        map.flyTo([currentLat, currentLng], 17, { duration: 0.8 });
        setTimeout(function() { isProgrammaticMove = false; }, 900);
      } else {
        followUser = false;
        const chipFollow = document.getElementById('chip-follow');
        if (chipFollow) {
          chipFollow.classList.remove('following');
          chipFollow.innerText = '🎯 Ikuti Posisi Saya';
        }
      }
    }

    document.getElementById('chip-follow').addEventListener('click', toggleFollowUser);

    function disableFollowUser() {
      if (isProgrammaticMove) return;
      if (!followUser) return;
      followUser = false;
      const chipFollow = document.getElementById('chip-follow');
      if (chipFollow) {
        chipFollow.classList.remove('following');
        chipFollow.innerText = '🎯 Ikuti Posisi Saya';
      }
    }

    // Jika pengguna menggeser atau zoom peta secara manual, tandai interaksi & nonaktifkan auto-follow
    map.on('dragstart', function() {
      if (!isProgrammaticMove) {
        userHasInteractedWithMap = true;
        disableFollowUser();
      }
    });
    map.on('zoomstart', function() {
      isMapZooming = true;
      if (!isProgrammaticMove) {
        userHasInteractedWithMap = true;
        disableFollowUser();
      }
    });
    map.on('zoomend', function() {
      isMapZooming = false;
      if (!isProgrammaticMove) {
        userHasInteractedWithMap = true;
      }
      if (pendingLocationUpdate) {
        const p = pendingLocationUpdate;
        pendingLocationUpdate = null;
        setTimeout(function() {
          if (!isMapZooming && !isUserTouching) {
            window.handleLocationUpdate(p.lat, p.lng, p.accuracy, p.heading);
          }
        }, 350);
      }
    });
    map.on('rotatestart', function() {
      if (!isProgrammaticMove) {
        userHasInteractedWithMap = true;
        disableFollowUser();
      }
    });
    map.on('rotateend', function() {
    });

    // Pastikan rute Leaflet tetap segar & tidak hilang saat kembali dari modal foto atau aplikasi lain
    function refreshMapAndRoute() {
      if (isMapZooming || isUserTouching) return;
      if (map && typeof map.invalidateSize === 'function') {
        map.invalidateSize(false);
      }
      if (lastRoadPoints && lastRoadPoints.length > 0 && isRouteVisible) {
        updateRouteDisplay(lastRoadPoints);
      } else if (currentValidCustomers && currentValidCustomers.length > 0 && isRouteVisible && !isFetchingRoute) {
        fetchAndDrawRoadRoute(userGpsLat, userGpsLng, currentValidCustomers, false);
      }
    }

    // Tombol Zoom In & Zoom Out Melayang (+ / -) untuk Zoom Cepat & Super Halus
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', function(e) {
        e.stopPropagation();
        userHasInteractedWithMap = true;
        disableFollowUser();
        if (map) map.zoomIn(0.5);
      });
    }
    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', function(e) {
        e.stopPropagation();
        userHasInteractedWithMap = true;
        disableFollowUser();
        if (map) map.zoomOut(0.5);
      });
    }

    window.refreshMapAndRoute = refreshMapAndRoute;
    window.addEventListener('focus', refreshMapAndRoute);
    window.addEventListener('resize', refreshMapAndRoute);
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        refreshMapAndRoute();
      }
    });

    // Deteksi sentuhan jari langsung pada kontainer peta
    const mapEl = document.getElementById('map');
    if (mapEl) {
      mapEl.addEventListener('touchstart', function(e) {
        isUserTouching = true;
        if (e.touches && e.touches.length > 1) {
          disableFollowUser();
        }
      }, { passive: true });

      mapEl.addEventListener('touchend', function(e) {
        if (!e.touches || e.touches.length === 0) {
          setTimeout(function() {
            isUserTouching = false;
          }, 250);
        }
      }, { passive: true });

      mapEl.addEventListener('touchcancel', function() {
        isUserTouching = false;
      }, { passive: true });
    }

    map.on('click', function(e) {
      updateCoordinateInfo(e.latlng.lat, e.latlng.lng, 'Titik Dipilih Manual');
    });

    // 8. Fitur Pencarian Khusus Nomor SMB di Dalam Rute Tagihan
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const clearBtn = document.getElementById('clear-btn');
    const suggestionsList = document.getElementById('suggestions');
    let prevSearchVal = '';

    // Formatter input Nomor SMB (xx-xxxxx) otomatis: sisipkan (-) setelah 2 digit awal
    function formatSmbInput(text, prevText) {
      const isDeleting = text.length < (prevText ? prevText.length : 0);
      const digits = text.replace(/\\D/g, '').slice(0, 7);
      if (!digits) return '';
      if (digits.length <= 2) {
        if (!isDeleting && digits.length === 2) {
          return digits + '-';
        }
        return digits;
      }
      return digits.slice(0, 2) + '-' + digits.slice(2);
    }

    // Filter pelanggan rute berdasarkan Nomor SMB
    function filterCustomersBySmb(query) {
      if (!Array.isArray(currentValidCustomers) || currentValidCustomers.length === 0) return [];
      const cleanQuery = (query || '').trim().toLowerCase();
      if (!cleanQuery) return [];
      const queryDigits = cleanQuery.replace(/\\D/g, '');

      return currentValidCustomers.filter(cust => {
        const smb = String(cust.noSmb || cust.nama || '').trim().toLowerCase();
        const smbDigits = smb.replace(/\\D/g, '');
        return (
          smb.includes(cleanQuery) ||
          (queryDigits.length > 0 && smbDigits.includes(queryDigits))
        );
      });
    }

    // Tampilkan daftar saran pelanggan rute saat mengetik nomor SMB
    function updateSmbSuggestions(query) {
      const matches = filterCustomersBySmb(query);
      suggestionsList.innerHTML = '';

      if (matches.length === 0) {
        suggestionsList.innerHTML = '<div class="suggestion-item" style="color:#ef4444; font-size:12px; padding:10px 14px; cursor:default;">Nomor SMB tidak ditemukan di dalam rute ini</div>';
        suggestionsList.style.display = 'block';
        return;
      }

      matches.slice(0, 8).forEach(cust => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:9px 12px; cursor:pointer;';

        const smbFormatted = cust.noSmb || 'SMB -';
        const nama = cust.nama || 'Pelanggan';

        div.innerHTML =
          '<div style="display:flex; align-items:center; gap:8px; overflow:hidden;">' +
            '<span style="font-size:15px;">📍</span>' +
            '<div style="overflow:hidden;">' +
              '<div style="font-weight:700; color:#07326E; font-size:13px; white-space:nowrap;">' + smbFormatted + '</div>' +
              '<div style="font-size:11px; color:#64748B; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">' + nama + '</div>' +
            '</div>' +
          '</div>' +
          '<span style="font-size:11px; color:#0284C7; font-weight:600; background:#E0F2FE; padding:3px 9px; border-radius:12px; white-space:nowrap; margin-left:8px;">Buka</span>';

        div.addEventListener('click', function(ev) {
          ev.stopPropagation();
          selectAndFocusCustomer(cust);
        });

        suggestionsList.appendChild(div);
      });

      suggestionsList.style.display = 'block';
    }

    // Pusatkan peta ke pelanggan rute terpilih & buka popup
    function selectAndFocusCustomer(cust) {
      if (!cust) return;
      disableFollowUser();

      // Pusatkan peta langsung ke titik pelanggan
      map.flyTo([cust.lat, cust.lng], 18, { duration: 0.8 });

      // Cari marker pelanggan & buka popup
      const targetMarker = cust._marker || customerMarkers.find(m => m._cust && m._cust.id === cust.id);
      if (targetMarker) {
        setTimeout(function() {
          if (!targetMarker.isPopupOpen()) {
            targetMarker.openPopup();
          }
        }, 350);
      }

      if (cust.noSmb) {
        searchInput.value = cust.noSmb;
        prevSearchVal = cust.noSmb;
        clearBtn.style.display = 'block';
      }
      suggestionsList.style.display = 'none';
    }

    searchInput.addEventListener('input', function() {
      const formatted = formatSmbInput(this.value, prevSearchVal);
      this.value = formatted;
      prevSearchVal = formatted;

      if (formatted.trim().length > 0) {
        clearBtn.style.display = 'block';
        updateSmbSuggestions(formatted);
      } else {
        clearBtn.style.display = 'none';
        suggestionsList.style.display = 'none';
      }
    });

    clearBtn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      searchInput.value = '';
      prevSearchVal = '';
      clearBtn.style.display = 'none';
      suggestionsList.style.display = 'none';
      searchInput.focus();
    });

    function doSearch() {
      const query = searchInput.value.trim();
      if (!query) return;

      const matches = filterCustomersBySmb(query);
      if (matches.length > 0) {
        selectAndFocusCustomer(matches[0]);
      } else {
        suggestionsList.innerHTML = '<div class="suggestion-item" style="color:#ef4444; font-size:12px; padding:10px 14px; cursor:default;">Nomor SMB tidak ditemukan di dalam rute ini</div>';
        suggestionsList.style.display = 'block';
      }
    }

    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doSearch();
    });

    document.addEventListener('click', function(e) {
      if (!e.target.closest('.search-box') && !e.target.closest('#suggestions')) {
        suggestionsList.style.display = 'none';
      }
    });

    // Selesai inisialisasi awal

    // Inisialisasi sidik jari awal pelanggan agar update berulang tidak merender ulang peta
    if (Array.isArray(initialCustomers)) {
      lastCustFingerprint = initialCustomers.map(c => {
        if (!c) return '';
        const id = c.id || c.tagihanId || c.noSmb || '';
        const lat = c.lat !== undefined ? c.lat : c.latitude;
        const lng = c.lng !== undefined ? c.lng : c.longitude;
        const foto = c.fotoPersil ? '1' : '0';
        return id + ':' + lat + ':' + lng + ':' + foto;
      }).join('|');
    }

    // Panggil awal
    updateCoordinateInfo(currentLat, currentLng, 'Menghubungkan GPS...', 15);
    renderRealCustomerMarkers(initialCustomers, true);
    setTimeout(function() {
      if (typeof refreshMapAndRoute === 'function') refreshMapAndRoute();
    }, 250);
    setTimeout(function() {
      if (typeof refreshMapAndRoute === 'function') refreshMapAndRoute();
    }, 700);
  </script>
</body>
</html>`;
}
