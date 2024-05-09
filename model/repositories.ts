import { AppBskyActorDefs } from '@atproto/api';
import { Actor as ActivityPubActor, getHandle, handleToAcctUri } from './activity-pub/data';
import { getActorRepository as getActivityPubActorRepository } from './activity-pub/repositories';
import { getActorRepository as getATProtoActorRepository } from './atproto/repositories';
import { SerializableKeyMap, getEpochSeconds } from './lib/util';
import { EphemeralDataStorage, LongLivedDataStorage, StorageManager, getStorageManager } from './lib/storage';
import {
  Actor,
  ActorId,
  Group,
  GroupId,
  Neighbors,
  SNSType,
  SNSTypes,
  serializeGroup,
  deserializeGroup,
  serializeNeighbors,
  deserializeNeighbors,
} from './data';

interface Singletons {
  actorRepository: ActorRepository;
  groupRepository: GroupRepository;
  followsRepository: FollowsRepository;
  neighborsRepository: NeighborsRepository;
}

const singletons = {} as Singletons;

export function getActorRepository(): ActorRepository {
  if (!singletons.actorRepository) {
    singletons.actorRepository = new ActorRepository();
  }
  return singletons.actorRepository;
}

export async function getGroupRepository(): Promise<GroupRepository> {
  if (!singletons.groupRepository) {
    const storageManager = await getStorageManager();
    singletons.groupRepository = new GroupRepository(storageManager);
    await singletons.groupRepository.load();
  }
  return singletons.groupRepository;
}

export async function getFollowsRepository(): Promise<FollowsRepository> {
  if (!singletons.followsRepository) {
    const storageManager = await getStorageManager();
    singletons.followsRepository = new FollowsRepository(storageManager);
  }
  return singletons.followsRepository;
}

export async function getNeighborsRepository(): Promise<NeighborsRepository> {
  if (!singletons.neighborsRepository) {
    const storageManager = await getStorageManager();
    singletons.neighborsRepository = new NeighborsRepository(storageManager);
    await singletons.neighborsRepository.load();
  }
  return singletons.neighborsRepository;
}

const activityPubHandleRegex = /^[^@]+@[^@]+$/

export class ActorRepository {
  async fetchByHandle(handle: string): Promise<Actor|undefined> {
    let snsType: SNSType = SNSTypes.ATProto;
    if (handle.match(activityPubHandleRegex)) {
      snsType = SNSTypes.ActivityPub;
    }
    switch (snsType) {
      case SNSTypes.ActivityPub:
        const acctUri = handleToAcctUri(handle);
        if (acctUri === undefined) {
          return undefined;
        }
        const activityPubActor = await (await getActivityPubActorRepository()).fetchByAcctUri(acctUri);
        return activityPubActor ? this.convertActivityPubActor(activityPubActor) : undefined;
      case SNSTypes.ATProto:
        const atProtoActor = await (await getATProtoActorRepository()).fetch(handle);
        return atProtoActor ? this.convertATProtoActor(atProtoActor) : undefined;
    }
  }

  async get(id: ActorId): Promise<Actor|undefined> {
    switch (id.snsType) {
      case SNSTypes.ActivityPub:
        const activityPubActor = await (await getActivityPubActorRepository()).get(id.value);
        return activityPubActor ? this.convertActivityPubActor(activityPubActor) : undefined;
      case SNSTypes.ATProto:
        const atProtoActor = await (await getATProtoActorRepository()).get(id.value);
        return atProtoActor ? this.convertATProtoActor(atProtoActor) : undefined;
    }
  }

  private convertActivityPubActor(actor: ActivityPubActor): Actor {
    return {
      id: new ActorId(SNSTypes.ActivityPub, actor.id),
      uri: actor.url,
      name: actor.name,
      handle: getHandle(actor),
      icon: actor.icon,
    };
  }

  private convertATProtoActor(actor: AppBskyActorDefs.ProfileViewDetailed): Actor {
    return {
      id: new ActorId(SNSTypes.ATProto, actor.did),
      uri: `https://bsky.app/profile/${actor.handle}`,
      name: actor.displayName || actor.handle,
      handle: actor.handle,
      icon: actor.avatar,
    };
  }
}

