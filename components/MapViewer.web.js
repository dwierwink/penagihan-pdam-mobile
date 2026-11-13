import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { getMapHtml } from './generateMapHtml';

export default function MapViewer({ style, userLocation, userHeading, customers = [], onOpenFotoPersil, onSelectCustomer, isPhotoModalOpen }) {
  const iframeRef = useRef(null);
  const isLoadedRef = useRef(false);

  const latestCustomersRef = useRef(customers);
  latestCustomersRef.current = customers;

  const latestUserLocationRef = useRef(userLocation);
  latestUserLocationRef.current = userLocation;

  const latestUserHeadingRef = useRef(userHeading);
  latestUserHeadingRef.current = userHeading;

  // Simpan HTML awal dalam ref agar iframe TIDAK PERNAH me-reload saat koordinat GPS terupdate
  const initialCoordsRef = useRef(userLocation);
  const initialCustomersRef = useRef(customers);
  const htmlRef = useRef(null);
  if (!htmlRef.current) {
    htmlRef.current = getMapHtml(initialCoordsRef.current, initialCustomersRef.current);
  }

  const lastLocRef = useRef(null);
  const sendLocationToIframe = (loc, force = false) => {
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return;
    if (!iframeRef.current || !iframeRef.current.contentWindow || !isLoadedRef.current) return;

    if (!force && lastLocRef.current) {
      const dLat = Math.abs(lastLocRef.current.lat - loc.lat);
      const dLng = Math.abs(lastLocRef.current.lng - loc.lng);
      if (dLat < 0.000008 && dLng < 0.000008 && Math.abs((lastLocRef.current.heading || 0) - (loc.heading || 0)) < 1.5) {
        return;
      }
    }
    lastLocRef.current = loc;
    const msg = JSON.stringify({
      type: 'UPDATE_LOCATION',
      lat: loc.lat,
      lng: loc.lng,
      accuracy: loc.accuracy || 10,
      heading: (typeof loc.heading === 'number' && !isNaN(loc.heading)) ? loc.heading : null,
    });
    try {
      iframeRef.current.contentWindow.postMessage(msg, '*');
    } catch (e) {
      // ignore cross-origin error
    }
  };

  const lastHeadingRef = useRef(null);
  const sendHeadingToIframe = (heading) => {
    if (typeof heading !== 'number' || isNaN(heading)) return;
    if (lastHeadingRef.current !== null && Math.abs(lastHeadingRef.current - heading) < 2.5) {
      return;
    }
    lastHeadingRef.current = heading;
    if (iframeRef.current && iframeRef.current.contentWindow && isLoadedRef.current) {
      const msg = JSON.stringify({
        type: 'UPDATE_HEADING',
        heading,
      });
      try {
        iframeRef.current.contentWindow.postMessage(msg, '*');
      } catch (e) {
        // ignore cross-origin error
      }
    }
  };

  const lastCustomersFingerprintRef = useRef('');
  const getCustomersFingerprint = (list) => {
    if (!Array.isArray(list)) return '';
    return list.map((c) => {
      if (!c) return '';
      const id = c.id || c.tagihanId || c.noSmb || '';
      const lat = c.lat !== undefined ? c.lat : c.latitude;
      const lng = c.lng !== undefined ? c.lng : c.longitude;
      const foto = c.fotoPersil ? '1' : '0';
      return `${id}:${lat}:${lng}:${foto}`;
    }).join('|');
  };

  const sendCustomersToIframe = (custList, force = false) => {
    if (!iframeRef.current || !iframeRef.current.contentWindow || !isLoadedRef.current) return;
    const fingerprint = getCustomersFingerprint(custList);
    if (!force && fingerprint && fingerprint === lastCustomersFingerprintRef.current) {
      return;
    }
    lastCustomersFingerprintRef.current = fingerprint;

    const msg = JSON.stringify({
      type: 'UPDATE_CUSTOMERS',
      customers: custList || [],
    });
    try {
      iframeRef.current.contentWindow.postMessage(msg, '*');
    } catch (e) {
      // ignore cross-origin error
    }
  };

  useEffect(() => {
    latestUserLocationRef.current = userLocation;
    if (isLoadedRef.current) {
      sendLocationToIframe(userLocation);
    }
  }, [userLocation]);

  useEffect(() => {
    latestUserHeadingRef.current = userHeading;
    if (isLoadedRef.current && userHeading !== null && userHeading !== undefined) {
      sendHeadingToIframe(userHeading);
    }
  }, [userHeading]);

  useEffect(() => {
    latestCustomersRef.current = customers;
    if (isLoadedRef.current) {
      sendCustomersToIframe(customers);
    }
  }, [customers]);

  useEffect(() => {
    const handleWebMessage = (e) => {
      try {
        let data = e.data;
        if (typeof data === 'string') {
          data = JSON.parse(data);
        }
        if (data && data.type === 'OPEN_FOTO_PERSIL') {
          if (typeof onOpenFotoPersil === 'function') {
            onOpenFotoPersil(data);
          } else if (typeof onSelectCustomer === 'function') {
            onSelectCustomer(data);
          }
        }
      } catch (err) {}
    };
    window.addEventListener('message', handleWebMessage);
    return () => window.removeEventListener('message', handleWebMessage);
  }, [onOpenFotoPersil, onSelectCustomer]);

  // Saat modal foto persil ditutup, kirim REFRESH_MAP ke iframe
  const prevModalOpenRef = useRef(false);
  useEffect(() => {
    if (prevModalOpenRef.current && !isPhotoModalOpen) {
      const sendRefresh = () => {
        if (iframeRef.current && iframeRef.current.contentWindow) {
          try {
            iframeRef.current.contentWindow.postMessage(JSON.stringify({ type: 'REFRESH_MAP' }), '*');
          } catch (e) {}
        }
      };
      sendRefresh();
      const t1 = setTimeout(sendRefresh, 150);
      const t2 = setTimeout(sendRefresh, 400);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    prevModalOpenRef.current = !!isPhotoModalOpen;
  }, [isPhotoModalOpen]);

  return (
    <View style={[styles.container, style]}>
      <iframe
        ref={iframeRef}
        title="Google Maps Rute Tagihan PDAM"
        srcDoc={htmlRef.current}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: 16,
        }}
        allow="geolocation *"
        onLoad={() => {
          isLoadedRef.current = true;
          const currLoc = latestUserLocationRef.current;
          if (currLoc) {
            sendLocationToIframe(currLoc, true);
          }
          const currHeading = latestUserHeadingRef.current;
          if (currHeading !== null && currHeading !== undefined) {
            sendHeadingToIframe(currHeading);
          }
          const currCusts = latestCustomersRef.current;
          if (currCusts && currCusts.length > 0) {
            sendCustomersToIframe(currCusts, false);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
  },
});
