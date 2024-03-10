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
