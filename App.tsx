import { RecoilRoot } from 'recoil';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AddGroupScreen from './components/AddGroupScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <RecoilRoot>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="AddGroupScreen" component={AddGroupScreen}/>
        </Stack.Navigator>
        <StatusBar style="auto" />
      </NavigationContainer>
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
