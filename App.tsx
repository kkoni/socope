import 'fast-text-encoding';
import 'react-native-url-polyfill/auto';
import { useEffect } from 'react';
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
import CreateGroupScreen from './components/CreateGroupScreen';
import HomeScreen from './components/HomeScreen';
import HomeScreenToggleButtons from './components/HomeScreenToggleButtons';
import GroupDetailScreen from './components/GroupDetailScreen';
import WorkerLauncher from './components/WorkerLauncher';
import DevToolsScreen from './components/DevToolsScreen';
import { allGroupsState } from './states';
import { getGroupRepository } from './model/repositories';

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

export default function App() {
  return (
    <RecoilRoot>
      <PaperProvider theme={CombinedLightTheme}>
        <NavigationContainer theme={CombinedLightTheme}>
          <AppContainer/>
          <StatusBar style="auto" />
          <WorkerLauncher/>
        </NavigationContainer>
      </PaperProvider>
    </RecoilRoot>
  );
}

export function AppContainer() {
  const [ allGroups, setAllGroups ] = useRecoilState(allGroupsState);

  useEffect(() => {(async () => {
    setAllGroups(await (await getGroupRepository()).getAll())
  })()}, []);

  return (
    <Drawer.Navigator screenOptions={{headerShown: true}}>
      <Drawer.Screen name="Home" options={{headerRight: () => (<HomeScreenToggleButtons/>)}} component={HomeScreen}/>
      <Drawer.Screen name="Create a Group" component={CreateGroupScreen}/>
      { allGroups.length >= 1 && <Drawer.Screen name="Group Detail" component={GroupDetailScreen}/> }
      <Drawer.Screen name="Dev Tools" component={DevToolsScreen}/>
    </Drawer.Navigator>
  );
}
