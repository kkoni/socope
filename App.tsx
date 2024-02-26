import 'fast-text-encoding';
import 'react-native-url-polyfill/auto';
import { useEffect } from 'react';
import { RecoilRoot, useRecoilState } from 'recoil';
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
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import CreateGroupScreen from './components/CreateGroupScreen';
import GroupScreen from './components/GroupScreen';
import { allGroupsState, jumpedGroupIdState } from './states';

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
const Tab = createMaterialTopTabNavigator();
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

export function HomeScreen({navigation}: {navigation: any}) {
  const [ allGroups ] = useRecoilState(allGroupsState);
  const [ jumpedGroupId, setJumpedGroupId ] = useRecoilState(jumpedGroupIdState);

  useEffect(() => {
    if (jumpedGroupId !== undefined && allGroups.some(group => group.id.value === jumpedGroupId.value)) {
      setJumpedGroupId(undefined);
      navigation.navigate('Group' + jumpedGroupId.value);
    }
  }, [ jumpedGroupId ]);

  const tabScreens = allGroups.map(group => (
    <Tab.Screen key={group.id.toString()} name={"Group" + group.id.value} options={{tabBarLabel: group.name}}>
      {() => <GroupScreen group={group}/>}
    </Tab.Screen>
  ));
  return (
    <Tab.Navigator>
      {tabScreens}
    </Tab.Navigator>
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
