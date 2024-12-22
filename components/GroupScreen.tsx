import { useRecoilState } from 'recoil';
import { useFocusEffect } from '@react-navigation/native';
import { selectedGroupIdState, groupScreenModeState } from '../states';
import { Group } from '../model/data';
import GroupTimeline from './GroupTimeline';
import GroupRanking from './GroupRanking';

type Props = {
  group: Group;
  navigation: any;
};

export default function GroupScreen(props: Props) {
  const [ _, setSelectedGroupId ] = useRecoilState(selectedGroupIdState);
  const [ groupScreenMode ] = useRecoilState(groupScreenModeState);

  useFocusEffect(() => {
    setSelectedGroupId(props.group.id);
    return () => {};
  });

  if (groupScreenMode === 'timeline') {
    return (
      <GroupTimeline groupId={props.group.id}/>
    );
  } else {
    return (
      <GroupRanking groupId={props.group.id}/>
    );
  }
}
