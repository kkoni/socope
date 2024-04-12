import { atom } from 'recoil';
import { Group, GroupId } from './model/data';
import { NeighborCrawlStatus } from './model/worker/data';

export const allGroupsState = atom<Group[]>({
  key: 'allGroupsState',
  default: [],
});

export const jumpedGroupIdState = atom<GroupId|undefined>({
  key: 'jumpedGroupIdState',
  default: undefined,
});

export const selectedGroupIdState = atom<GroupId|undefined>({
  key: 'selectedGroupIdState',
  default: undefined,
});

export const currentNeighborCrawlStatusState = atom<NeighborCrawlStatus|undefined>({
  key: 'currentNeighborCrawlStatusState',
  default: undefined,
});
