import { DateHour } from '../lib/date';
import { EphemeralDataStorage, StorageManager, getStorageManager } from '../lib/storage';
import { GroupId } from '../data';
import { PostIndex, serializePostIndices, deserializePostIndices } from './data';

interface Singletons {
  postIndexRepository: PostIndexRepository;
}

const singletons = {} as Singletons;

export async function getPostIndexRepository(): Promise<PostIndexRepository> {
  if (!singletons.postIndexRepository) {
    const storageManager = await getStorageManager();
    singletons.postIndexRepository = new PostIndexRepository(storageManager);
  }
  return singletons.postIndexRepository;
}

class PostIndexRepository {
  private static storageKeyPrefix = 'posts.PostIndexRepository.storage';
  private static storageTTL = 60 * 60 * 24 * 7; // 1 week

  private storage: EphemeralDataStorage<PostIndex[]>;
  private buffers: Map<string, PostIndicesBuffer> = new Map();

  constructor(storageManager: StorageManager) {
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
}

class PostIndicesBuffer {
  private static bufferTTL = 24 * 60 * 60 * 1000; // 1 day

  groupId: GroupId;
  dateHour: DateHour;
  indices: PostIndex[];
  postIds: Set<string>;
  changedAt: Date;
  changed: boolean;

  constructor(groupId: GroupId, dateHour: DateHour, indices: PostIndex[]) {
    this.groupId = groupId;
    this.dateHour = dateHour;
    this.indices = [];
    this.postIds = new Set();
    for (const index of indices) {
      this.add(index);
    }
    this.changed = false;
    this.changedAt = new Date();
  }

  private pushToIndices(index: PostIndex): boolean {
    if (this.postIds.has(index.postId.toString())) {
      return false;
    } else {
      this.indices.push(index);
      this.postIds.add(index.postId.toString());
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
