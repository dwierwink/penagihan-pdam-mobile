import React from 'react';
import { Platform, View, Text } from 'react-native';

let PickerComponent = null;

if (Platform.OS === 'web') {
  PickerComponent = require('./MapPicker.web').default;
} else {
  try {
    PickerComponent = require('./MapPicker.native').default;
  } catch (e) {
    PickerComponent = null;
  }
}

export default function MapPicker(props) {
  if (!PickerComponent) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Peta Picker tidak dapat dimuat</Text>
      </View>
    );
  }
  return <PickerComponent {...props} />;
}
