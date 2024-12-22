import { useRecoilState } from 'recoil';
import { View } from 'react-native';
import { ToggleButton } from 'react-native-paper';
import { groupScreenModeState } from '../states';

export default function HomeScreenToggleButtons() {
  const [ groupScreenMode, setGroupScreenMode ] = useRecoilState(groupScreenModeState);

  const onValueChange = (value: string) => {
    if (value === 'timeline' || value === 'ranking') {
      setGroupScreenMode(value);
    }
  };

  return (
    <View>
      <ToggleButton.Row value={groupScreenMode} onValueChange={onValueChange}>
        <ToggleButton icon="clock" value="timeline"/>
        <ToggleButton icon="crown" value="ranking"/>
      </ToggleButton.Row>
    </View>
  );
}
