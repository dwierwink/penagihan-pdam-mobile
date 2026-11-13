import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { getMapHtml } from './generateMapHtml';

export default function MapViewer({ style, userLocation, userHeading, customers = [], onOpenFotoPersil, onSelectCustomer, isPhotoModalOpen }) {
  const webViewRef = useRef(null);
  const isLoadedRef = useRef(false);

  const latestCustomersRef = useRef(customers);
  latestCustomersRef.current = customers;

  const latestUserLocationRef = useRef(userLocation);
  latestUserLocationRef.current = userLocation;

  const latestUserHeadingRef = useRef(userHeading);
  latestUserHeadingRef.current = userHeading;

  // Simpan HTML awal dalam ref agar WebView TIDAK PERNAH me-reload saat koordinat GPS terupdate
  const initialCoordsRef = useRef(userLocation);
  const initialCustomersRef = useRef(customers);
  const htmlRef = useRef(null);
  if (!htmlRef.current) {
    htmlRef.current = getMapHtml(initialCoordsRef.current, initialCustomersRef.current);
  }

  const lastLocRef = useRef(null);
  const sendLocationToWebView = (loc, force = false) => {
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return;
    if (!webViewRef.current || !isLoadedRef.current) return;

    if (!force && lastLocRef.current) {
      const dLat = Math.abs(lastLocRef.current.lat - loc.lat);
      const dLng = Math.abs(lastLocRef.current.lng - loc.lng);
      if (dLat < 0.000008 && dLng < 0.000008 && Math.abs((lastLocRef.current.heading || 0) - (loc.heading || 0)) < 1.5) {
        return;
      }
    }
    lastLocRef.current = loc;
    const headingVal = (typeof loc.heading === 'number' && !isNaN(loc.heading)) ? loc.heading : 'null';
    const jsCode = `
      if (typeof window.handleLocationUpdate === 'function') {
        window.handleLocationUpdate(${loc.lat}, ${loc.lng}, ${loc.accuracy || 10}, ${headingVal});
      }
      true;
    `;
    webViewRef.current.injectJavaScript(jsCode);
  };

  const lastHeadingRef = useRef(null);
  const sendHeadingToWebView = (heading) => {
    if (typeof heading !== 'number' || isNaN(heading)) return;
    if (lastHeadingRef.current !== null && Math.abs(lastHeadingRef.current - heading) < 2.5) {
      return;
    }
    lastHeadingRef.current = heading;
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

  const sendCustomersToWebView = (custList, force = false) => {
    if (!webViewRef.current || !isLoadedRef.current) return;
    const fingerprint = getCustomersFingerprint(custList);
    if (!force && fingerprint && fingerprint === lastCustomersFingerprintRef.current) {
      // Data pelanggan tidak berubah, jangan injeksi JavaScript agar peta tidak reload/berkedip saat GPS bergerak
      return;
    }
    lastCustomersFingerprintRef.current = fingerprint;

    const jsonStr = JSON.stringify(custList || []);
    const jsCode = `
      try {
        if (typeof window.updateCustomersData === 'function') {
          window.updateCustomersData(${jsonStr});
        }
      } catch (e) {
        console.warn('Gagal update pelanggan:', e);
      }
      true;
    `;
    webViewRef.current.injectJavaScript(jsCode);
  };

  useEffect(() => {
    latestUserLocationRef.current = userLocation;
    if (isLoadedRef.current) {
      sendLocationToWebView(userLocation);
    }
  }, [userLocation]);

  useEffect(() => {
    latestUserHeadingRef.current = userHeading;
    if (isLoadedRef.current && userHeading !== null && userHeading !== undefined) {
      sendHeadingToWebView(userHeading);
    }
  }, [userHeading]);

  useEffect(() => {
    latestCustomersRef.current = customers;
    if (isLoadedRef.current) {
      sendCustomersToWebView(customers);
    }
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

  const webViewSource = React.useMemo(() => ({ html: htmlRef.current }), []);

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={webViewSource}
        style={styles.webView}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        geolocationEnabled={true}
        mixedContentMode="always"
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        allowFileAccessFromFileURLs={true}
        startInLoadingState={true}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.warn('WebView error: ', nativeEvent);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.warn('WebView HTTP error: ', nativeEvent.statusCode, nativeEvent.url);
        }}
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
          const currLoc = latestUserLocationRef.current;
          if (currLoc) {
            sendLocationToWebView(currLoc, true);
          }
          const currHeading = latestUserHeadingRef.current;
          if (currHeading !== null && currHeading !== undefined) {
            sendHeadingToWebView(currHeading);
          }
          const currCusts = latestCustomersRef.current;
          if (currCusts && currCusts.length > 0) {
            sendCustomersToWebView(currCusts, false);
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
