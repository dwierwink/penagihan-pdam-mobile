export function getPickerMapHtml(initialCoords) {
  const initLat = (initialCoords && typeof initialCoords.lat === 'number') ? initialCoords.lat : -7.1539;
  const initLng = (initialCoords && typeof initialCoords.lng === 'number') ? initialCoords.lng : 112.6561;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Pilih Titik Alamat Rumah - Google Maps</title>
  
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

    /* Top Search & Controls */
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
      padding: 7px 12px;
      margin-left: 6px;
      border-radius: 10px;
      border: none;
      cursor: pointer;
    }
    .search-action-btn:hover {
      background: #0a3871;
    }

    /* Suggestions List */
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
      font-size: 13px;
      color: #1e293b;
      border-bottom: 1px solid #f1f5f9;
      cursor: pointer;
    }
    .suggestion-item:last-child {
      border-bottom: none;
    }
    .suggestion-item:hover {
      background: #f8fafc;
      color: #07326e;
    }

    /* Floating Action Buttons (Right) */
    .floating-tools {
      position: absolute;
      top: 76px;
      right: 12px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .fab-btn {
      width: 44px;
      height: 44px;
      border-radius: 22px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.18);
      cursor: pointer;
      font-size: 18px;
      transition: transform 0.15s;
    }
    .fab-btn:active {
      transform: scale(0.92);
    }

    /* Floating Hint Badge */
    .floating-hint {
      position: absolute;
      top: 76px;
      left: 12px;
      z-index: 999;
      background: rgba(15, 23, 42, 0.85);
      color: #ffffff;
      font-size: 11.5px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 20px;
      backdrop-filter: blur(4px);
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      display: flex;
      align-items: center;
      gap: 5px;
    }

    /* Custom Draggable Pin Marker */
    .custom-draggable-pin {
      position: relative;
      cursor: grab;
      text-align: center;
    }
    .custom-draggable-pin:active {
      cursor: grabbing;
    }
    .pin-icon-wrap {
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 34px;
      filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.35));
      animation: pinBounce 0.4s ease-out;
    }
    @keyframes pinBounce {
      0% { transform: translateY(-16px); }
      60% { transform: translateY(4px); }
      100% { transform: translateY(0); }
    }
    .pin-pulse-circle {
      position: absolute;
      width: 16px;
      height: 8px;
      background: rgba(239, 68, 68, 0.4);
      border-radius: 50%;
      bottom: -2px;
      left: 14px;
    }

    /* Bottom Confirmation Card */
    .bottom-confirm-card {
      position: absolute;
      bottom: 16px;
      left: 14px;
      right: 14px;
      z-index: 1000;
      background: #ffffff;
      border-radius: 18px;
      padding: 14px 16px;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.22);
      border: 1px solid #e2e8f0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .confirm-top-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .confirm-title-col {
      display: flex;
      flex-direction: column;
    }
    .confirm-label {
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .confirm-coord-val {
      font-size: 14.5px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 2px;
    }
    .confirm-badge-live {
      background: #dcfce7;
      color: #15803d;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 9px;
      border-radius: 10px;
    }
    .confirm-instruction {
      font-size: 11.5px;
      color: #64748b;
      line-height: 16px;
    }
    .btn-use-coord {
      background: #07326e;
      color: #ffffff;
      font-size: 14.5px;
      font-weight: 700;
      padding: 12px;
      border-radius: 14px;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      box-shadow: 0 4px 12px rgba(7, 50, 110, 0.25);
      transition: background 0.15s, transform 0.1s;
    }
    .btn-use-coord:hover {
      background: #0a3871;
    }
    .btn-use-coord:active {
      transform: scale(0.98);
    }
  </style>
</head>
<body>
  <!-- Top Search Controls -->
  <div class="top-controls">
    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input
        type="text"
        id="search-input"
        class="search-input"
        placeholder="Cari jalan, desa, perumahan..."
        autocomplete="off"
      />
      <button id="clear-btn" class="clear-btn" style="display:none;" onclick="clearSearch()">✕</button>
      <button class="search-action-btn" onclick="performSearch()">Cari</button>
    </div>
    <div id="suggestions-list" class="suggestions-list"></div>
  </div>

  <!-- Floating Tools (Right) -->
  <div class="floating-tools">
    <button class="fab-btn" id="fab-gps" title="Posisikan ke Lokasi Saya" onclick="centerOnUserGPS()">📍</button>
    <button class="fab-btn" id="fab-layer" title="Ganti Tampilan Peta" onclick="toggleMapLayer()">🛰️</button>
  </div>

  <!-- Floating Tip Hint (Left) -->
  <div class="floating-hint">
    <span>👆</span> Geser pin merah ke rumah Anda
  </div>

  <!-- Map Container -->
  <div id="map"></div>

  <!-- Bottom Confirmation Card -->
  <div class="bottom-confirm-card">
    <div class="confirm-top-row">
      <div class="confirm-title-col">
        <span class="confirm-label">Titik Koordinat Rumah</span>
        <span id="coord-val" class="confirm-coord-val">${initLat.toFixed(6)}, ${initLng.toFixed(6)}</span>
      </div>
      <div class="confirm-badge-live">✓ Siap Dipilih</div>
    </div>
    <div class="confirm-instruction">
      Pin merah dapat digeser langsung, atau ketuk peta di posisi rumah pelanggan.
    </div>
    <button class="btn-use-coord" onclick="confirmCurrentCoordinates()">
      <span>✓</span> Gunakan Titik Koordinat Ini
    </button>
  </div>

  <script>
    let currentLat = ${initLat};
    let currentLng = ${initLng};
    let currentLayerIndex = 0;

    // 1. Initialize Map
    const map = L.map('map', {
      center: [currentLat, currentLng],
      zoom: 17,
      zoomControl: false,
    });

    // 2. Tile Layers: Google Maps Standard & Satellite
    const googleRoadmap = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 21,
      attribution: '&copy; Google Maps'
    });
    const googleHybrid = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 21,
      attribution: '&copy; Google Maps Satellite'
    });
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    });

    const tileLayers = [googleRoadmap, googleHybrid, osmLayer];
    googleRoadmap.addTo(map);

    function toggleMapLayer() {
      map.removeLayer(tileLayers[currentLayerIndex]);
      currentLayerIndex = (currentLayerIndex + 1) % tileLayers.length;
      tileLayers[currentLayerIndex].addTo(map);
      
      const fabLayer = document.getElementById('fab-layer');
      if (currentLayerIndex === 0) fabLayer.innerText = '🛰️';
      else if (currentLayerIndex === 1) fabLayer.innerText = '🗺️';
      else fabLayer.innerText = '🌐';
    }

    // 3. Custom Draggable Marker
    const pinIcon = L.divIcon({
      className: 'custom-draggable-pin',
      html: '<div class="pin-icon-wrap">📍</div><div class="pin-pulse-circle"></div>',
      iconSize: [44, 44],
      iconAnchor: [22, 42],
    });

    const marker = L.marker([currentLat, currentLng], {
      draggable: true,
      icon: pinIcon,
    }).addTo(map);

    // Update coordinates display & notify parent
    function updateCoordinate(lat, lng, isFinal = false) {
      currentLat = lat;
      currentLng = lng;
      const formatted = lat.toFixed(6) + ', ' + lng.toFixed(6);
      const coordEl = document.getElementById('coord-val');
      if (coordEl) coordEl.innerText = formatted;

      const payload = {
        type: isFinal ? 'CONFIRM_COORD' : 'COORD_CHANGED',
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        formatted: formatted,
      };

      // Web iframe postMessage
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, '*');
      }
      // React Native WebView
      if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    }

    // Marker Drag Events
    marker.on('drag', function(e) {
      const pos = marker.getLatLng();
      const coordEl = document.getElementById('coord-val');
      if (coordEl) coordEl.innerText = pos.lat.toFixed(6) + ', ' + pos.lng.toFixed(6);
    });

    marker.on('dragend', function(e) {
      const pos = marker.getLatLng();
      updateCoordinate(pos.lat, pos.lng, false);
    });

    // Map Click Event (Tap to move pin)
    map.on('click', function(e) {
      marker.setLatLng(e.latlng);
      updateCoordinate(e.latlng.lat, e.latlng.lng, false);
    });

    // Button "Gunakan Titik Koordinat Ini"
    function confirmCurrentCoordinates() {
      updateCoordinate(currentLat, currentLng, true);
    }

    // 4. Center on User GPS
    function centerOnUserGPS() {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          function(pos) {
            const uLat = pos.coords.latitude;
            const uLng = pos.coords.longitude;
            marker.setLatLng([uLat, uLng]);
            map.setView([uLat, uLng], 18, { animate: true });
            updateCoordinate(uLat, uLng, false);
          },
          function(err) {
            alert('Tidak dapat mendeteksi lokasi GPS perangkat.');
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      }
    }

    // 5. Autocomplete & Search using Nominatim
    const searchInput = document.getElementById('search-input');
    const suggestionsList = document.getElementById('suggestions-list');
    const clearBtn = document.getElementById('clear-btn');
    let searchDebounce = null;

    searchInput.addEventListener('input', function() {
      const q = this.value.trim();
      clearBtn.style.display = q ? 'block' : 'none';
      if (q.length < 3) {
        suggestionsList.style.display = 'none';
        return;
      }
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => fetchSuggestions(q), 350);
    });

    function clearSearch() {
      searchInput.value = '';
      clearBtn.style.display = 'none';
      suggestionsList.style.display = 'none';
    }

    async function fetchSuggestions(query) {
      try {
        const url = 'https://nominatim.openstreetmap.org/search?format=json&countrycodes=id&q=' + encodeURIComponent(query);
        const res = await fetch(url);
        const data = await res.json();
        renderSuggestions(data);
      } catch (e) {
        console.warn('Geocoding search error:', e);
      }
    }

    function renderSuggestions(items) {
      if (!items || items.length === 0) {
        suggestionsList.style.display = 'none';
        return;
      }
      suggestionsList.innerHTML = '';
      items.slice(0, 5).forEach(item => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerText = item.display_name;
        div.onclick = function() {
          const lat = parseFloat(item.lat);
          const lon = parseFloat(item.lon);
          marker.setLatLng([lat, lon]);
          map.setView([lat, lon], 17, { animate: true });
          updateCoordinate(lat, lon, false);
          searchInput.value = item.display_name.split(',')[0];
          suggestionsList.style.display = 'none';
        };
        suggestionsList.appendChild(div);
      });
      suggestionsList.style.display = 'block';
    }

    async function performSearch() {
      const q = searchInput.value.trim();
      if (!q) return;
      try {
        const url = 'https://nominatim.openstreetmap.org/search?format=json&countrycodes=id&limit=1&q=' + encodeURIComponent(q);
        const res = await fetch(url);
        const data = await res.json();
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          marker.setLatLng([lat, lon]);
          map.setView([lat, lon], 17, { animate: true });
          updateCoordinate(lat, lon, false);
          suggestionsList.style.display = 'none';
        }
      } catch (e) {
        console.warn('Search submit error:', e);
      }
    }
  </script>
</body>
</html>`;
}
