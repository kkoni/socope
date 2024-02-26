import { atom } from 'recoil';
import { Group, GroupId } from './model/data';

export const allGroupsState = atom<Group[]>({
  key: 'allGroupsState',
  default: [],
});

export const jumpedGroupIdState = atom<GroupId|undefined>({
  key: 'jumpedGroupIdState',
  default: undefined,
});
