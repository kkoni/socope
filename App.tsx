import 'fast-text-encoding';
import 'react-native-url-polyfill/auto';
import { RecoilRoot } from 'recoil';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import {
  PaperProvider,
  MD3LightTheme,
  adaptNavigationTheme
} from 'react-native-paper';
import {
  NavigationContainer,
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
} from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AddGroupScreen from './components/AddGroupScreen';

const { LightTheme } = adaptNavigationTheme({
  reactNavigationLight: NavigationDefaultTheme,
  reactNavigationDark: NavigationDarkTheme,
});
const CombinedLightTheme = {
  ...MD3LightTheme,
  ...LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...LightTheme.colors,
  }
};

const Stack = createStackNavigator();

export default function App() {
  return (
    <RecoilRoot>
      <PaperProvider theme={CombinedLightTheme}>
        <NavigationContainer theme={CombinedLightTheme}>
          <Stack.Navigator>
            <Stack.Screen name="AddGroupScreen" component={AddGroupScreen}/>
          </Stack.Navigator>
          <StatusBar style="auto" />
        </NavigationContainer>
      </PaperProvider>
    </RecoilRoot>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
