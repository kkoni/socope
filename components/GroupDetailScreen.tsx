import { useState, useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Avatar, Button, Portal, Snackbar, Text, TextInput } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import deepEqual from 'deep-equal';
import { selectedGroupIdState, allGroupsState, jumpedGroupIdState } from '../states';
import { updateGroup, deleteGroup } from '../facades';
import { Actor, ActorId, Group, SNSTypes, Neighbors } from '../model/data';
import { getActorRepository, getGroupRepository, getNeighborsRepository } from '../model/repositories';
import { NeighborCrawlStatus, NeighborCrawlResult } from '../model/worker/data';
import { getNeighborCrawlStatusRepository, getNeighborCrawlResultRepository } from '../model/worker/repositories';

export default function GroupDetailScreen() {
  const [ selectedGroupId ] = useRecoilState(selectedGroupIdState);
  const [ group, setGroup ] = useState<Group|undefined>(undefined);
  const [ actors, setActors ] = useState<Map<string, Actor>>(new Map());
  const [ inEditMode, setInEditMode ] = useState<boolean>(false);

  useEffect(() => { reloadGroup() }, [selectedGroupId]);

  const reloadGroup = async () => {
    if (selectedGroupId !== undefined) {
      const group = await (await getGroupRepository()).get(selectedGroupId);
      setActors(new Map());
      setGroup(group);

      if (group !== undefined) {
        const actorRepository = getActorRepository();
        const actors = new Map<string, Actor>();
        for (const actorId of group.actorIds) {
          const actor = await actorRepository.get(actorId);
          if (actor !== undefined) {
            actors.set(actor.id.toString(), actor);
          }
        }
        setActors(actors);
      }
    }
  };

  const openEditor = () => {
    setInEditMode(true);
  };

  const updateGroup = () => {
    setInEditMode(false);
    reloadGroup();
  };

  const cancelEdit = () => {
    setInEditMode(false);
  };

  if (selectedGroupId === undefined) {
    return (
      <View>
        <Text>No group selected.</Text>
      </View>
    );
  }

  if (group === undefined) {
    return (
      <View>
        <Text>Group not found.</Text>
      </View>
    );
  }

  return (
    <View>
      { inEditMode &&
        <GroupEditorView
          group={group}
          currentActors={actors}
          updateGroupHandler={updateGroup}
          cancelEditHandler={cancelEdit}
        />
      }
      { !inEditMode &&
        <GroupDetailView group={group} actors={actors} openEditorHandler={openEditor}/>
      }
    </View>
  );
}

type GroupDetailViewProps = {
  group: Group;
  actors: Map<string, Actor>;
  openEditorHandler: () => void;
};

