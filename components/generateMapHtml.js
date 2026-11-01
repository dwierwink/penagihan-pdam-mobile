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
            fotoPersil: c.fotoPersil || null,
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
  
  <!-- Leaflet CSS & JS + Leaflet Rotate Plugin -->
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.3/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.3/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet-rotate@0.5.2/dist/leaflet-rotate.js"></script>

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

    /* Tombol Kompas Penunjuk Arah */
    .fab-compass {
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
      transition: all 0.2s;
    }
    .fab-compass:active {
      transform: scale(0.92);
    }
    .compass-icon-wrapper {
      width: 28px;
      height: 28px;
      display: flex;
      justify-content: center;
      align-items: center;
      transition: transform 0.15s ease-out;
    }
    .compass-needle-svg {
      width: 24px;
      height: 24px;
    }

    /* Custom GPS Marker Pulse Radar dengan Pergerakan Halus & Panah Arah Hadap */
    .gps-ring-container {
      width: 28px;
      height: 28px;
      position: relative;
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
    /* Panah Arah Hadap pada Marker GPS */
    .gps-heading-cone {
      position: absolute;
      top: -12px;
      left: 7px;
      width: 14px;
      height: 14px;
      transform-origin: 7px 21px;
      transition: transform 0.2s ease-out;
      pointer-events: none;
      display: none;
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
      <div id="chip-follow" class="chip following">🎯 Ikuti Posisi Saya (Aktif)</div>
      <div id="chip-heading" class="chip">🧭 Sesuai Arah</div>
      <div id="chip-rute" class="chip active">🛣️ Rute Jalan Pelanggan</div>
      <div id="chip-layer" class="chip">🛰️ Peta Satelit</div>
    </div>
  </div>

  <!-- Floating Action Buttons -->
  <div class="floating-buttons">
    <div id="fab-compass" class="fab-compass" title="Arah Kompas (Ketuk untuk Reset ke Utara)">
      <div id="compass-icon-wrapper" class="compass-icon-wrapper">
        <svg class="compass-needle-svg" viewBox="0 0 24 24" fill="none">
          <polygon points="12,2 8,12 12,9" fill="#EF4444" />
          <polygon points="12,2 16,12 12,9" fill="#DC2626" />
          <polygon points="12,22 8,12 12,15" fill="#94A3B8" />
          <polygon points="12,22 16,12 12,15" fill="#64748B" />
          <circle cx="12" cy="12" r="2.2" fill="#FFFFFF" stroke="#0F172A" stroke-width="1.2" />
        </svg>
      </div>
    </div>
    <div id="fab-rotate-left" class="fab" title="Putar Kiri 15°" style="font-size: 16px; font-weight: bold; color: #07326E;">⟲</div>
    <div id="fab-rotate-right" class="fab" title="Putar Kanan 15°" style="font-size: 16px; font-weight: bold; color: #07326E;">⟳</div>
    <div id="fab-gps" class="fab active-tracking" title="Pusatkan & Ikuti Posisi Saya">🎯</div>
    <div id="fab-layer" class="fab" title="Ganti Tampilan Google Maps">🗺️</div>
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
    let currentLat = ${initLat};
    let currentLng = ${initLng};
    let followUser = true; // Mode otomatis mengikuti pergerakan pengguna
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

    // 1. Guard L.Renderer._onRotate agar tidak memicu _onZoomEnd() mid-gesture saat 2 jari sedang aktif (pinch/zoom)
    // Mencegah garis rute jalan berkedip, terpotong, atau loncat saat peta diputar atau dizoom dengan 2 jari
    if (typeof L !== 'undefined' && L.Renderer && L.Renderer.prototype._onRotate) {
      const origOnRotate = L.Renderer.prototype._onRotate;
      L.Renderer.prototype._onRotate = function() {
        if (!this._map || !this._map._rotate) return;
        const isZoomingGesture = this._map._animatingZoom ||
          (this._map.touchGestures && (this._map.touchGestures._zooming || this._map.touchGestures._gesture));
        if (isZoomingGesture) {
          this._rotateOrigin = this._map.getPixelOrigin();
          return;
        }
        return origOnRotate.apply(this, arguments);
      };
    }

    // 2. Patch L.Map.TouchGestures dengan algoritma Math.atan2 (360° mulus & bebas pembagian nol)
    // serta deadzone rotasi 3° agar saat cubit zoom lurus tidak memicu rotasi tak disengaja
    if (typeof L !== 'undefined' && L.Map && L.Map.TouchGestures) {
      L.Map.TouchGestures.prototype._onTouchStart = function(t) {
        const e = this._map;
        if (!t.touches || t.touches.length !== 2 || e._animatingZoom || this._zooming || this._rotating || this._gesture) return;
        const i = getTouchPoint(e, t.touches[0]);
        const o = getTouchPoint(e, t.touches[1]);
        const n = i.subtract(o);
        const s = this.pitch && e._rotate && Math.abs(n.x) > Math.abs(n.y);
        if (!s && !this.zoom && !this.rotate) return;

        this._gesture = s ? 'pending' : 'pinch';
        this._startP1 = i;
        this._startP2 = o;
        if (typeof e._stopPitchBearingAnimation === 'function') {
          e._stopPitchBearingAnimation();
        }
        this._centerPoint = e.getSize()._divideBy(2);
        this._startLatLng = e.containerPointToLatLng(this._centerPoint);

        if (this.zoom) {
          if (e.options.touchZoom !== 'center') {
            this._pinchStartLatLng = e.containerPointToLatLng(i.add(o)._divideBy(2));
          }
          this._startDist = i.distanceTo(o);
          this._startZoom = e.getZoom();
          this._zooming = true;
        } else {
          this._zooming = false;
        }

        if (this.rotate) {
          this._lastAngle = Math.atan2(n.y, n.x) * (180 / Math.PI);
          this._accumulatedRotation = 0;
          this._rotationActive = false;
          this._rotating = true;
        } else {
          this._rotating = false;
        }

        this._moved = false;
        e._stop();
        L.DomEvent.on(document, 'touchmove', this._onTouchMove, this).on(document, 'touchend touchcancel', this._onTouchEnd, this);
        L.DomEvent.preventDefault(t);
      };

      L.Map.TouchGestures.prototype._onTouchMove = function(t) {
        if (!t.touches || t.touches.length !== 2 || !this._gesture) return;
        const e = this._map;
        const i = getTouchPoint(e, t.touches[0]);
        const o = getTouchPoint(e, t.touches[1]);
        const n = i.subtract(o);
        const s = i.distanceTo(o) / this._startDist;
        let r;

        if (this._gesture === 'pending') {
          const a = i.subtract(this._startP1);
          const h = o.subtract(this._startP2);
          if (Math.max(a.x * a.x + a.y * a.y, h.x * h.x + h.y * h.y) < 25) {
            L.DomEvent.preventDefault(t);
            return;
          }
          const isPitch = p => Math.abs(p.y) > Math.abs(p.x);
          if (isPitch(a) && isPitch(h) && Math.sign(a.y) === Math.sign(h.y)) {
            this._gesture = 'pitch';
            this._lastPitchY = (this._startP1.y + this._startP2.y) / 2;
            this._zooming = this._rotating = false;
          } else {
            this._gesture = 'pinch';
          }
        }

        if (this._gesture === 'pitch') {
          const a = (i.y + o.y) / 2;
          if (typeof e._setPitchAndBearing === 'function') {
            e._setPitchAndBearing(e.getPitch() - (a - this._lastPitchY) * 0.5, e.getBearing());
          }
          this._lastPitchY = a;
          L.DomEvent.preventDefault(t);
          return;
        }

        if (!(this._zooming || this._rotating)) return;

        // ROTASI PETA 2 JARI: Mulus 360° dengan threshold deadzone 3°
        if (this._rotating) {
          const currentAngle = Math.atan2(n.y, n.x) * (180 / Math.PI);
          let delta = currentAngle - this._lastAngle;
          while (delta > 180) delta -= 360;
          while (delta < -180) delta += 360;
          this._lastAngle = currentAngle;
          this._accumulatedRotation += delta;

          if (!this._rotationActive) {
            if (Math.abs(this._accumulatedRotation) >= 3.0) {
              this._rotationActive = true;
              e.fire('rotatestart');
              e.setBearing(e.getBearing() + this._accumulatedRotation);
            }
          } else {
            if (Math.abs(delta) > 0.05) {
              e.setBearing(e.getBearing() + delta);
            }
          }
        }

        // ZOOM PINCH HALUS
        if (this._zooming) {
          this._zoom = e.getScaleZoom(s, this._startZoom);
          if (!e.options.bounceAtZoomLimits && (this._zoom < e.getMinZoom() && s < 1 || this._zoom > e.getMaxZoom() && s > 1)) {
            this._zoom = e._limitZoom(this._zoom);
          }
          if (e.options.touchZoom === 'center') {
            if (this._center = this._startLatLng, s === 1) return;
          } else {
            r = i._add(o)._divideBy(2)._subtract(this._centerPoint);
            if (s === 1 && r.x === 0 && r.y === 0) return;
            const a = e._pitch
              ? e.containerPointToLayerPoint(this._centerPoint.add(r)).subtract(e.containerPointToLayerPoint(this._centerPoint))
              : r.rotate(-e.getBearing() * (Math.PI / 180));
            this._center = e.unproject(e.project(this._pinchStartLatLng).subtract(a));
          }
        }

        if (!this._moved) {
          e._moveStart(true, false);
          this._moved = true;
        }
        e._move.bind(e, this._center, this._zoom, { pinch: true, round: false }, void 0)();
        if (this.zoom) {
          if (e.options.zoomAnimation) {
            e._animateZoomNoDelay(this._center, e._limitZoom(this._zoom));
          } else {
            e._resetView(this._center, e._limitZoom(this._zoom));
          }
        }
        L.DomEvent.preventDefault(t);
      };

      L.Map.TouchGestures.prototype._onTouchEnd = function() {
        const t = this._gesture;
        delete this._gesture;
        const wasRotating = this._rotationActive || this._rotating;
        if (t === 'pitch' || t === 'pending' || !this._moved || !(this._zooming || this._rotating)) {
          this._zooming = false;
          this._rotating = false;
          this._rotationActive = false;
          L.DomEvent.off(document, 'touchmove', this._onTouchMove, this).off(document, 'touchend touchcancel', this._onTouchEnd, this);
          if (wasRotating && this._map) this._map.fire('rotateend');
          return;
        }
        this._zooming = false;
        this._rotating = false;
        this._rotationActive = false;
        L.DomEvent.off(document, 'touchmove', this._onTouchMove, this).off(document, 'touchend touchcancel', this._onTouchEnd, this);
        if (this.zoom) {
          if (this._map.options.zoomAnimation) {
            this._map._animateZoom(this._center, this._map._limitZoom(this._zoom), true, this._map.options.zoomSnap);
          } else {
            this._map._resetView(this._center, this._map._limitZoom(this._zoom));
          }
        }
        if (wasRotating && this._map) this._map.fire('rotateend');
      };
    }

    // Dedicated Canvas Renderer untuk polyline rute jalan agar mulus & sinkron tanpa loncat saat zoom
    const routeCanvasRenderer = L.canvas({ padding: 0.5 });

    // 1. Inisialisasi Peta & Layer Google Maps dengan Dukungan Rotasi Peta Penuh & Zoom Ultra Halus
    const map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      rotate: true,
      touchRotate: true, // AKTIF: Peta bisa diputar bebas dengan 2 jari
      rotateControl: false,
      bearing: 0,
      preferCanvas: true, // Vektor digambar via Canvas GPU hardware-accelerated
      zoomSnap: 0, // KUNCI: Nilai 0 menghilangkan efek 'loncat' / snapping ke integer zoom pada pinch-zoom
      zoomDelta: 0.5, // Tombol zoom naik/turun lebih halus
      wheelPxPerZoomLevel: 120, // Mousewheel / trackpad zoom halus
      wheelDebounceTime: 40,
      zoomAnimation: true,
      zoomAnimationThreshold: 8,
      fadeAnimation: true,
      markerZoomAnimation: true,
      bounceAtZoomLimits: false, // Hindari efek membal kasar saat batas zoom tercapai
      touchZoom: true,
      tap: false,
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
    let initialCustomers = JSON.parse(${JSON.stringify(customersJson)});
    let customerMarkers = [];
    let routePolyline = null;
    let lastRoadPoints = null;
    let isRouteVisible = true;
    let currentValidCustomers = [];
    let hasFittedInitialBounds = false;
    let isFetchingRoute = false;
    let lastRouteOriginLat = null;
    let lastRouteOriginLng = null;
    let lastPanLat = null;
    let lastPanLng = null;
    let hasReceivedNativeGps = false;
    let userGpsLat = currentLat;
    let userGpsLng = currentLng;

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
            lastRoadPoints = roadPoints;

            // Gambar atau perbarui rute jalan raya dengan Canvas Renderer berkecepatan tinggi
            if (routePolyline) {
              if (!map.hasLayer(routePolyline)) {
                routePolyline.addTo(map);
              }
              routePolyline.setLatLngs(roadPoints);
              if (typeof routePolyline.redraw === 'function') {
                routePolyline.redraw();
              }
            } else {
              routePolyline = L.polyline(roadPoints, {
                color: '#0284c7',
                weight: 5,
                opacity: 0.88,
                lineJoin: 'round',
                lineCap: 'round',
                smoothFactor: 1.5,
                renderer: routeCanvasRenderer
              }).addTo(map);
            }

            const distMeters = route.distance;
            const distFormatted = distMeters < 1000
              ? Math.round(distMeters) + ' m'
              : (distMeters / 1000).toFixed(1) + ' km';

            if (chip && isRouteVisible) {
              chip.innerText = '🛣️ Rute Jalan: ' + distFormatted;
              chip.classList.add('active');
            }

            // HANYA sesuaikan batas kamera (fitBounds) jika secara eksplisit diminta (misal: saat pertama kali buka atau klik tombol rute)
            // JANGAN PERNAH panggil fitBounds pada pergerakan GPS berkala atau saat sedang zoom agar peta tidak loncat-loncat!
            if (shouldFitBounds && roadPoints.length > 0 && !isMapZooming && !isUserTouching) {
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

    function renderRealCustomerMarkers(rawList) {
      customerMarkers.forEach(m => map.removeLayer(m));
      customerMarkers = [];
      // JANGAN hapus routePolyline di sini agar rute tidak hilang/berkedip saat data diperbarui

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
          fotoPersil: c.fotoPersil || null,
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
        m._cust = cust;
        cust._marker = m;

        const handleSmbAction = () => {
          if (!m.isPopupOpen()) {
            m.openPopup();
          }
          // Tampilkan foto persil sesuai nomor SMB yang diklik
          // PENTING: JANGAN ubah koordinat GPS & JANGAN timpa rute tagihan pelanggan yang sedang tampil!
          triggerShowFotoPersil(cust);
        };

        // Hanya cantumkan nomor SMB pelanggan saja sesuai instruksi (interaktif untuk klik foto persil)
        m.bindTooltip(customerSmb, {
          permanent: true,
          direction: 'top',
          className: 'customer-name-tooltip',
          offset: [0, -10],
          interactive: true
        });

        // Popup saat marker diklik menampilkan nomor SMB pelanggan & aksi lihat foto
        const popupEl = document.createElement('div');
        popupEl.style.cssText = 'font-size:13px; font-weight:700; color:#07326E; text-align:center; padding:3px 6px; cursor:pointer;';
        popupEl.innerHTML = '<div>' + customerSmb + '</div><div style="font-size:11px; color:#0284C7; margin-top:2px; font-weight:600;">📷 Lihat Foto Persil</div>';
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
    window.handleLocationUpdate = function(lat, lng, accuracy, heading) {
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
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

      // Update heading jika dikirimkan bersama lokasi
      if (typeof heading === 'number' && !isNaN(heading) && heading >= 0) {
        applyHeadingUpdate(heading);
      }

      // 1. Update radar marker posisi saya
      if (!gpsRadarMarker) {
        const gpsIcon = L.divIcon({
          className: 'gps-ring-container',
          html: '<div class="gps-marker-ring"><div class="gps-marker-core"></div></div>' +
                '<div id="gps-heading-cone" class="gps-heading-cone">' +
                  '<svg viewBox="0 0 14 14" width="14" height="14">' +
                    '<polygon points="7,0 13,13 7,9 1,13" fill="#2563EB" />' +
                  '</svg>' +
                '</div>',
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
      // Mencegah jitter/getaran sensor GPS saat diam di tempat, dan JANGAN gerakkan saat sedang zoom/interaksi
      if (followUser && !isMapZooming && !isUserTouching && !(map && map._animatingZoom)) {
        let distFromLastPan = 999;
        if (lastPanLat !== null && lastPanLng !== null) {
          distFromLastPan = calculateDistanceMeters(lastPanLat, lastPanLng, lat, lng);
        }
        if (distFromLastPan >= 5) {
          lastPanLat = lat;
          lastPanLng = lng;
          map.panTo([lat, lng], { animate: true, duration: 0.8, easeLinearity: 0.25 });
        }
      }

      // 4. Update rute jalan asli hanya jika jarak berpindah minimal 25 meter dari rute sebelumnya
      if (currentValidCustomers && currentValidCustomers.length > 0 && isRouteVisible && !isFetchingRoute && !isMapZooming && !isUserTouching) {
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

    // Update jarum kompas & cone marker setiap kali peta berputar (baik oleh sentuhan 2 jari maupun otomatis)
    map.on('rotate', function() {
      const bearing = map.getBearing ? map.getBearing() : 0;
      const needle = document.getElementById('compass-icon-wrapper');
      if (needle) {
        needle.style.transform = 'rotate(' + (-bearing) + 'deg)';
      }
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

    // Reset ke arah Utara saat tombol kompas diklik
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
    document.getElementById('fab-compass').addEventListener('click', resetNorth);

    // Tombol Putar Cepat Kiri & Kanan (15 derajat)
    document.getElementById('fab-rotate-left').addEventListener('click', function() {
      isHeadingFollowActive = false;
      const chipHeading = document.getElementById('chip-heading');
      if (chipHeading) {
        chipHeading.classList.remove('following');
        chipHeading.innerText = '🧭 Sesuai Arah';
      }
      if (map.setBearing && map.getBearing) {
        map.setBearing(map.getBearing() - 15);
      }
    });

    document.getElementById('fab-rotate-right').addEventListener('click', function() {
      isHeadingFollowActive = false;
      const chipHeading = document.getElementById('chip-heading');
      if (chipHeading) {
        chipHeading.classList.remove('following');
        chipHeading.innerText = '🧭 Sesuai Arah';
      }
      if (map.setBearing && map.getBearing) {
        map.setBearing(map.getBearing() + 15);
      }
    });

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

    function disableFollowUser() {
      if (!followUser) return;
      followUser = false;
      const chipFollow = document.getElementById('chip-follow');
      if (chipFollow) {
        chipFollow.classList.remove('following');
        chipFollow.innerText = '🎯 Pusatkan ke Saya';
      }
      const fabGps = document.getElementById('fab-gps');
      if (fabGps) fabGps.classList.remove('active-tracking');
    }

    // Jika pengguna menggeser atau zoom peta secara manual, nonaktifkan auto-follow sementara
    map.on('dragstart', disableFollowUser);
    map.on('zoomstart', function() {
      isMapZooming = true;
      disableFollowUser();
    });
    map.on('zoomend', function() {
      isMapZooming = false;
      if (routePolyline && typeof routePolyline.redraw === 'function') {
        routePolyline.redraw();
      }
      if (pendingLocationUpdate) {
        const p = pendingLocationUpdate;
        pendingLocationUpdate = null;
        window.handleLocationUpdate(p.lat, p.lng, p.accuracy, p.heading);
      }
    });
    map.on('rotatestart', disableFollowUser);
    map.on('rotateend', function() {
      if (routePolyline && typeof routePolyline.redraw === 'function') {
        routePolyline.redraw();
      }
    });

    // Pastikan rute dan canvas Leaflet tetap segar & tidak hilang saat kembali dari modal foto atau aplikasi lain
    function refreshMapAndRoute() {
      if (map && typeof map.invalidateSize === 'function') {
        map.invalidateSize(false);
      }
      if (lastRoadPoints && lastRoadPoints.length > 0 && isRouteVisible) {
        if (!routePolyline) {
          routePolyline = L.polyline(lastRoadPoints, {
            color: '#0284c7',
            weight: 5,
            opacity: 0.88,
            lineJoin: 'round',
            lineCap: 'round',
            smoothFactor: 1.5,
            renderer: routeCanvasRenderer
          }).addTo(map);
        } else {
          if (!map.hasLayer(routePolyline)) {
            routePolyline.addTo(map);
          }
          routePolyline.setLatLngs(lastRoadPoints);
        }
        if (routePolyline && typeof routePolyline.redraw === 'function') {
          routePolyline.redraw();
        }
      } else if (currentValidCustomers && currentValidCustomers.length > 0 && isRouteVisible && !isFetchingRoute) {
        fetchAndDrawRoadRoute(userGpsLat, userGpsLng, currentValidCustomers, false);
      }
    }

    window.refreshMapAndRoute = refreshMapAndRoute;
    window.addEventListener('focus', refreshMapAndRoute);
    window.addEventListener('resize', refreshMapAndRoute);
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        refreshMapAndRoute();
      }
    });

    // Deteksi sentuhan multi-jari langsung pada kontainer peta
    const mapEl = document.getElementById('map');
    if (mapEl) {
      mapEl.addEventListener('touchstart', function(e) {
        if (e.touches && e.touches.length > 1) {
          isUserTouching = true;
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

    // Panggil awal
    updateCoordinateInfo(currentLat, currentLng, 'Menghubungkan GPS...', 15);
    renderRealCustomerMarkers(initialCustomers);
  </script>
</body>
</html>`;
}
