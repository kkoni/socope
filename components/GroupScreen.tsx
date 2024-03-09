import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { Text } from 'react-native-paper';
import { selectedGroupIdState } from '../states';
import { Group } from '../model/data';

type Props = {
  group: Group;
  navigation: any;
};

export default function GroupScreen(props: Props) {
  const [ _, setSelectedGroupId ] = useRecoilState(selectedGroupIdState);

  useEffect(() => {
    const unsubscribe = props.navigation.addListener('focus', () => {
      setSelectedGroupId(props.group.id);
    });
    return unsubscribe;
  }, [ props.navigation ]);

  return (
    <Text>{props.group.name}</Text>
  );
}
