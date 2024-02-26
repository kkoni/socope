import 'fast-text-encoding';
import 'react-native-url-polyfill/auto';
import { RecoilRoot, useRecoilState } from 'recoil';
import { StatusBar } from 'expo-status-bar';
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
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createStackNavigator } from '@react-navigation/stack';
import CreateGroupScreen from './components/CreateGroupScreen';
import HomeScreen from './components/HomeScreen';
import { allGroupsState } from './states';

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

const Drawer = createDrawerNavigator();
const Stack = createStackNavigator();

export default function App() {
  return (
    <RecoilRoot>
      <PaperProvider theme={CombinedLightTheme}>
        <NavigationContainer theme={CombinedLightTheme}>
          <AppContainer/>
          <StatusBar style="auto" />
        </NavigationContainer>
      </PaperProvider>
    </RecoilRoot>
  );
}

export function AppContainer() {
  const [ allGroups ] = useRecoilState(allGroupsState);

  if (allGroups.length === 0) {
    return (
      <Stack.Navigator>
        <Stack.Screen name="Create a Group" component={CreateGroupScreen}/>
      </Stack.Navigator>
    );
  } else {
    return MainContainer();
  }
}

export function MainContainer() {
  return (
    <Drawer.Navigator screenOptions={{headerShown: true}}>
      <Drawer.Screen name="Home" options={{headerTitle: 'Soccet'}} component={HomeScreen}/>
      <Drawer.Screen name="Create a Gruop" component={CreateGroupScreen}/>
    </Drawer.Navigator>
  );
}
