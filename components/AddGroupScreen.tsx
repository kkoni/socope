import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Avatar, Button, Divider, Portal, RadioButton, Snackbar, Text, TextInput } from 'react-native-paper';
import { Actor, ActorId, SNSType, SNSTypes, parseSNSType, actorIdToString } from '../model/data';
import { getActorRepository } from '../model/repositories';

export default function AddGroupScreen() {
  const [ snsType, setSnsType ] = useState<SNSType>(SNSTypes.ActivityPub);
  const [ handle, setHandle ] = useState<string>('');
  const [ actorsToAdd, setActorsToAdd ] = useState<Actor[]>([]);
  const [ actorFetchErrorSnackbarVisible, setActorFetchErrorSnackbarVisible ] = useState<boolean>(false);
  const [ actorFetchError, setActorFetchError ] = useState<string>('');
  const [ actorAddedSnackbarVisible, setActorAddedSnackbarVisible ] = useState<boolean>(false);

  let handleInputPlaceholder = '';
  switch (snsType) {
    case SNSTypes.ActivityPub:
      handleInputPlaceholder = 'Enter user and host (e.g. xxx@mastodon.social)';
      break;
    case SNSTypes.ATProto:
      handleInputPlaceholder = 'Enter a handle (e.g. xxx.bsky.social)';
      break;
  }

  const addActor = async () => {
    try {
      const trimmedHandle = handle.trim();
      if (trimmedHandle === '') {
        setActorFetchError('Handle is empty');
        setActorFetchErrorSnackbarVisible(true);
        return;
      }
      const actor = await getActorRepository().fetchByHandle(snsType, trimmedHandle);
      if (actor === undefined) {
        setActorFetchError('Actor not found');
        setActorAddedSnackbarVisible(false);
        setActorFetchErrorSnackbarVisible(true);
      } else {
        setActorsToAdd([...actorsToAdd, actor]);
        setActorFetchErrorSnackbarVisible(false);
        setActorAddedSnackbarVisible(true);
        setHandle('');
      }
    } catch(e) {
      console.error(e);
      setActorFetchError('Failed to fetch actor');
      setActorAddedSnackbarVisible(false);
      setActorFetchErrorSnackbarVisible(true);
    }
  };

  const removeActor = async (actorId: ActorId) => {
    const actorIdStr = actorIdToString(actorId);
    setActorsToAdd(actorsToAdd.filter(actor => actorIdToString(actor.id) !== actorIdStr));
  }

  const actorViews = actorsToAdd.map(actor => (
    <View key={actorIdToString(actor.id)} style={styles.actorView}>
      <View style={styles.actorIconView}>
        { actor.icon && <Avatar.Image source={{uri: actor.icon}} size={48}/> }
      </View>
      <View style={styles.actorNameView}>
        <Text>{actor.name} ({actor.handle})</Text>
      </View>
      <View style={styles.actorRemoveView}>
        <Button mode="text" style={styles.actorRemoveButton} onPress={() => removeActor(actor.id)}>Remove</Button>
      </View>
    </View>
  ));

  return (
    <View>
      <Text>Specify some persons you want to follow up.</Text>
      <RadioButton.Group
        onValueChange={v => setSnsType(parseSNSType(v) || SNSTypes.ActivityPub)}
        value={snsType}
      >
        <RadioButton.Item label="ActivityPub" value={SNSTypes.ActivityPub}/>
        <RadioButton.Item label="ATProto" value={SNSTypes.ATProto}/>
      </RadioButton.Group>
      <TextInput
        value={handle}
        onChangeText={setHandle}
        placeholder={handleInputPlaceholder}
        autoCapitalize='none'
      />
      <Button mode="contained" onPress={addActor} style={styles.addButton}>Add</Button>
      { actorViews.length > 0 && (
        <View>
          <Divider/>
          { actorViews }
        </View>
      )}
      <Portal>
        <Snackbar
          visible={actorFetchErrorSnackbarVisible}
          onDismiss={() => setActorFetchErrorSnackbarVisible(false)}
          duration={10000}
        >
          <Text>{ actorFetchError }</Text>
        </Snackbar>
      </Portal>
      <Portal>
        <Snackbar
          visible={actorAddedSnackbarVisible}
          onDismiss={() => setActorAddedSnackbarVisible(false)}
          duration={3000}
        >
          <Text>Actor successfully added.</Text>
        </Snackbar>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  addButton: { marginTop: 10 },
  actorView: { flexDirection: 'row' },
  actorIconView: { flex: 1 },
  actorNameView: { flex: 3, justifyContent: 'center', marginLeft: 10 },
  actorRemoveView: { flex: 2, justifyContent: 'center' },
  actorRemoveButton: { padding: 0 },
});
