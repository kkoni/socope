import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
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
