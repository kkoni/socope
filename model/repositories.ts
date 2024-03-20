import { ProfileViewDetailed } from '@atproto/api/dist/client/types/app/bsky/actor/defs';
import { Actor as ActivityPubActor, getHandle, handleToAcctUri } from './activity-pub/data';
import { getActorRepository as getActivityPubActorRepository } from './activity-pub/repositories';
import { getActorRepository as getATProtoActorRepository } from './atproto/repositories';
import { getEpochSeconds } from './lib/util';
import { EphemeralDataStorage, LongLivedDataStorage, StorageManager, getStorageManager } from './lib/storage';
import {
  Actor,
  ActorId,
  Group,
  GroupId,
  SNSType,
  SNSTypes,
  serializeGroup,
  deserializeGroup
} from './data';

interface Singletons {
  actorRepository: ActorRepository;
  groupRepository: GroupRepository;
  followsRepository: FollowsRepository;
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

  private convertATProtoActor(actor: ProfileViewDetailed): Actor {
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
  }

  async create(name: string, actorIds: ActorId[]): Promise<Group> {
    const newId = this.nextId || new GroupId(1);
    this.nextId = new GroupId(newId.value + 1);
    await this.storageManager.storeLongLivedData(GroupRepository.nextIdStorageKey, this.nextId.value.toString());

    const newGroup: Group = { id: newId, name, actorIds };
    await this.store(newGroup);
    return newGroup;
  }

  async store(group: Group): Promise<void> {
    await this.longLivedDataStorage.store(group.id.value.toString(), group);
  }

  async delete(id: GroupId): Promise<void> {
    await this.longLivedDataStorage.delete(id.value.toString());
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

  async get(actorId: ActorId): Promise<{followedIds: string[], updatedAt: number}|undefined> {
    const storage = this.storages.get(actorId.snsType);
    if (storage === undefined) {
      return undefined;
    }
    const stored = await storage.get(actorId.value);
    if (stored === undefined) {
      return undefined;
    }
    return {followedIds: stored.value, updatedAt: stored.updatedAt};
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
