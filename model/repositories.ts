import { AppBskyActorDefs } from '@atproto/api';
import {
  getActorRepository as getATProtoActorRepository,
  getPostRepository as getATProtoPostRepository,
} from './atproto/repositories';
import { SerializableKeyMap, getEpochSeconds } from './lib/util';
import { EphemeralDataStorage, LongLivedDataStorage, StorageManager, getStorageManager } from './lib/storage';
import {
  Actor,
  ActorId,
  Group,
  GroupId,
  Neighbors,
  Post,
  PostId,
  serializeGroup,
  deserializeGroup,
  serializeNeighbors,
  deserializeNeighbors,
  serializeActorId,
  deserializeActorId,
} from './data';

interface Singletons {
  actorRepository: ActorRepository;
  groupRepository: GroupRepository;
  followsRepository: FollowsRepository;
  neighborsRepository: NeighborsRepository;
  postRepository: PostRepository;
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

export function getPostRepository(): PostRepository {
  if (!singletons.postRepository) {
    singletons.postRepository = new PostRepository();
  }
  return singletons.postRepository;
}

export class ActorRepository {
  async fetchByHandle(handle: string): Promise<Actor|undefined> {
    const atProtoActor = await (await getATProtoActorRepository()).fetch(handle);
    return atProtoActor ? this.convertATProtoActor(atProtoActor) : undefined;
  }

  async get(id: ActorId): Promise<Actor|undefined> {
    const atProtoActor = await (await getATProtoActorRepository()).get(id.value);
    return atProtoActor ? this.convertATProtoActor(atProtoActor) : undefined;
  }

  async getActors(ids: ActorId[]): Promise<SerializableKeyMap<ActorId, Actor>> {
    const atProtoActors = await (await getATProtoActorRepository()).getActors(ids.map(id => id.value));
    const result = new SerializableKeyMap<ActorId, Actor>();
    for (const atProtoActor of atProtoActors.values()) {
      const actor = this.convertATProtoActor(atProtoActor);
      result.set(actor.id, actor);
    }
    return result
  }

  private convertATProtoActor(actor: AppBskyActorDefs.ProfileViewDetailed): Actor {
    return {
      id: new ActorId(actor.did),
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

  async create(name: string, memberIds: ActorId[]): Promise<Group> {
    const newId = this.nextId || new GroupId(1);
    this.nextId = new GroupId(newId.value + 1);
    await this.storageManager.storeLongLivedData(GroupRepository.nextIdStorageKey, this.nextId.value.toString());

    const newGroup: Group = { id: newId, name, memberIds };
    await this.store(newGroup);
    return newGroup;
  }

  async store(group: Group): Promise<void> {
    const oldGroup = await this.longLivedDataStorage.get(group.id.value.toString());
    await this.longLivedDataStorage.store(group.id.value.toString(), group);
  }

  async delete(id: GroupId): Promise<void> {
    const group = await this.longLivedDataStorage.get(id.value.toString());
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

  private storage: EphemeralDataStorage<string[]>;

  constructor(storageManager: StorageManager) {
    this.storage = new EphemeralDataStorage(
      FollowsRepository.storageKeyPrefix,
      FollowsRepository.storageTTL,
      storageManager,
      FollowsRepository.serializer,
      FollowsRepository.deserializer,
    );
  }

  async get(actorId: ActorId): Promise<{followedIds: ActorId[], updatedAt: number}|undefined> {
    const stored = await this.storage.get(actorId.value);
    if (stored === undefined) {
      return undefined;
    }
    const followedIds = stored.value.map(deserializeActorId);
    return {followedIds, updatedAt: stored.updatedAt};
  }

  async getUpdatedAt(actorId: ActorId): Promise<number | undefined> {
    return await this.storage.getUpdatedAt(actorId.value);
  }

  async store(actorId: ActorId, followedIds: ActorId[]): Promise<void> {
    await this.storage.store(actorId.value, followedIds.map(serializeActorId), getEpochSeconds());
  }
}

export class NeighborsRepository {
  private static storageKeyPrefix = 'NeighborsRepository.storage';

  private storage: LongLivedDataStorage<Neighbors>;

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
  }

  async store(neighbors: Neighbors): Promise<void> {
    await this.storage.store(neighbors.groupId.toString(), neighbors);
  }

  async get(groupId: GroupId): Promise<Neighbors|undefined> {
    return await this.storage.get(groupId.toString());
  }

  async delete(groupId: GroupId): Promise<void> {
    await this.storage.delete(groupId.toString());
  }
}

export class PostRepository {
  async get(postIds: PostId[]): Promise<SerializableKeyMap<PostId, Post>> {
    const result = new SerializableKeyMap<PostId, Post>();
    for (const [postId, post] of (await getATProtoPostRepository().get(postIds)).entries()) {
      result.set(postId, post);
    }
    return result;
  }
}
