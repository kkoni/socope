import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { allGroupsState, jumpedGroupIdState } from '../states';
import GroupScreen from './GroupScreen';

const Tab = createMaterialTopTabNavigator();

export default function HomeScreen({navigation}: {navigation: any}) {
  const [ allGroups ] = useRecoilState(allGroupsState);
  const [ jumpedGroupId, setJumpedGroupId ] = useRecoilState(jumpedGroupIdState);

  useEffect(() => {
    if (jumpedGroupId !== undefined && allGroups.some(group => group.id.value === jumpedGroupId.value)) {
      setJumpedGroupId(undefined);
      navigation.navigate('Group' + jumpedGroupId.value);
    }
  }, [ jumpedGroupId ]);

  if (allGroups.length === 0) {
    return (
      <View>
        <Text>Welcome to Soccet!</Text>
        <Button onPress={() => navigation.navigate('Create a Group')}>Create a Group</Button>
      </View>
    );
  }

  const tabScreens = allGroups.map(group => (
    <Tab.Screen key={group.id.toString()} name={"Group" + group.id.value} options={{tabBarLabel: group.name}}>
      {() => <GroupScreen group={group} navigation={navigation}/>}
    </Tab.Screen>
  ));
  return (
    <Tab.Navigator>
      {tabScreens}
    </Tab.Navigator>
  );
}
