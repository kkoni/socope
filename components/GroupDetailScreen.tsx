import { useState, useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Avatar, Button, Portal, Snackbar, Text, TextInput } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { SerializableKeyMap, linkHandler } from '../model/lib/util';
import { selectedGroupIdState, allGroupsState, jumpedGroupIdState, currentNeighborCrawlStatusState } from '../states';
import { updateGroup, deleteGroup } from '../facades';
import { Actor, ActorId, Group, Neighbors } from '../model/data';
import { getActorRepository, getGroupRepository, getNeighborsRepository } from '../model/repositories';
import { NeighborCrawlStatus, NeighborCrawlResult } from '../model/worker/data';
import { getNeighborCrawlStatusRepository, getNeighborCrawlResultRepository } from '../model/worker/repositories';

const neighborCountToShow = 20;

export default function GroupDetailScreen() {
  const [ selectedGroupId ] = useRecoilState(selectedGroupIdState);
  const [ currentNeighborCrawlStatus ] = useRecoilState(currentNeighborCrawlStatusState)

  const [ group, setGroup ] = useState<Group|undefined>(undefined);
  const [ actors, setActors ] = useState<SerializableKeyMap<ActorId, Actor>>(new SerializableKeyMap());
  const [ inEditMode, setInEditMode ] = useState<boolean>(false);
  const [ neighbors, setNeighbors ] = useState<Neighbors|undefined>(undefined);
  const [ neighborCrawlStatus, setNeighborCrawlStatus ] = useState<NeighborCrawlStatus|undefined>(undefined);
  const [ neighborCrawlResult, setNeighborCrawlResult ] = useState<NeighborCrawlResult|undefined>(undefined);
  const [ closeNeighbors, setCloseNeighbors ] = useState<SerializableKeyMap<ActorId, Actor>>(new SerializableKeyMap());

  useEffect(() => { reloadGroup() }, [selectedGroupId]);

  useEffect(() => {
    const fetchNeighborCrawlData = async () => {
      if (group === undefined) return;
      const neighborCrawlStatusRepository = getNeighborCrawlStatusRepository();
      const neighborCrawlStatus = neighborCrawlStatusRepository.get();
      if (neighborCrawlStatus !== undefined && neighborCrawlStatus.groupId.equals(group.id)) {
        setNeighborCrawlStatus(neighborCrawlStatus);
      } else {
        setNeighborCrawlStatus(undefined);
      }
      const neighborCrawlResultRepository = await getNeighborCrawlResultRepository();
      const neighborCrawlResult = await neighborCrawlResultRepository.get(group.id);
      setNeighborCrawlResult(neighborCrawlResult);
      const neighborsRepository = await getNeighborsRepository();
      const neighbors = await neighborsRepository.get(group.id);
      setNeighbors(neighbors);
      if (neighbors !== undefined) {
        const closeNeighbors = new SerializableKeyMap<ActorId, Actor>();
        const neighborsToShow = neighbors.neighbors.slice(0, neighborCountToShow);
        for (const neighbor of neighborsToShow) {
          const actor = await getActorRepository().get(neighbor.actorId);
          if (actor !== undefined) {
            closeNeighbors.set(actor.id, actor);
          }
        }
        setCloseNeighbors(closeNeighbors);
      }
    };
    fetchNeighborCrawlData();
  }, [group, currentNeighborCrawlStatus]);

  const reloadGroup = async () => {
    if (selectedGroupId !== undefined) {
      const group = await (await getGroupRepository()).get(selectedGroupId);
      setActors(new SerializableKeyMap());
      setGroup(group);

      if (group !== undefined) {
        const actorRepository = getActorRepository();
        const actors = new SerializableKeyMap<ActorId, Actor>();
        for (const memberId of group.memberIds) {
          const member = await actorRepository.get(memberId);
          if (member !== undefined) {
            actors.set(member.id, member);
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
          currentMembers={actors}
          neighbors={neighbors}
          closeNeighbors={closeNeighbors}
          updateGroupHandler={updateGroup}
          cancelEditHandler={cancelEdit}
        />
      }
      { !inEditMode &&
        <GroupDetailView
          group={group}
          actors={actors}
          neighbors={neighbors}
          closeNeighbors={closeNeighbors}
          neighborCrawlStatus={neighborCrawlStatus}
          neighborCrawlResult={neighborCrawlResult}
          openEditorHandler={openEditor}
        />
      }
    </View>
  );
}

type GroupDetailViewProps = {
  group: Group;
  actors: SerializableKeyMap<ActorId, Actor>;
  neighbors: Neighbors|undefined;
  closeNeighbors: SerializableKeyMap<ActorId, Actor>;
  neighborCrawlStatus: NeighborCrawlStatus|undefined;
  neighborCrawlResult: NeighborCrawlResult|undefined;
  openEditorHandler: () => void;
};

function GroupDetailView(props: GroupDetailViewProps) {
  const navigation: any = useNavigation();

  const [ allGroups, setAllGroups ] = useRecoilState(allGroupsState);
  const [ jumpedGroupId, setJumpedGroupId ] = useRecoilState(jumpedGroupIdState);
  const [ selectedGroupId, setSelectedGroupId ] = useRecoilState(selectedGroupIdState);

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
      { actor !== undefined &&
        <Pressable style={groupDetailStyles.actorPressable} onPress={() => linkHandler(actor.uri)}>
          { actor?.icon &&
            <View>
              <Avatar.Image source={{uri: actor.icon}} size={48}/>
            </View>
          }
          <View style={groupDetailStyles.actorNameView}>
            <Text>{actor.name} ({actor.handle})</Text>
          </View>
        </Pressable>
      }
      { actor === undefined &&
        <View style={groupDetailStyles.actorIdView}>
          <Text>{actorId.value}</Text>
        </View>
      }
    </View>
  );

  const actorViews = props.group.memberIds.map(actorId => {
    return createActorView(actorId, props.actors.get(actorId));
  });
  const neighborViews = props.neighbors === undefined ? [] : props.neighbors.neighbors.slice(0, neighborCountToShow).map(neighbor => {
    return createActorView(neighbor.actorId, props.closeNeighbors.get(neighbor.actorId));
  });

  return (
    <ScrollView>
      <View style={groupDetailStyles.editButtonsView}>
        <Button mode="contained" onPress={props.openEditorHandler}>Edit</Button>
        <Button mode="contained" onPress={deleteGroupHandler}>Delete</Button>
      </View>
      <Text variant="headlineLarge">{ props.group.name }</Text>
      <Text variant="titleLarge">Members</Text>
      { actorViews.length > 0 && (
        <View style={groupDetailStyles.actorListView}>
          { actorViews }
        </View>
      )}
      { props.neighborCrawlStatus && (
        <View>
          <Text variant="titleLarge">Neighbor Crawl Status</Text>
          <Text>Started at: {props.neighborCrawlStatus.startedAt.toISOString()}</Text>
        </View>
      )}
      { props.neighborCrawlResult && (
        <View>
          <Text variant="titleLarge">Neighbor Crawl Result</Text>
          <Text>Started at: {props.neighborCrawlResult.startedAt.toISOString()}</Text>
          <Text>Finished at: {props.neighborCrawlResult.finishedAt.toISOString()}</Text>
          { props.neighborCrawlResult.isSucceeded && (<Text>Succeeded</Text>) }
          { !props.neighborCrawlResult.isSucceeded && (<Text>Error: {props.neighborCrawlResult.error}</Text>)}
        </View>
      )}
      { neighborViews.length > 0 && (
        <View>
          <Text variant="titleLarge">CloseNeighbors</Text>
          { neighborViews.length > 0 && (
            <View>
              { neighborViews }
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const groupDetailStyles = StyleSheet.create({
  editButtonsView: { marginTop: 10, marginBottom: 10, flexDirection: 'row', justifyContent: 'flex-end' },
  actorView: { flexDirection: 'row'},
  actorPressable: { flex: 1, flexDirection: 'row' },
  actorNameView: { flex: 1, justifyContent: 'center', marginLeft: 10 },
  actorIdView: { flex: 1, justifyContent: 'center' },
  actorRemoveView: { flex: 2, justifyContent: 'center' },
  actorRemoveButton: { padding: 0 },
  actorListView: { marginTop: 10 },
});


type GroupEditorViewProps = {
  group: Group;
  currentMembers: SerializableKeyMap<ActorId, Actor>;
  neighbors: Neighbors|undefined;
  closeNeighbors: SerializableKeyMap<ActorId, Actor>;
  updateGroupHandler: () => void;
  cancelEditHandler: () => void;
}

type GroupEditorMemberStatus = {
  memberId: ActorId;
  actor: Actor|undefined;
  status: 'added'|'removed'|'unchanged';
};

function GroupEditorView(props: GroupEditorViewProps) {
  const [ allGroups, setAllGroups ] = useRecoilState(allGroupsState);
  const [ groupName, setGroupName ] = useState<string>('');
  const [ handle, setHandle ] = useState<string>('');
  const [ memberStatuses, setMemberStatuses ] = useState<GroupEditorMemberStatus[]>([]);
  const [ actorFetchErrorSnackbarVisible, setActorFetchErrorSnackbarVisible ] = useState<boolean>(false);
  const [ actorFetchError, setActorFetchError ] = useState<string>('');
  const [ actorAddedSnackbarVisible, setActorAddedSnackbarVisible ] = useState<boolean>(false);

  useEffect(() => {
    setGroupName(props.group.name);
    const initialMemberStatuses: GroupEditorMemberStatus[] = props.group.memberIds.map(memberId => 
      ({ memberId: memberId, actor: props.currentMembers.get(memberId), status: 'unchanged'})
    );
    setMemberStatuses(initialMemberStatuses);
  }, [props.group, props.currentMembers]);

  const addMemberHandler = (actorId: ActorId) => {
    setMemberStatuses(memberStatuses.map(ms => {
      const diff: any = {};
      if (ms.memberId.equals(actorId)) {
        if (ms.status === 'removed') {
          diff.status = 'unchanged';
        } else {
          diff.status = 'added';
        }
      }
      return { ...ms, ...diff };
    }));
  };

  const removeMemberHandler = (memberId: ActorId) => {
    setMemberStatuses(memberStatuses.map(ms => {
      const diff: any = {};
      if (ms.memberId.equals(memberId)) {
        if (ms.status === 'unchanged') {
          diff.status = 'removed';
        } else {
          return undefined;
        }
      }
      return { ...ms, ...diff };
    }).filter(ms => ms !== undefined));
  }

  const addNewMemberHandler = async () => {
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
      } else if (memberStatuses.some(ms => ms.memberId.equals(actor.id))) {
        setActorFetchError('Actor already added');
        setActorAddedSnackbarVisible(false);
        setActorFetchErrorSnackbarVisible(true);
      } else {
        setMemberStatuses([...memberStatuses, {memberId: actor.id, actor: actor, status: 'added'}]);
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

  const addMemberFromNeighborsHandler = async (actorId: ActorId) => {
    const actor = await getActorRepository().get(actorId);
    if (actor === undefined) {
      return;
    }
    if (memberStatuses.some(ms => ms.memberId.equals(actor.id))) {
      return;
    }
    setMemberStatuses([...memberStatuses, {memberId: actor.id, actor: actor, status: 'added'}]);
  }

  const updateGroupHandler = async () => {
    const memberIds = memberStatuses.filter(ms => ms.status !== 'removed').map(ms => ms.memberId);
    const updatedGroup = {
      id: props.group.id,
      name: groupName,
      memberIds: memberIds,
    };
    await updateGroup(updatedGroup, [allGroups, setAllGroups]);
    props.updateGroupHandler();
  };

  const createActorView = (memberStatus: GroupEditorMemberStatus) => {
    return (<View
      key={memberStatus.memberId.toString()}
      style={memberStatus.status === 'removed' ? groupEditorStyles.removedActorView : groupEditorStyles.actorView}
    >
      { memberStatus.actor !== undefined &&
        <Pressable style={groupEditorStyles.actorPressable} onPress={() => linkHandler(memberStatus.actor!.uri)}>
          { memberStatus.actor?.icon &&
            <View>
              <Avatar.Image source={{uri: memberStatus.actor.icon}} size={48}/>
            </View>
          }
          <View style={groupEditorStyles.actorNameView}>
            <Text>{memberStatus.actor.name} ({memberStatus.actor.handle})</Text>
          </View>
        </Pressable>
      }
      { memberStatus.actor === undefined &&
        <View style={groupEditorStyles.actorIdView}>
          <Text>{memberStatus.memberId.value}</Text>
        </View>
      }
      <View style={groupEditorStyles.actorStatusView}>
        <Text variant="labelSmall">{memberStatus.status === 'unchanged' ? '' : memberStatus.status}</Text>
      </View>
      { memberStatus.status === 'removed' &&
        <View style={groupEditorStyles.actorButtonView}>
          <Button style={groupEditorStyles.actorButton} onPress={() => addMemberHandler(memberStatus.memberId)}>Add</Button>
        </View>
      }
      { memberStatus.status !== 'removed' &&
        <View style={groupEditorStyles.actorButtonView}>
          <Button style={groupEditorStyles.actorButton} onPress={() => removeMemberHandler(memberStatus.memberId)}>Remove</Button>
        </View>
      }
    </View>);
  };
  const actorViews = memberStatuses.map(createActorView);
  
  const createNeighborView = (actorId: ActorId, actor: Actor|undefined) => (
    <View key={actorId.toString()} style={groupEditorStyles.actorView}>
      { actor !== undefined &&
        <Pressable style={groupEditorStyles.actorPressable} onPress={() => linkHandler(actor.uri)}>
          { actor?.icon &&
            <View>
              <Avatar.Image source={{uri: actor.icon}} size={48}/>
            </View>
          }
          <View style={groupEditorStyles.actorNameView}>
            <Text>{actor.name} ({actor.handle})</Text>
          </View>
        </Pressable>
      }
      { actor === undefined &&
        <View style={groupEditorStyles.actorIdView}>
          <Text>{actorId.value}</Text>
        </View>
      }
      <View style={groupEditorStyles.actorButtonView}>
        <Button style={groupEditorStyles.actorButton} onPress={() => addMemberFromNeighborsHandler(actorId)}>Add</Button>
      </View>
    </View>
  );
  const neighborViews = props.neighbors === undefined ? [] : props.neighbors.neighbors.slice(0, neighborCountToShow).map(neighbor => {
    return createNeighborView(neighbor.actorId, props.closeNeighbors.get(neighbor.actorId));
  });

  return (
    <ScrollView>
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
      <Button mode="contained" onPress={addNewMemberHandler} style={groupEditorStyles.addButton}>Add</Button>
      { actorViews.length > 0 && (
        <View style={groupEditorStyles.actorListView}>
          { actorViews }
        </View>
      )}
      { neighborViews.length > 0 && (
        <View style={groupEditorStyles.actorListView}>
          <Text variant="titleLarge" style={groupEditorStyles.actorListViewHeader}>CloseNeighbors</Text>
          { neighborViews.length > 0 && (
            <View>
              { neighborViews }
            </View>
          )}
        </View>
      )}
      <Portal>
        <Snackbar
          visible={actorFetchErrorSnackbarVisible}
          onDismiss={() => setActorFetchErrorSnackbarVisible(false)}
          duration={10000}
          style={groupEditorStyles.actorFetchErrorSnackbar}
        >
          <Text style={groupEditorStyles.snackbarText}>{ actorFetchError }</Text>
        </Snackbar>
      </Portal>
      <Portal>
        <Snackbar
          visible={actorAddedSnackbarVisible}
          onDismiss={() => setActorAddedSnackbarVisible(false)}
          duration={3000}
          style={groupEditorStyles.actorFoundSnackbar}
        >
          <Text style={groupEditorStyles.snackbarText}>Actor found.</Text>
        </Snackbar>
      </Portal>
    </ScrollView>
  );
}

const groupEditorStyles = StyleSheet.create({
  editButtonsView: { marginTop: 10, marginBottom: 10, flexDirection: 'row', justifyContent: 'flex-end' },
  editButton: { marginRight: 5}, 
  addButton: { marginTop: 10, marginBottom: 10 },
  actorView: { flexDirection: 'row' },
  removedActorView: { flexDirection: 'row', backgroundColor: 'gray' },
  actorPressable: { flex: 4, flexDirection: 'row' },
  actorNameView: { flex: 1, justifyContent: 'center', marginLeft: 10 },
  actorIdView: { flex: 4, justifyContent: 'center' },
  actorStatusView: { flex: 1, justifyContent: 'center' },
  actorButtonView: { flex: 2, justifyContent: 'center' },
  actorButton: { padding: 0 },
  actorListView: { marginTop: 10 },
  actorListViewHeader: { marginBottom: 5 },
  actorFoundSnackbar: { backgroundColor: 'limegreen', color: 'white' },
  actorFetchErrorSnackbar: { backgroundColor: 'crimson', color: 'white' },
  snackbarText: { color: 'white' },
});
