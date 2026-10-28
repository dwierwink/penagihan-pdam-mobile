import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { getMapHtml } from './generateMapHtml';

export default function MapViewer({ style, userLocation, customers = [] }) {
  const webViewRef = useRef(null);

  const sendLocationToWebView = (loc) => {
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return;
    if (webViewRef.current) {
      const jsCode = `
        if (typeof window.handleLocationUpdate === 'function') {
          window.handleLocationUpdate(${loc.lat}, ${loc.lng}, ${loc.accuracy || 10});
        }
        true;
      `;
      webViewRef.current.injectJavaScript(jsCode);
    }
  };

  const sendCustomersToWebView = (custList) => {
    if (webViewRef.current) {
      const jsonStr = JSON.stringify(custList || []);
      const jsCode = `
        if (typeof window.updateCustomersData === 'function') {
          window.updateCustomersData(${jsonStr});
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
    sendCustomersToWebView(customers);
  }, [customers]);

  const html = getMapHtml(userLocation, customers);

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html }}
        style={styles.webView}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        geolocationEnabled={true}
        startInLoadingState={true}
        onLoadEnd={() => {
          if (userLocation) {
            setTimeout(() => sendLocationToWebView(userLocation), 600);
          }
          if (customers && customers.length > 0) {
            setTimeout(() => sendCustomersToWebView(customers), 700);
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