export class GroupRepository {
  private static storageKeyPrefix = 'GroupRepository.storage';
  private static nextIdStorageKey = 'GroupRepository.nextId';

  private nextId: GroupId|undefined;
  private storageManager: StorageManager;
  private longLivedDataStorage: LongLivedDataStorage<Group>;
  private actorGroupMap: SerializableKeyMap<ActorId, GroupId[]> = new SerializableKeyMap();

  constructor(storageManager: StorageManager) {
    this.storageManager = storageManager;
    this.longLivedDataStorage = new LongLivedDataStorage(
      GroupRepository.storageKeyPrefix,
      this.storageManager,
      serializeGroup,
      deserializeGroup,
    );
  }

  async load(): Promise<void> {
    await this.longLivedDataStorage.load();
    const loadedNextId = await this.storageManager.getLongLivedData(GroupRepository.nextIdStorageKey);
    if (loadedNextId !== undefined) {
      this.nextId = new GroupId(parseInt(loadedNextId, 10));
    }
    for (const group of await this.longLivedDataStorage.getAll()) {
      for (const actorId of group.actorIds) {
        this.addActorToGroup(actorId, group.id);
      }
    }
  }

  async create(name: string, actorIds: ActorId[]): Promise<Group> {
    const newId = this.nextId || new GroupId(1);
    this.nextId = new GroupId(newId.value + 1);
    await this.storageManager.storeLongLivedData(GroupRepository.nextIdStorageKey, this.nextId.value.toString());

    const newGroup: Group = { id: newId, name, actorIds };
    await this.store(newGroup);
    for (const actorId of actorIds) {
      this.addActorToGroup(actorId, newId);
    }
    return newGroup;
  }

  async store(group: Group): Promise<void> {
    const oldGroup = await this.longLivedDataStorage.get(group.id.value.toString());
    await this.longLivedDataStorage.store(group.id.value.toString(), group);
    if (oldGroup !== undefined) {
      const {added, removed} = this.getActorDiff(oldGroup.actorIds, group.actorIds);
      for (const actorId of added) {
        this.addActorToGroup(actorId, group.id);
      }
      for (const actorId of removed) {
        this.removeActorFromGroup(actorId, group.id);
      }
    } else {
      for (const actorId of group.actorIds) {
        this.addActorToGroup(actorId, group.id);
      }
    }
  }

  async delete(id: GroupId): Promise<void> {
    const group = await this.longLivedDataStorage.get(id.value.toString());
    await this.longLivedDataStorage.delete(id.value.toString());
    if (group !== undefined) {
      for (const actorId of group.actorIds) {
        this.removeActorFromGroup(actorId, id);
      }
    }
  }

  async get(id: GroupId): Promise<Group | undefined> {
    return await this.longLivedDataStorage.get(id.value.toString());
  }

  async getAll(): Promise<Group[]> {
    return await this.longLivedDataStorage.getAll();
  }

  async getNextId(): Promise<GroupId> {
    return this.nextId || new GroupId(1);
  }

  private addActorToGroup(actorId: ActorId, groupId: GroupId) {
    const groupIds = this.actorGroupMap.get(actorId);
    if (groupIds === undefined) {
      this.actorGroupMap.set(actorId, [groupId]);
    } else {
      groupIds.push(groupId);
    }
  }

  private removeActorFromGroup(actorId: ActorId, groupId: GroupId) {
    const groupIds = this.actorGroupMap.get(actorId);
    if (groupIds === undefined) {
      return;
    }
    const index = groupIds.findIndex((gid) => gid.equals(groupId));
    if (index !== -1) {
      groupIds.splice(index, 1);
    }
  }

  private getActorDiff(oldActorIds: ActorId[], newActorIds: ActorId[]): {added: ActorId[], removed: ActorId[]} {
    const added: ActorId[] = [];
    const removed: ActorId[] = [];
    for (const actorId of newActorIds) {
      if (!oldActorIds.some((oldActorId) => oldActorId.equals(actorId))) {
        added.push(actorId);
      }
    }
    for (const actorId of oldActorIds) {
      if (!newActorIds.some((newActorId) => newActorId.equals(actorId))) {
        removed.push(actorId);
      }
    }
    return {added, removed};
  }
}

