import React, { useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { getPickerMapHtml } from './generatePickerHtml';

export default function MapPicker({ style, initialCoords, onSelectCoords }) {
  const webViewRef = useRef(null);
  const html = getPickerMapHtml(initialCoords);

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data && (data.type === 'CONFIRM_COORD' || data.type === 'COORD_CHANGED') && onSelectCoords) {
        onSelectCoords(data.lat, data.lng, data.type === 'CONFIRM_COORD');
      }
    } catch (e) {
      console.warn('WebView message error:', e);
    }
  };

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
        onMessage={handleMessage}
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
