import { DateHour } from '../lib/date';
import { EphemeralDataStorage, StorageManager, getStorageManager } from '../lib/storage';
import { SerializableValueSet, SerializableKeyMap } from '../lib/util';
import { GroupId, PostId } from '../data';
import { PostIndex, serializePostIndices, deserializePostIndices } from './data';

interface Singletons {
  postIndexRepository: PostIndexRepository;
  newPostIndicesRepository: NewPostIndicesRepository;
}

const singletons = {} as Singletons;

export async function getPostIndexRepository(): Promise<PostIndexRepository> {
  if (!singletons.postIndexRepository) {
    const storageManager = await getStorageManager();
    singletons.postIndexRepository = new PostIndexRepository(storageManager);
  }
  return singletons.postIndexRepository;
}

export function getNewPostIndicesRepository(): NewPostIndicesRepository {
  if (!singletons.newPostIndicesRepository) {
    singletons.newPostIndicesRepository = new NewPostIndicesRepository();
  }
  return singletons.newPostIndicesRepository;
}

class PostIndexRepository {
  private static storageKeyPrefix = 'posts.PostIndexRepository.storage';
  private static storageTTL = 60 * 60 * 24 * 7; // 1 week

  private storageManager: StorageManager;
  private storage: EphemeralDataStorage<PostIndex[]>;
  private buffers: Map<string, PostIndicesBuffer> = new Map();

  constructor(storageManager: StorageManager) {
    this.storageManager = storageManager;
    this.storage = new EphemeralDataStorage(
      PostIndexRepository.storageKeyPrefix,
      PostIndexRepository.storageTTL,
      storageManager,
      serializePostIndices,
      deserializePostIndices,
    );
  }

  private getKey(groupId: GroupId, dateHour: DateHour): string {
    return `${groupId}:${dateHour.toString()}`;
  }

  async get(groupId: GroupId, dateHour: DateHour): Promise<PostIndex[]> {
    const key = this.getKey(groupId, dateHour);
    let buffer = this.buffers.get(key);
    if (buffer === undefined) {
      return (await this.storage.get(key))?.value || [];
    } else {
      return buffer.indices;
    }
  }

  async add(groupId: GroupId, index: PostIndex): Promise<boolean> {
    const dateHour = DateHour.of(index.postedAt);
    const key = this.getKey(groupId, dateHour);
    let buffer = this.buffers.get(key);
    if (buffer === undefined) {
      buffer = await this.initializeBuffer(groupId, dateHour);
      this.buffers.set(key, buffer);
    }
    return buffer.add(index);
  }

  private async initializeBuffer(groupId: GroupId, dateHour: DateHour): Promise<PostIndicesBuffer> {
    const indices = await this.storage.get(this.getKey(groupId, dateHour));
    return new PostIndicesBuffer(groupId, dateHour, indices?.value || []);
  }

  async flushAll() {
    for (const buffer of this.buffers.values()) {
      this.flush(buffer);
    }
  }

  private async flush(buffer: PostIndicesBuffer) {
    const key = this.getKey(buffer.groupId, buffer.dateHour);
    if (buffer.changed) {
      buffer.sort();
      buffer.changed = false;
      await this.storage.store(key, buffer.indices, Date.now());
    } else if (buffer.isExpired()) {
      this.buffers.delete(key);
    }
  }

  async deleteAll() {
    await this.storageManager.deleteEphemeralDataByPrefix(PostIndexRepository.storageKeyPrefix)
  }
}

class PostIndicesBuffer {
  private static bufferTTL = 24 * 60 * 60 * 1000; // 1 day

  groupId: GroupId;
  dateHour: DateHour;
  indices: PostIndex[];
  postIds: SerializableValueSet<PostId>;
  changedAt: Date;
  changed: boolean;

  constructor(groupId: GroupId, dateHour: DateHour, indices: PostIndex[]) {
    this.groupId = groupId;
    this.dateHour = dateHour;
    this.indices = [];
    this.postIds = new SerializableValueSet();
    for (const index of indices) {
      this.add(index);
    }
    this.changed = false;
    this.changedAt = new Date();
  }

  private pushToIndices(index: PostIndex): boolean {
    if (this.postIds.has(index.postId)) {
      return false;
    } else {
      this.indices.push(index);
      this.postIds.add(index.postId);
      return true;
    }
  }

  add(index: PostIndex): boolean {
    const added = this.pushToIndices(index);
    if (added) {
      this.changed = true;
      this.changedAt = new Date();
    }
    return added;
  }

  sort() {
    this.indices.sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime());
  }

  isExpired(): boolean {
    return this.changedAt.getTime() < Date.now() - PostIndicesBuffer.bufferTTL;
  }
}

class NewPostIndicesRepository {
  private static setSizeLimit = 10000;

  private maps: SerializableKeyMap<GroupId, SerializableKeyMap<PostId, PostIndex>> = new SerializableKeyMap();

  add(groupId: GroupId, postIndex: PostIndex) {
    let map = this.maps.get(groupId);
    if (map === undefined) {
      map = new SerializableKeyMap<PostId, PostIndex>();
      this.maps.set(groupId, map);
    }
    if (map.size < NewPostIndicesRepository.setSizeLimit) {
      map.set(postIndex.postId, postIndex);
    }
  }

  poll(groupId: GroupId): PostIndex[] {
    const map = this.maps.get(groupId);
    if (map === undefined) {
      return [];
    }
    const indices = Array.from(map.values());
    this.maps.delete(groupId);
    return indices;
  }
}
