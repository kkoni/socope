import { Text } from 'react-native-paper';
import { Group } from '../model/data';

type Props = {
  group: Group;
};

export default function GroupScreen(props: Props) {
  return (
    <Text>{props.group.name}</Text>
  );
}
