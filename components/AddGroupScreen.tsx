import { useState } from 'react';
import { Text, TextInput, Button, View, StyleSheet } from 'react-native';
import { Actor, SNSType, SNSTypes } from '../model/data';

export default function AddGroupScreen() {
  const [ snsType, setSnsType ] = useState<SNSType>(SNSTypes.ATProto);
  const [ handle, setHandle ] = useState<string>('');
  const [ actorsToAdd, setActorsToAdd ] = useState<Actor[]>([]);

  let handleInputPlaceholder = '';
  switch (snsType) {
    case SNSTypes.ATProto:
      handleInputPlaceholder = 'Enter a handle (e.g. xxx.bsky.social)';
      break;
    case SNSTypes.ActivityPub:
      handleInputPlaceholder = 'Enter user and host (e.g. xxx@mastodon.social)';
      break;
  }

  return (
    <View>
      <Text>Specify some persons you want to follow up.</Text>
      <TextInput
        value={handle}
        onChangeText={setHandle}
        placeholder={handleInputPlaceholder}
      />
      <Button title="Add"/>
    </View>
  );
}

const styles = StyleSheet.create({
  picker: {
    width: 250,
    height: 200,
    marginTop: -50,
    paddingTop: 0,
  },
  pickerItem: {
    color: 'blue',
    fontSize: 12,
  }
});
