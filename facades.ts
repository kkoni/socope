import deepEqual from 'deep-equal';
import { ActorId, Group, GroupId } from './model/data';
import { getGroupRepository } from './model/repositories';

export function createGroup(
  name: string,
  actorIds: ActorId[],
  allGroupsStateHook: [Group[], (g: Group[]) => void],
  jumpedGroupIdStateHook: [GroupId|undefined, (id: GroupId|undefined) => void]
) {
  const [ allGroups, setAllGroups ] = allGroupsStateHook;
  const [ _, setJumpedGroupId ] = jumpedGroupIdStateHook;
  const group = getGroupRepository().create(name, actorIds);
  setAllGroups([...allGroups, group]);
  setJumpedGroupId(group.id);
}

export function updateGroup(group: Group, allGroupsHook: [Group[], (g: Group[]) => void]) {
  getGroupRepository().store(group);
  const [ allGroups, setAllGroups ] = allGroupsHook;
  setAllGroups(allGroups.map(g => deepEqual(g.id, group.id) ? group : g));
}

export function deleteGroup(
  groupId: GroupId,
  allGroupsHook: [Group[], (g: Group[]) => void],
  jumpedGroupIdHook: [GroupId|undefined, (id: GroupId|undefined) => void],
  selectedGroupIdHook: [GroupId|undefined, (id: GroupId|undefined) => void]
) {
  const [ allGroups, setAllGroups ] = allGroupsHook;
  const [ _1, setJumpedGroupId ] = jumpedGroupIdHook;
  const [ _2, setSelectedGroupId ] = selectedGroupIdHook;
  getGroupRepository().delete(groupId);
  const updatedAllGroups = allGroups.filter(g => !g.id.equals(groupId));
  setAllGroups(updatedAllGroups);
  setJumpedGroupId(updatedAllGroups.length === 0 ? undefined : updatedAllGroups[0].id);
  if (updatedAllGroups.length === 0) {
    setSelectedGroupId(undefined);
  }
}
