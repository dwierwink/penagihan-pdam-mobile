import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { getMapHtml } from './generateMapHtml';

export default function MapViewer({ style, userLocation, customers = [] }) {
  const iframeRef = useRef(null);

  const sendLocationToIframe = (loc) => {
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return;
    if (iframeRef.current && iframeRef.current.contentWindow) {
      const msg = JSON.stringify({
        type: 'UPDATE_LOCATION',
        lat: loc.lat,
        lng: loc.lng,
        accuracy: loc.accuracy || 10,
      });
      try {
        iframeRef.current.contentWindow.postMessage(msg, '*');
      } catch (e) {
        // ignore cross-origin error
      }
    }
  };

  const sendCustomersToIframe = (custList) => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
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
    sendCustomersToIframe(customers);
  }, [customers]);

  const html = getMapHtml(userLocation, customers);

  return (
    <View style={[styles.container, style]}>
      <iframe
        ref={iframeRef}
        title="Google Maps Rute Tagihan PDAM"
        srcDoc={html}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: 16,
        }}
        allow="geolocation *"
        onLoad={() => {
          if (userLocation) {
            setTimeout(() => sendLocationToIframe(userLocation), 500);
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
