import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { getMapHtml } from './generateMapHtml';

export default function MapViewer({ style, userLocation, userHeading, customers = [], onOpenFotoPersil, onSelectCustomer, isPhotoModalOpen }) {
  const iframeRef = useRef(null);
  const isLoadedRef = useRef(false);

  // Simpan HTML awal dalam ref agar iframe TIDAK PERNAH me-reload saat koordinat GPS terupdate
  const initialCoordsRef = useRef(userLocation);
  const initialCustomersRef = useRef(customers);
  const htmlRef = useRef(null);
  if (!htmlRef.current) {
    htmlRef.current = getMapHtml(initialCoordsRef.current, initialCustomersRef.current);
  }

  const sendLocationToIframe = (loc) => {
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return;
    if (iframeRef.current && iframeRef.current.contentWindow && isLoadedRef.current) {
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
    }
  };

  const sendHeadingToIframe = (heading) => {
    if (typeof heading !== 'number' || isNaN(heading)) return;
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

  const sendCustomersToIframe = (custList) => {
    if (iframeRef.current && iframeRef.current.contentWindow && isLoadedRef.current) {
      const msg = JSON.stringify({
        type: 'UPDATE_CUSTOMERS',
        customers: custList || [],
      });
      try {
        iframeRef.current.contentWindow.postMessage(msg, '*');
      } catch (e) {
        // ignore cross-origin error
      }
    }
  };

  useEffect(() => {
    sendLocationToIframe(userLocation);
  }, [userLocation]);

  useEffect(() => {
    if (userHeading !== null && userHeading !== undefined) {
      sendHeadingToIframe(userHeading);
    }
  }, [userHeading]);

  useEffect(() => {
    sendCustomersToIframe(customers);
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
          if (userLocation) {
            setTimeout(() => sendLocationToIframe(userLocation), 400);
          }
          if (userHeading !== null && userHeading !== undefined) {
            setTimeout(() => sendHeadingToIframe(userHeading), 500);
          }
          if (customers && customers.length > 0) {
            setTimeout(() => sendCustomersToIframe(customers), 600);
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
