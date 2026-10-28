import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { getPickerMapHtml } from './generatePickerHtml';

export default function MapPicker({ style, initialCoords, onSelectCoords }) {
  const iframeRef = useRef(null);
  const html = getPickerMapHtml(initialCoords);

  useEffect(() => {
    const handleWindowMessage = (event) => {
      let data = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {
          return;
        }
      }
      if (data && (data.type === 'CONFIRM_COORD' || data.type === 'COORD_CHANGED') && onSelectCoords) {
        onSelectCoords(data.lat, data.lng, data.type === 'CONFIRM_COORD');
      }
    };

    window.addEventListener('message', handleWindowMessage);
    return () => window.removeEventListener('message', handleWindowMessage);
  }, [onSelectCoords]);

  return (
    <View style={[styles.container, style]}>
      <iframe
        ref={iframeRef}
        title="Google Maps Picker Alamat Rumah"
        srcDoc={html}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: 16,
        }}
        allow="geolocation *"
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
