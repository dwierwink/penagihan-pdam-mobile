import React from 'react';
import { Platform, View, Text } from 'react-native';

let MapComponent = null;

if (Platform.OS === 'web') {
  MapComponent = require('./MapViewer.web').default;
} else {
  try {
    MapComponent = require('./MapViewer.native').default;
  } catch (e) {
    MapComponent = null;
  }
}

export default function MapViewer(props) {
  if (!MapComponent) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Peta tidak dapat dimuat</Text>
      </View>
    );
  }
  return <MapComponent {...props} />;
}
