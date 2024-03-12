import { useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { selectedGroupIdState } from '../states';
import { Group } from '../model/data';

type Props = {
  group: Group;
  navigation: any;
};

export default function GroupScreen(props: Props) {
  const [ _, setSelectedGroupId ] = useRecoilState(selectedGroupIdState);

  useFocusEffect(() => {
    setSelectedGroupId(props.group.id);
    return () => {};
  });

  return (
    <Text>{props.group.name}</Text>
  );
}