export class FollowsRepository {
  private static storageKeyPrefix = 'FollowsRepository.storage'
  private static storageTTL = 60 * 60 * 24 * 7;

  private static serializer(value: string[]): string {
    return JSON.stringify(value);
  }

  private static deserializer(s: string): string[] {
    return JSON.parse(s);
  }

  private storages: Map<SNSType, EphemeralDataStorage<string[]>>;

  constructor(storageManager: StorageManager) {
    this.storages = new Map();
    for (const snsType of Object.values(SNSTypes)) {
      this.storages.set(snsType, new EphemeralDataStorage(
        `${FollowsRepository.storageKeyPrefix}.${snsType}`,
        FollowsRepository.storageTTL,
        storageManager,
        FollowsRepository.serializer,
        FollowsRepository.deserializer,
      ));
    }
  }

  async get(actorId: ActorId): Promise<{followedIds: ActorId[], updatedAt: number}|undefined> {
    const storage = this.storages.get(actorId.snsType);
    if (storage === undefined) {
      return undefined;
    }
    const stored = await storage.get(actorId.value);
    if (stored === undefined) {
      return undefined;
    }
    const followedIds = stored.value.map((v) => new ActorId(actorId.snsType, v));
    return {followedIds, updatedAt: stored.updatedAt};
  }

  async getUpdatedAt(actorId: ActorId): Promise<number | undefined> {
    const storage = this.storages.get(actorId.snsType);
    if (storage === undefined) {
      return undefined;
    }
    return await storage.getUpdatedAt(actorId.value);
  }

  async store(actorId: ActorId, followedIds: string[]): Promise<void> {
    const storage = this.storages.get(actorId.snsType);
    if (storage !== undefined) {
      await storage.store(actorId.value, followedIds, getEpochSeconds());
    }
  }
}

export class NeighborsRepository {
  private static storageKeyPrefix = 'NeighborsRepository.storage';

  private storage: LongLivedDataStorage<Neighbors>;
  private actorGroupMap: SerializableKeyMap<ActorId, GroupId[]> = new SerializableKeyMap();

  constructor(storageManager: StorageManager) {
    this.storage = new LongLivedDataStorage(
      NeighborsRepository.storageKeyPrefix,
      storageManager,
      serializeNeighbors,
      deserializeNeighbors,
    );
  }

  async load(): Promise<void> {
    await this.storage.load();
    for (const neighbors of await this.storage.getAll()) {
      this.addToActorGroupMap(neighbors);
    }
  }

  async store(groupId: GroupId, neighbors: Neighbors): Promise<void> {
    await this.storage.store(groupId.toString(), neighbors);
    this.removeGroupFromActorGroupMap(groupId);
    this.addToActorGroupMap(neighbors);
  }

  async get(groupId: GroupId): Promise<Neighbors|undefined> {
    return await this.storage.get(groupId.toString());
  }

  async delete(groupId: GroupId): Promise<void> {
    await this.storage.delete(groupId.toString());
    this.removeGroupFromActorGroupMap(groupId);
  }

  private addToActorGroupMap(neighbors: Neighbors) {
    for (const neighbor of neighbors.activityPubNeighbors) {
      this.addActorToGroup(neighbor.actorId, neighbors.groupId);
    }
    for (const neighbor of neighbors.atProtoNeighbors) {
      this.addActorToGroup(neighbor.actorId, neighbors.groupId);
    }
  }

  private addActorToGroup(actorId: ActorId, groupId: GroupId) {
    const groupIds = this.actorGroupMap.get(actorId);
    if (groupIds === undefined) {
      this.actorGroupMap.set(actorId, [groupId]);
    } else {
      groupIds.push(groupId);
    }
  }

  private removeGroupFromActorGroupMap(groupId: GroupId) {
    for (const [actorId, groupIds] of this.actorGroupMap.entries()) {
      const index = groupIds.findIndex((gid) => gid.equals(groupId));
      if (index !== -1) {
        groupIds.splice(index, 1);
      }
    }
  }
}
