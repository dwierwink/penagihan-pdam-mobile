export function getMapHtml(initialCoords, customers = []) {
  const initLat = (initialCoords && typeof initialCoords.lat === 'number') ? initialCoords.lat : -7.1539;
  const initLng = (initialCoords && typeof initialCoords.lng === 'number') ? initialCoords.lng : 112.6561;

  // Ekstrak & sanitasi data koordinat pelanggan asli
  const sanitizedCustomers = Array.isArray(customers)
    ? customers
        .map((c) => {
          if (!c) return null;
          let lat = null;
          let lng = null;
          if (
            typeof c.latitude === 'number' &&
            typeof c.longitude === 'number' &&
            !isNaN(c.latitude) &&
            !isNaN(c.longitude)
          ) {
            lat = c.latitude;
            lng = c.longitude;
          } else if (
            typeof c.lat === 'number' &&
            typeof c.lng === 'number' &&
            !isNaN(c.lat) &&
            !isNaN(c.lng)
          ) {
            lat = c.lat;
            lng = c.lng;
          } else if (c.koordinat && typeof c.koordinat === 'string') {
            const cleanStr = c.koordinat.replace(/[()]/g, '');
            const parts = cleanStr.split(',').map((s) => parseFloat(s.trim()));
            if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              lat = parts[0];
              lng = parts[1];
            }
          }
          if (lat === null || lng === null) return null;
          return {
            id: String(c.id || c.tagihanId || Math.random()),
            nama: String(c.nama || c.name || 'Pelanggan'),
            noSmb: String(c.noSmb || c.smb || c.nomorSmb || c.no_smb || c.nosmb || ''),
            lat,
            lng,
          };
        })
        .filter(Boolean)
    : [];

  const customersJson = JSON.stringify(sanitizedCustomers);

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Google Maps Rute Tagihan PDAM Real-Time</title>
  
  <!-- Leaflet CSS & JS -->
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

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

    /* Floating Side Buttons (GPS & Layer) */
    .floating-buttons {
      position: absolute;
      right: 12px;
      top: 110px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .fab {
      width: 44px;
      height: 44px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 22px;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);
      font-size: 20px;
      transition: all 0.2s;
    }
    .fab.active-tracking {
      background: #dcfce7;
      border-color: #16a34a;
      box-shadow: 0 0 12px rgba(22, 163, 74, 0.4);
    }
    .fab:active {
      transform: scale(0.92);
    }

    /* Custom GPS Marker Pulse Radar dengan Pergerakan Halus */
    .gps-ring-container {
      transition: transform 0.6s cubic-bezier(0.25, 0.1, 0.25, 1);
      pointer-events: none;
    }
    .gps-marker-ring {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: rgba(37, 99, 235, 0.3);
      border: 2px solid #2563eb;
      animation: ring-pulse 1.6s infinite ease-out;
    }
    .gps-marker-core {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #2563eb;
      position: absolute;
      top: 7px;
      left: 7px;
      border: 2.5px solid #ffffff;
      box-shadow: 0 0 10px rgba(37, 99, 235, 0.8);
    }
    @keyframes ring-pulse {
      0% { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(2.0); opacity: 0; }
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
    }
    .customer-name-tooltip::before {
      border-top-color: #07326e !important;
    }
    .leaflet-popup-content {
      margin: 8px 12px !important;
      line-height: 1.3 !important;
    }
  </style>
