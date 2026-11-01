import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { getMapHtml } from './generateMapHtml';

export default function MapViewer({ style, userLocation, userHeading, customers = [], onOpenFotoPersil, onSelectCustomer, isPhotoModalOpen }) {
  const webViewRef = useRef(null);
  const isLoadedRef = useRef(false);

  // Simpan HTML awal dalam ref agar WebView TIDAK PERNAH me-reload saat koordinat GPS terupdate
  const initialCoordsRef = useRef(userLocation);
  const initialCustomersRef = useRef(customers);
  const htmlRef = useRef(null);
  if (!htmlRef.current) {
    htmlRef.current = getMapHtml(initialCoordsRef.current, initialCustomersRef.current);
  }

  const sendLocationToWebView = (loc) => {
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return;
    if (webViewRef.current && isLoadedRef.current) {
      const headingVal = (typeof loc.heading === 'number' && !isNaN(loc.heading)) ? loc.heading : 'null';
      const jsCode = `
        if (typeof window.handleLocationUpdate === 'function') {
          window.handleLocationUpdate(${loc.lat}, ${loc.lng}, ${loc.accuracy || 10}, ${headingVal});
        }
        true;
      `;
      webViewRef.current.injectJavaScript(jsCode);
    }
  };

  const sendHeadingToWebView = (heading) => {
    if (typeof heading !== 'number' || isNaN(heading)) return;
    if (webViewRef.current && isLoadedRef.current) {
      const jsCode = `
        if (typeof window.handleHeadingUpdate === 'function') {
          window.handleHeadingUpdate(${heading});
        }
        true;
      `;
      webViewRef.current.injectJavaScript(jsCode);
    }
  };

  const sendCustomersToWebView = (custList) => {
    if (webViewRef.current && isLoadedRef.current) {
      const jsonStr = JSON.stringify(custList || []);
      const jsCode = `
        try {
          if (typeof window.updateCustomersData === 'function') {
            window.updateCustomersData(${JSON.stringify(jsonStr)});
          }
        } catch (e) {
          console.warn('Gagal update pelanggan:', e);
        }
        true;
      `;
      webViewRef.current.injectJavaScript(jsCode);
    }
  };

  useEffect(() => {
    sendLocationToWebView(userLocation);
  }, [userLocation]);

  useEffect(() => {
    if (userHeading !== null && userHeading !== undefined) {
      sendHeadingToWebView(userHeading);
    }
  }, [userHeading]);

  useEffect(() => {
    sendCustomersToWebView(customers);
  }, [customers]);

  // Saat modal foto persil ditutup, pastikan rute dan canvas Leaflet langsung disegarkan & digambar ulang
  const prevModalOpenRef = useRef(false);
  useEffect(() => {
    if (prevModalOpenRef.current && !isPhotoModalOpen) {
      const triggerRefresh = () => {
        if (webViewRef.current && isLoadedRef.current) {
          webViewRef.current.injectJavaScript(`
            if (typeof window.refreshMapAndRoute === 'function') {
              window.refreshMapAndRoute();
            }
            true;
          `);
        }
      };
      triggerRefresh();
      const t1 = setTimeout(triggerRefresh, 150);
      const t2 = setTimeout(triggerRefresh, 400);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    prevModalOpenRef.current = !!isPhotoModalOpen;
  }, [isPhotoModalOpen]);

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: htmlRef.current }}
        style={styles.webView}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        geolocationEnabled={true}
        startInLoadingState={true}
        onMessage={(event) => {
          try {
            const raw = event.nativeEvent.data;
            const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (data && data.type === 'OPEN_FOTO_PERSIL') {
              if (typeof onOpenFotoPersil === 'function') {
                onOpenFotoPersil(data);
              } else if (typeof onSelectCustomer === 'function') {
                onSelectCustomer(data);
              }
            }
          } catch (e) {
            // ignore
          }
        }}
        onLoadEnd={() => {
          isLoadedRef.current = true;
          if (userLocation) {
            setTimeout(() => sendLocationToWebView(userLocation), 400);
          }
          if (userHeading !== null && userHeading !== undefined) {
            setTimeout(() => sendHeadingToWebView(userHeading), 500);
          }
          if (customers && customers.length > 0) {
            setTimeout(() => sendCustomersToWebView(customers), 600);
          }
        }}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#07326E" />
          </View>
        )}
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
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
});
