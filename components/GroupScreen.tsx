import { useRecoilState } from 'recoil';
import { useFocusEffect } from '@react-navigation/native';
import { selectedGroupIdState } from '../states';
import { Group } from '../model/data';
import GroupTimeline from './GroupTimeline';

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
    <GroupTimeline groupId={props.group.id}/>
  );
}