</head>
<body>
  <div id="map"></div>

  <!-- Top Search Controls -->
  <div class="top-controls">
    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input
        type="text"
        id="search-input"
        class="search-input"
        placeholder="Cari lokasi, alamat, atau koordinat (lat, lng)..."
        autocomplete="off"
      />
      <button id="clear-btn" class="clear-btn" style="display:none;">✕</button>
      <button id="search-btn" class="search-action-btn">Cari</button>
    </div>

    <!-- Autocomplete Results -->
    <div id="suggestions" class="suggestions-list"></div>

    <!-- Quick Filter Chips -->
    <div class="chip-row">
      <div id="chip-follow" class="chip following">🎯 Ikuti Posisi Saya (Aktif)</div>
      <div id="chip-rute" class="chip active">🛣️ Rute Jalan Pelanggan</div>
      <div id="chip-layer" class="chip">🛰️ Peta Satelit</div>
    </div>
  </div>

  <!-- Floating Action Buttons -->
  <div class="floating-buttons">
    <div id="fab-gps" class="fab active-tracking" title="Pusatkan & Ikuti Posisi Saya">🎯</div>
    <div id="fab-layer" class="fab" title="Ganti Tampilan Google Maps">🗺️</div>
  </div>

  <!-- Map Script -->
  <script>
    let currentLat = ${initLat};
    let currentLng = ${initLng};
    let followUser = true; // Mode otomatis mengikuti pergerakan pengguna
    let hasInitializedRoute = false;

    // 1. Inisialisasi Peta & Layer Google Maps
    const map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([currentLat, currentLng], 16);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Google Maps Tile Layers
    const googleRoads = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });

    const googleHybrid = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
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

    document.getElementById('fab-layer').addEventListener('click', toggleLayer);
    document.getElementById('chip-layer').addEventListener('click', toggleLayer);

    // 2. Marker Radar GPS Saya & Variabel Rute
    let gpsRadarMarker = null;
    let gpsAccuracyCircle = null;

    // 3. Rute Titik Koordinat Real Pelanggan PDAM (Sesuai Rute Jalan Asli)
    let initialCustomers = ${customersJson};
    let customerMarkers = [];
    let routePolyline = null;
    let isRouteVisible = true;
    let currentValidCustomers = [];
    let hasFittedInitialBounds = false;
    let isFetchingRoute = false;
    let lastRouteOriginLat = null;
    let lastRouteOriginLng = null;
    let lastPanLat = null;
    let lastPanLng = null;
    let hasReceivedNativeGps = false;

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
      if (typeof originLat !== 'number' || typeof originLng !== 'number') return;

      const validTargets = custList.filter(
        c => typeof c.lat === 'number' && typeof c.lng === 'number' && !isNaN(c.lat) && !isNaN(c.lng)
      );
      if (validTargets.length === 0) return;

      const chip = document.getElementById('chip-rute');
      if (chip && isRouteVisible) {
        chip.innerText = '⏳ Membaca Rute Jalan...';
      }

      isFetchingRoute = true;

      // Susun titik waypoints rute jalan mulai dari Lokasi Saya (origin) -> pelanggan
      // Format OSRM: lng,lat;lng,lat...
      const waypoints = [
        originLng.toFixed(6) + ',' + originLat.toFixed(6),
        ...validTargets.map(c => c.lng.toFixed(6) + ',' + c.lat.toFixed(6))
      ].join(';');

      const osrmUrl = 'https://router.project-osrm.org/route/v1/driving/' + waypoints + '?overview=full&geometries=geojson';

      fetch(osrmUrl)
        .then(res => res.json())
        .then(data => {
          isFetchingRoute = false;
          if (data && data.code === 'Ok' && data.routes && data.routes[0]) {
            const route = data.routes[0];
            const roadPoints = route.geometry.coordinates.map(pt => [pt[1], pt[0]]);

            if (routePolyline) {
              map.removeLayer(routePolyline);
            }

            // Gambar rute jalan raya dengan style modern yang halus
            routePolyline = L.polyline(roadPoints, {
              color: '#0284c7',
              weight: 5,
              opacity: 0.88,
              lineJoin: 'round',
              lineCap: 'round'
            }).addTo(map);

            const distMeters = route.distance;
            const distFormatted = distMeters < 1000
              ? Math.round(distMeters) + ' m'
              : (distMeters / 1000).toFixed(1) + ' km';

            if (chip && isRouteVisible) {
              chip.innerText = '🛣️ Rute Jalan: ' + distFormatted;
              chip.classList.add('active');
            }

            // HANYA sesuaikan batas kamera (fitBounds) jika secara eksplisit diminta (misal: saat pertama kali buka atau klik tombol rute)
            // JANGAN PERNAH panggil fitBounds pada pergerakan GPS berkala agar peta tidak loncat-loncat!
            if (shouldFitBounds && roadPoints.length > 0) {
              const allBounds = L.latLngBounds(roadPoints);
              allBounds.extend([originLat, originLng]);
              map.fitBounds(allBounds, { padding: [50, 50], maxZoom: 16 });
            }
          } else {
            if (chip) chip.innerText = '🛣️ Rute Jalan (' + validTargets.length + ' Pelanggan)';
          }
        })
        .catch(err => {
          isFetchingRoute = false;
          console.warn('Gagal membaca rute jalan OSRM:', err);
          if (chip) chip.innerText = '🛣️ Rute Jalan (' + validTargets.length + ' Pelanggan)';
        });
    }

    function renderRealCustomerMarkers(rawList) {
      customerMarkers.forEach(m => map.removeLayer(m));
      customerMarkers = [];
      if (routePolyline) {
        map.removeLayer(routePolyline);
        routePolyline = null;
      }

      if (!Array.isArray(rawList)) return;

      const validList = rawList.map(c => {
        if (!c) return null;
        let lat = null;
        let lng = null;
        if (typeof c.lat === 'number' && typeof c.lng === 'number' && !isNaN(c.lat) && !isNaN(c.lng)) {
          lat = c.lat;
          lng = c.lng;
        } else if (typeof c.latitude === 'number' && typeof c.longitude === 'number' && !isNaN(c.latitude) && !isNaN(c.longitude)) {
          lat = c.latitude;
          lng = c.longitude;
        } else if (c.koordinat && typeof c.koordinat === 'string') {
          const cleanStr = c.koordinat.replace(/[()]/g, '');
          const parts = cleanStr.split(',').map(s => parseFloat(s.trim()));
          if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            lat = parts[0];
            lng = parts[1];
          }
        }
        if (lat === null || lng === null) return null;
        return {
          id: c.id || c.tagihanId || '',
          nama: c.nama || c.name || 'Pelanggan',
          noSmb: c.noSmb || c.smb || c.nomorSmb || c.no_smb || c.nosmb || '',
          lat: lat,
          lng: lng
        };
      }).filter(Boolean);

      currentValidCustomers = validList;

      validList.forEach((cust) => {
        // Tampilkan nomor SMB pelanggan pada maps rute tagihan sesuai instruksi
        const customerSmb = cust.noSmb || cust.nama || 'Pelanggan';

        // Pin Marker Pelanggan PDAM Sesuai Koordinat Asli
        const customerPinIcon = L.icon({
          iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          tooltipAnchor: [1, -34],
          shadowSize: [41, 41]
        });

        const m = L.marker([cust.lat, cust.lng], { icon: customerPinIcon }).addTo(map);

        // Hanya cantumkan nomor SMB pelanggan saja sesuai instruksi
        m.bindTooltip(customerSmb, {
          permanent: true,
          direction: 'top',
          className: 'customer-name-tooltip',
          offset: [0, -10]
        });

        // Popup saat marker diklik menampilkan nomor SMB pelanggan
        m.bindPopup(
          '<div style="font-size:13px; font-weight:700; color:#07326E; text-align:center; padding:3px 6px;">' +
            customerSmb +
          '</div>'
        );

        m.on('click', () => {
          updateCoordinateInfo(cust.lat, cust.lng, customerSmb);
          // Baca rute jalan khusus dari posisi saya ke pelanggan ini
          fetchAndDrawRoadRoute(currentLat, currentLng, [cust], true);
        });

        customerMarkers.push(m);
      });

      // Baca & gambar rute jalan asli dari lokasi saya ke pelanggan
      if (validList.length > 0) {
        const fitFirstTime = !hasFittedInitialBounds;
        if (fitFirstTime) hasFittedInitialBounds = true;
        fetchAndDrawRoadRoute(currentLat, currentLng, validList, fitFirstTime);
      } else {
        const chip = document.getElementById('chip-rute');
        if (chip) chip.innerText = '🛣️ Rute Jalan (0 Pelanggan)';
      }
    }

    function toggleRoute() {
      isRouteVisible = !isRouteVisible;
      const chip = document.getElementById('chip-rute');
      if (isRouteVisible) {
        customerMarkers.forEach(m => map.addLayer(m));
        if (currentValidCustomers.length > 0) {
          fetchAndDrawRoadRoute(currentLat, currentLng, currentValidCustomers, true);
        }
        if (chip) chip.classList.add('active');
      } else {
        customerMarkers.forEach(m => map.removeLayer(m));
        if (routePolyline) map.removeLayer(routePolyline);
        if (chip) {
          chip.classList.remove('active');
          chip.innerText = '🛣️ Tampilkan Rute Jalan';
        }
      }
    }

    document.getElementById('chip-rute').addEventListener('click', toggleRoute);

    // 4. Update Koordinat
    function updateCoordinateInfo(lat, lng, label, accuracy) {
      currentLat = lat;
      currentLng = lng;
    }

    // 5. Menerima Koordinat Real-Time dari Native / Host App (Ultra Smooth)
    window.handleLocationUpdate = function(lat, lng, accuracy) {
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      hasReceivedNativeGps = true;

      currentLat = lat;
      currentLng = lng;

      // 1. Update radar marker posisi saya dengan transisi halus
      if (!gpsRadarMarker) {
        const gpsIcon = L.divIcon({
          className: 'gps-ring-container',
          html: '<div class="gps-marker-ring"><div class="gps-marker-core"></div></div>',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
        gpsRadarMarker = L.marker([lat, lng], { icon: gpsIcon, zIndexOffset: 1000 }).addTo(map);
      } else {
        gpsRadarMarker.setLatLng([lat, lng]);
      }

      // 2. Update lingkaran akurasi GPS jika akurasi wajar (< 100m)
      if (typeof accuracy === 'number' && accuracy > 0 && accuracy < 100) {
        if (!gpsAccuracyCircle) {
          gpsAccuracyCircle = L.circle([lat, lng], {
            radius: accuracy,
            color: '#2563eb',
            weight: 1.5,
            fillColor: '#3b82f6',
            fillOpacity: 0.08
          }).addTo(map);
        } else {
          gpsAccuracyCircle.setLatLng([lat, lng]);
          gpsAccuracyCircle.setRadius(accuracy);
        }
      }

      // 3. Smooth Camera Follow: hanya geser kamera jika followUser aktif dan pengguna berpindah minimal 5 meter
      // Mencegah jitter/getaran sensor GPS saat diam di tempat
      if (followUser) {
        let distFromLastPan = 999;
        if (lastPanLat !== null && lastPanLng !== null) {
          distFromLastPan = calculateDistanceMeters(lastPanLat, lastPanLng, lat, lng);
        }
        if (distFromLastPan >= 5) {
          lastPanLat = lat;
          lastPanLng = lng;
          map.panTo([lat, lng], { animate: true, duration: 1.0, easeLinearity: 0.25 });
        }
      }

      // 4. Update rute jalan asli hanya jika jarak berpindah minimal 25 meter dari rute sebelumnya
      // Ini menjaga agar rute jalan tetap stabil tanpa berkedip / reload setiap detik
      if (currentValidCustomers && currentValidCustomers.length > 0 && isRouteVisible && !isFetchingRoute) {
        let distFromLastRoute = 999;
        if (lastRouteOriginLat !== null && lastRouteOriginLng !== null) {
          distFromLastRoute = calculateDistanceMeters(lastRouteOriginLat, lastRouteOriginLng, lat, lng);
        }
        if (distFromLastRoute >= 25) {
          lastRouteOriginLat = lat;
          lastRouteOriginLng = lng;
          fetchAndDrawRoadRoute(lat, lng, currentValidCustomers, false);
        }
      }
    };

    // Update data pelanggan secara dinamis dari native/web
    window.updateCustomersData = function(data) {
      let parsed = data;
      if (typeof data === 'string') {
        try { parsed = JSON.parse(data); } catch(e) {}
      }
      renderRealCustomerMarkers(parsed);
    };

    // Dengarkan pesan postMessage dari parent iframe / webview
    function handleMessageEvent(event) {
      let data = event.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch(e) { return; }
      }
      if (data && data.type === 'UPDATE_LOCATION') {
        window.handleLocationUpdate(data.lat, data.lng, data.accuracy);
      } else if (data && data.type === 'UPDATE_CUSTOMERS') {
        renderRealCustomerMarkers(data.customers);
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
              pos.coords.accuracy
            );
          },
          function(err) {
            console.warn('Geolocation warning:', err);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
        );
      }
    }
    triggerAutoGPS();

    // 7. Toggle Mode "Ikuti Posisi Saya"
    function toggleFollowUser() {
      followUser = true;
      lastPanLat = currentLat;
      lastPanLng = currentLng;
      const chipFollow = document.getElementById('chip-follow');
      if (chipFollow) {
        chipFollow.classList.add('following');
        chipFollow.innerText = '🎯 Ikuti Posisi Saya (Aktif)';
      }
      const fabGps = document.getElementById('fab-gps');
      if (fabGps) fabGps.classList.add('active-tracking');

      map.flyTo([currentLat, currentLng], 17, { duration: 1.0 });
    }

    document.getElementById('chip-follow').addEventListener('click', toggleFollowUser);
    document.getElementById('fab-gps').addEventListener('click', toggleFollowUser);

    // Jika pengguna menggeser peta secara manual, nonaktifkan auto-follow sementara
    map.on('dragstart', function() {
      followUser = false;
      const chipFollow = document.getElementById('chip-follow');
      if (chipFollow) {
        chipFollow.classList.remove('following');
        chipFollow.innerText = '🎯 Pusatkan ke Saya';
      }
      const fabGps = document.getElementById('fab-gps');
      if (fabGps) fabGps.classList.remove('active-tracking');
    });

    map.on('click', function(e) {
      updateCoordinateInfo(e.latlng.lat, e.latlng.lng, 'Titik Dipilih Manual');
    });

    // 8. Fitur Pencarian Alamat & Koordinat
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const clearBtn = document.getElementById('clear-btn');
    const suggestionsList = document.getElementById('suggestions');

    searchInput.addEventListener('input', function() {
      if (this.value.trim().length > 0) {
        clearBtn.style.display = 'block';
      } else {
        clearBtn.style.display = 'none';
        suggestionsList.style.display = 'none';
      }
    });

    clearBtn.addEventListener('click', function() {
      searchInput.value = '';
      clearBtn.style.display = 'none';
      suggestionsList.style.display = 'none';
      searchInput.focus();
    });

    function doSearch() {
      const query = searchInput.value.trim();
      if (!query) return;

      const coordRegex = /^[\\s]*([-+]?[0-9]*\\.?[0-9]+)[\\s]*,[\\s]*([-+]?[0-9]*\\.?[0-9]+)[\\s]*$/;
      const match = query.match(coordRegex);

      if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (!isNaN(lat) && !isNaN(lng)) {
          followUser = false;
          map.setView([lat, lng], 16);
          updateCoordinateInfo(lat, lng, 'Pencarian Koordinat');
          suggestionsList.style.display = 'none';
          return;
        }
      }

      searchBtn.innerText = 'Mencari...';
      fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query) + '&limit=5&countrycodes=id', {
        headers: { 'Accept-Language': 'id' }
      })
      .then(res => res.json())
      .then(results => {
        searchBtn.innerText = 'Cari';
        suggestionsList.innerHTML = '';

        if (!results || results.length === 0) {
          suggestionsList.innerHTML = '<div class="suggestion-item" style="color:#ef4444;">Lokasi tidak ditemukan. Coba ketik nama jalan atau koordinat.</div>';
          suggestionsList.style.display = 'block';
          return;
        }

        results.forEach(item => {
          const div = document.createElement('div');
          div.className = 'suggestion-item';
          div.innerHTML = '<span>📍</span>' + item.display_name;
          div.addEventListener('click', () => {
            followUser = false;
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lon);
            map.setView([lat, lng], 16);
            updateCoordinateInfo(lat, lng, item.name || query);
            searchInput.value = item.display_name.split(',')[0];
            suggestionsList.style.display = 'none';
          });
          suggestionsList.appendChild(div);
        });
        suggestionsList.style.display = 'block';

        const first = results[0];
        const lat = parseFloat(first.lat);
        const lng = parseFloat(first.lon);
        followUser = false;
        map.setView([lat, lng], 16);
        updateCoordinateInfo(lat, lng, first.name || query);
      })
      .catch(() => {
        searchBtn.innerText = 'Cari';
        alert('Gagal mencari lokasi secara online. Periksa koneksi internet Anda.');
      });
    }

    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doSearch();
    });

    // Selesai inisialisasi awal

    // Panggil awal
    updateCoordinateInfo(currentLat, currentLng, 'Menghubungkan GPS...', 15);
    renderRealCustomerMarkers(initialCustomers);
  </script>
</body>
</html>`;
}