function GroupDetailView(props: GroupDetailViewProps) {
  const navigation: any = useNavigation();

  const [ allGroups, setAllGroups ] = useRecoilState(allGroupsState);
  const [ jumpedGroupId, setJumpedGroupId ] = useRecoilState(jumpedGroupIdState);
  const [ selectedGroupId, setSelectedGroupId ] = useRecoilState(selectedGroupIdState);

  const [ neighbors, setNeighbors ] = useState<Neighbors|undefined>(undefined);
  const [ neighborCrawlStatus, setNeighborCrawlStatus ] = useState<NeighborCrawlStatus|undefined>(undefined);
  const [ neighborCrawlResult, setNeighborCrawlResult ] = useState<NeighborCrawlResult|undefined>(undefined);
  const [ closeNeighbors, setCloseNeighbors ] = useState<Map<string, Actor>>(new Map());

  useEffect(() => {
    const fetchNeighborCrawlData = async () => {
      const neighborCrawlStatusRepository = getNeighborCrawlStatusRepository();
      const neighborCrawlStatus = neighborCrawlStatusRepository.get();
      if (neighborCrawlStatus !== undefined && neighborCrawlStatus.groupId.equals(props.group.id)) {
        setNeighborCrawlStatus(neighborCrawlStatus);
      } else {
        setNeighborCrawlStatus(undefined);
      }
      const neighborCrawlResultRepository = await getNeighborCrawlResultRepository();
      const neighborCrawlResult = await neighborCrawlResultRepository.get(props.group.id);
      setNeighborCrawlResult(neighborCrawlResult);
      const neighborsRepository = await getNeighborsRepository();
      const neighbors = await neighborsRepository.get(props.group.id);
      setNeighbors(neighbors);
      if (neighbors !== undefined) {
        const closeNeighbors = new Map<string, Actor>();
        for (const neighbor of neighbors.closeNeighbors) {
          const actor = await getActorRepository().get(neighbor.actorId);
          if (actor !== undefined) {
            closeNeighbors.set(actor.id.toString(), actor);
          }
        }
        setCloseNeighbors(closeNeighbors);
      }
    };
    fetchNeighborCrawlData();
  }, [props.group]);

  const deleteGroupHandler = async () => {
    await deleteGroup(
      props.group.id,
      [allGroups, setAllGroups],
      [jumpedGroupId, setJumpedGroupId],
      [selectedGroupId, setSelectedGroupId],
    );
    navigation.navigate('Home');
  };

  const createActorView = (actorId: ActorId, actor: Actor|undefined) => (
    <View key={actorId.toString()} style={groupDetailStyles.actorView}>
      { actor?.icon &&
        <View style={groupDetailStyles.actorIconView}>
          <Avatar.Image source={{uri: actor.icon}} size={48}/>
        </View>
      }
      { actor &&
        <View style={groupDetailStyles.actorNameView}>
          <Text>{actor.name} ({actor.handle})</Text>
        </View>
      }
      { !actor &&
        <View style={groupDetailStyles.actorIdView}>
          <Text>{actorId.value}</Text>
        </View>
      }
    </View>
  );

  const activityPubActorViews = props.group.actorIds.filter(aid => aid.snsType === SNSTypes.ActivityPub).map(actorId => {
    return createActorView(actorId, props.actors.get(actorId.toString()));
  });
  const atProtoActorViews = props.group.actorIds.filter(aid => aid.snsType === SNSTypes.ATProto).map(actorId => {
    return createActorView(actorId, props.actors.get(actorId.toString()));
  });
  const closeNeighborViews = neighbors === undefined ? [] : neighbors.closeNeighbors.map(neighbor => {
    return createActorView(neighbor.actorId, closeNeighbors.get(neighbor.actorId.toString()));
  });

  return (
    <ScrollView>
      <View style={groupDetailStyles.editButtonsView}>
        <Button mode="contained" onPress={props.openEditorHandler}>Edit</Button>
        <Button mode="contained" onPress={deleteGroupHandler}>Delete</Button>
      </View>
      <Text variant="headlineLarge">{ props.group.name }</Text>
      <Text variant="titleLarge">Members</Text>
      { activityPubActorViews.length > 0 && (
        <View style={groupDetailStyles.actorListView}>
          <Text variant="titleSmall" style={groupDetailStyles.actorListViewHeader}>ActivityPub</Text>
          { activityPubActorViews }
        </View>
      )}
      { atProtoActorViews.length > 0 && (
        <View style={groupDetailStyles.actorListView}>
          <Text variant="titleSmall" style={groupDetailStyles.actorListViewHeader}>ATProto</Text>
          { atProtoActorViews }
        </View>
      )}
      { neighborCrawlStatus && (
        <View>
          <Text variant="titleLarge">Neighbor Crawl Status</Text>
          <Text>Started at: {neighborCrawlStatus.startedAt.toISOString()}</Text>
        </View>
      )}
      { neighborCrawlResult && (
        <View>
          <Text variant="titleLarge">Neighbor Crawl Result</Text>
          <Text>Started at: {neighborCrawlResult.startedAt.toISOString()}</Text>
          <Text>Finished at: {neighborCrawlResult.finishedAt.toISOString()}</Text>
          { neighborCrawlResult.isSucceeded && (<Text>Succeeded</Text>) }
          { !neighborCrawlResult.isSucceeded && (<Text>Error: {neighborCrawlResult.error}</Text>)}
        </View>
      )}
      { neighbors && neighbors.closeNeighbors.length > 0 && (
        <View>
          <Text variant="titleLarge">CloseNeighbors</Text>
          { closeNeighborViews }
        </View>
      )}
    </ScrollView>
  );
}

