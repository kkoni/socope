import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRecoilState } from 'recoil';
import { Avatar, Button, Portal, Snackbar, Text, TextInput } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { allGroupsState, jumpedGroupIdState } from '../states';
import { createGroup } from '../facades';
import { Actor, ActorId, SNSTypes } from '../model/data';
import { getActorRepository, getGroupRepository } from '../model/repositories';

export default function CreateGroupScreen() {
  const [ allGroups, setAllGroups ] = useRecoilState(allGroupsState);
  const [ jumpedGroupId, setJumpedGroupId ] = useRecoilState(jumpedGroupIdState);
  const navigation: any = useNavigation();

  const [ groupName, setGroupName ] = useState<string>('');
  const [ handle, setHandle ] = useState<string>('');
  const [ actorsToAdd, setActorsToAdd ] = useState<Actor[]>([]);
  const [ actorFetchErrorSnackbarVisible, setActorFetchErrorSnackbarVisible ] = useState<boolean>(false);
  const [ actorFetchError, setActorFetchError ] = useState<string>('');
  const [ actorAddedSnackbarVisible, setActorAddedSnackbarVisible ] = useState<boolean>(false);

  const addActorHandler = async () => {
    try {
      const trimmedHandle = handle.trim();
      if (trimmedHandle === '') {
        setActorFetchError('Handle is empty');
        setActorFetchErrorSnackbarVisible(true);
        return;
      }
      const actor = await getActorRepository().fetchByHandle(trimmedHandle);
      if (actor === undefined) {
        setActorFetchError('Actor not found');
        setActorAddedSnackbarVisible(false);
        setActorFetchErrorSnackbarVisible(true);
      } else if (actorsToAdd.some(a => a.id.equals(actor.id))) {
        setActorFetchError('Actor already added');
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

  const removeActorHandler = async (actorId: ActorId) => {
    setActorsToAdd(actorsToAdd.filter(actor => !actor.id.equals(actorId)));
  }

  const createGroupHandler = async () => {
    const groupRepository = await getGroupRepository();
    let name = groupName.trim();
    if (name.length === 0) {
      name = 'Group ' + (await groupRepository.getNextId()).value;
    }
    await createGroup(name, actorsToAdd.map(a => a.id), [allGroups, setAllGroups], [jumpedGroupId, setJumpedGroupId]);
    setGroupName('');
    setHandle('');
    setActorsToAdd([]);
    navigation.navigate('Home');
  }

  const createActorView = (actor: Actor) => (
    <View key={actor.id.toString()} style={styles.actorView}>
      <View style={styles.actorIconView}>
        { actor.icon && <Avatar.Image source={{uri: actor.icon}} size={48}/> }
      </View>
      <View style={styles.actorNameView}>
        <Text>{actor.name} ({actor.handle})</Text>
      </View>
      <View style={styles.actorRemoveView}>
        <Button mode="text" style={styles.actorRemoveButton} onPress={() => removeActorHandler(actor.id)}>Remove</Button>
      </View>
    </View>
  );

  const activityPubActorViews = actorsToAdd.filter(a => a.id.snsType === SNSTypes.ActivityPub).map(createActorView);
  const atProtoActorViews = actorsToAdd.filter(a => a.id.snsType === SNSTypes.ATProto).map(createActorView);

  return (
    <View>
      <Text>Group Name</Text>
      <TextInput
        value={groupName}
        onChangeText={setGroupName}
        placeholder="Enter the name of the new group"
        autoCapitalize='none'
      />
      <Text>
        Specify some ActivityPub(Mastodon etc.) or ATProto(BlueSky) users you want to follow up.
        (e.g. xxx@mastodon.social for ActivityPub or xxx.bsky.social for ATProto)
      </Text>
      <TextInput
        value={handle}
        onChangeText={setHandle}
        placeholder="Enter a handle"
        autoCapitalize='none'
      />
      <Button mode="contained" onPress={addActorHandler} style={styles.addButton}>Add</Button>
      { activityPubActorViews.length > 0 && (
        <View style={styles.actorListView}>
          <Text variant="titleSmall" style={styles.actorListViewHeader}>ActivityPub</Text>
          { activityPubActorViews }
        </View>
      )}
      { atProtoActorViews.length > 0 && (
        <View style={styles.actorListView}>
          <Text variant="titleSmall" style={styles.actorListViewHeader}>ATProto</Text>
          { atProtoActorViews }
        </View>
      )}
      { actorsToAdd.length > 0 && <Button mode="contained" onPress={createGroupHandler}>Create Group</Button> }
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
          <Text>Actor found.</Text>
        </Snackbar>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  addButton: { marginTop: 10, marginBottom: 10 },
  actorView: { flexDirection: 'row' },
  actorIconView: { flex: 1 },
  actorNameView: { flex: 3, justifyContent: 'center', marginLeft: 10 },
  actorRemoveView: { flex: 2, justifyContent: 'center' },
  actorRemoveButton: { padding: 0 },
  actorListView: { marginTop: 10 },
  actorListViewHeader: { marginBottom: 5 },
});
