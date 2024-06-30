import { ActorId, Group, GroupId } from './model/data';
import { getGroupRepository } from './model/repositories';

export async function createGroup(
  name: string,
  memberIds: ActorId[],
  allGroupsStateHook: [Group[], (g: Group[]) => void],
  jumpedGroupIdStateHook: [GroupId|undefined, (id: GroupId|undefined) => void]
) {
  const [ allGroups, setAllGroups ] = allGroupsStateHook;
  const [ _, setJumpedGroupId ] = jumpedGroupIdStateHook;
  const group = await (await getGroupRepository()).create(name, memberIds);
  setAllGroups([...allGroups, group]);
  setJumpedGroupId(group.id);
}

export async function updateGroup(group: Group, allGroupsHook: [Group[], (g: Group[]) => void]) {
  await (await getGroupRepository()).store(group);
  const [ allGroups, setAllGroups ] = allGroupsHook;
  setAllGroups(allGroups.map(g => g.id.equals(group.id) ? group : g));
}

export async function deleteGroup(
  groupId: GroupId,
  allGroupsHook: [Group[], (g: Group[]) => void],
  jumpedGroupIdHook: [GroupId|undefined, (id: GroupId|undefined) => void],
  selectedGroupIdHook: [GroupId|undefined, (id: GroupId|undefined) => void]
) {
  const [ allGroups, setAllGroups ] = allGroupsHook;
  const [ _1, setJumpedGroupId ] = jumpedGroupIdHook;
  const [ _2, setSelectedGroupId ] = selectedGroupIdHook;
  await (await getGroupRepository()).delete(groupId);
  const updatedAllGroups = allGroups.filter(g => !g.id.equals(groupId));
  setAllGroups(updatedAllGroups);
  setJumpedGroupId(updatedAllGroups.length === 0 ? undefined : updatedAllGroups[0].id);
  if (updatedAllGroups.length === 0) {
    setSelectedGroupId(undefined);
  }
}