const groupDetailStyles = StyleSheet.create({
  editButtonsView: { marginTop: 10, marginBottom: 10, flexDirection: 'row', justifyContent: 'flex-end' },
  actorView: { flexDirection: 'row' },
  actorIconView: { flex: 1 },
  actorNameView: { flex: 3, justifyContent: 'center', marginLeft: 10 },
  actorIdView: { flex: 4, justifyContent: 'center' },
  actorRemoveView: { flex: 2, justifyContent: 'center' },
  actorRemoveButton: { padding: 0 },
  actorListView: { marginTop: 10 },
  actorListViewHeader: { marginBottom: 5 },
});


type GroupEditorViewProps = {
  group: Group;
  currentActors: Map<string, Actor>;
  updateGroupHandler: () => void;
  cancelEditHandler: () => void;
}

type GroupEditorActorStatus = {
  actorId: ActorId;
  actor: Actor|undefined;
  status: 'added'|'removed'|'unchanged';
};

function GroupEditorView(props: GroupEditorViewProps) {
  const [ allGroups, setAllGroups ] = useRecoilState(allGroupsState);
  const [ groupName, setGroupName ] = useState<string>('');
  const [ handle, setHandle ] = useState<string>('');
  const [ actors, setActors ] = useState<GroupEditorActorStatus[]>([]);
  const [ actorFetchErrorSnackbarVisible, setActorFetchErrorSnackbarVisible ] = useState<boolean>(false);
  const [ actorFetchError, setActorFetchError ] = useState<string>('');
  const [ actorAddedSnackbarVisible, setActorAddedSnackbarVisible ] = useState<boolean>(false);

  useEffect(() => {
    setGroupName(props.group.name);
    const initialActorStatuses: GroupEditorActorStatus[] = props.group.actorIds.map(actorId => 
      ({ actorId: actorId, actor: props.currentActors.get(actorId.toString()), status: 'unchanged'})
    );
    setActors(initialActorStatuses);
  }, [props.group, props.currentActors]);

  const addActorHandler = (actorId: ActorId) => {
    setActors(actors.map(a => {
      const diff: any = {};
      if (deepEqual(a.actorId, actorId)) {
        if (a.status === 'removed') {
          diff.status = 'unchanged';
        } else {
          diff.status = 'added';
        }
      }
      return { ...a, ...diff };
    }));
  };

  const removeActorHandler = (actorId: ActorId) => {
    setActors(actors.map(a => {
      const diff: any = {};
      if (a.actorId.equals(actorId)) {
        if (a.status === 'unchanged') {
          diff.status = 'removed';
        } else {
          return undefined;
        }
      }
      return { ...a, ...diff };
    }).filter(a => a !== undefined));
  }

  const addNewActorHandler = async () => {
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
      } else if (actors.some(a => deepEqual(a.actorId, actor.id))) {
        setActorFetchError('Actor already added');
        setActorAddedSnackbarVisible(false);
        setActorFetchErrorSnackbarVisible(true);
      } else {
        setActors([...actors, {actorId: actor.id, actor: actor, status: 'added'}]);
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

  const updateGroupHandler = async () => {
    const actorIds = actors.filter(a => a.status !== 'removed').map(a => a.actorId);
    const updatedGroup = {
      id: props.group.id,
      name: groupName,
      actorIds: actorIds,
    };
    await updateGroup(updatedGroup, [allGroups, setAllGroups]);
    props.updateGroupHandler();
  };

  const createActorView = (actorStatus: GroupEditorActorStatus) => {
    return (<View
      key={actorStatus.actorId.toString()}
      style={actorStatus.status === 'removed' ? groupEditorStyles.removedActorView : groupEditorStyles.actorView}
    >
      { actorStatus.actor?.icon &&
        <View style={groupEditorStyles.actorIconView}>
          <Avatar.Image source={{uri: actorStatus.actor.icon}} size={48}/>
        </View>
      }
      { actorStatus.actor &&
        <View style={groupEditorStyles.actorNameView}>
          <Text>{actorStatus.actor.name} ({actorStatus.actor.handle})</Text>
        </View>
      }
      { !actorStatus.actor &&
        <View style={groupEditorStyles.actorIdView}>
          <Text>{actorStatus.actorId.value}</Text>
        </View>
      }
      <View style={groupEditorStyles.actorStatusView}>
        <Text variant="labelSmall">{actorStatus.status === 'unchanged' ? '' : actorStatus.status}</Text>
      </View>
      { actorStatus.status === 'removed' &&
        <View style={groupEditorStyles.actorButtonView}>
          <Button style={groupEditorStyles.actorButton} onPress={() => addActorHandler(actorStatus.actorId)}>Add</Button>
        </View>
      }
      { actorStatus.status !== 'removed' &&
        <View style={groupEditorStyles.actorButtonView}>
          <Button style={groupEditorStyles.actorButton} onPress={() => removeActorHandler(actorStatus.actorId)}>Remove</Button>
        </View>
      }
    </View>);
  };
  const activityPubActorViews = actors.filter(a => a.actorId.snsType === SNSTypes.ActivityPub).map(createActorView);
  const atProtoActorViews = actors.filter(a => a.actorId.snsType === SNSTypes.ATProto).map(createActorView);
  
  return (
    <View>
      <View style={groupEditorStyles.editButtonsView}>
        <Button mode="contained" onPress={updateGroupHandler} style={groupEditorStyles.editButton}>Update</Button>
        <Button mode="contained" onPress={props.cancelEditHandler} style={groupEditorStyles.editButton}>Cancel</Button>
      </View>
      <Text>Group Name</Text>
      <TextInput
        value={groupName}
        onChangeText={setGroupName}
        placeholder="Enter the name of the group"
        autoCapitalize='none'
      />
      <Text>
        Actor to add (xxx@mastodon.social for ActivityPub or xxx.bsky.social for ATProto)
      </Text>
      <TextInput
        value={handle}
        onChangeText={setHandle}
        placeholder="Enter a handle"
        autoCapitalize='none'
      />
      <Button mode="contained" onPress={addNewActorHandler} style={groupEditorStyles.addButton}>Add</Button>
      { activityPubActorViews.length > 0 && (
        <View style={groupEditorStyles.actorListView}>
          <Text variant="titleSmall" style={groupEditorStyles.actorListViewHeader}>ActivityPub</Text>
          { activityPubActorViews }
        </View>
      )}
      { atProtoActorViews.length > 0 && (
        <View style={groupEditorStyles.actorListView}>
          <Text variant="titleSmall" style={groupEditorStyles.actorListViewHeader}>ATProto</Text>
          { atProtoActorViews }
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
          <Text>Actor found.</Text>
        </Snackbar>
      </Portal>
    </View>
  );
}

const groupEditorStyles = StyleSheet.create({
  editButtonsView: { marginTop: 10, marginBottom: 10, flexDirection: 'row', justifyContent: 'flex-end' },
  editButton: { marginRight: 5}, 
  addButton: { marginTop: 10, marginBottom: 10 },
  actorView: { flexDirection: 'row' },
  removedActorView: { flexDirection: 'row', backgroundColor: 'gray' },
  actorIconView: { flex: 1 },
  actorNameView: { flex: 3, justifyContent: 'center', marginLeft: 10 },
  actorIdView: { flex: 4, justifyContent: 'center' },
  actorStatusView: { flex: 1, justifyContent: 'center' },
  actorButtonView: { flex: 2, justifyContent: 'center' },
  actorButton: { padding: 0 },
  actorListView: { marginTop: 10 },
  actorListViewHeader: { marginBottom: 5 },
});
