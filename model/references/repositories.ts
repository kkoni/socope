import { SerializableKeyMap } from '../lib/util';
import { DateHour, WrappedDate } from '../lib/date';
import { EphemeralDataStorage, StorageManager, getStorageManager } from '../lib/storage';
import { ActorId, GroupId, PostId } from '../data';
import { ReferenceIndex, serializeReferenceIndices, deserializeReferenceIndices } from './data';

interface Singletons {
  referenceIndexRepository: ReferenceIndexRepository;
  recentReferenceIndexRepository: RecentReferenceIndexRepository;
}

const singletons = {} as Singletons;

export async function getReferenceIndexRepository(): Promise<ReferenceIndexRepository> {
  if (!singletons.referenceIndexRepository) {
    const storageManager = await getStorageManager();
    singletons.referenceIndexRepository = new ReferenceIndexRepository(storageManager);
  }
  return singletons.referenceIndexRepository;
}

export async function getRecentReferenceIndexRepository(): Promise<RecentReferenceIndexRepository> {
  if (!singletons.recentReferenceIndexRepository) {
    const storageManager = await getStorageManager();
    singletons.recentReferenceIndexRepository = new RecentReferenceIndexRepository(storageManager);
  }
  return singletons.recentReferenceIndexRepository;
}

export class ReferenceIndexRepository {
  private static storageKeyPrefix = "references.ReferenceIndexRepository.storage";
  private static storageTTL = 60 * 60 * 24 * 365; // 1 year

  private storageManager: StorageManager;
  private storage: EphemeralDataStorage<ReferenceIndex[]>;

  constructor(storageManager: StorageManager) {
    this.storageManager = storageManager;
    this.storage = new EphemeralDataStorage(
      ReferenceIndexRepository.storageKeyPrefix,
      ReferenceIndexRepository.storageTTL,
      storageManager,
      serializeReferenceIndices,
      deserializeReferenceIndices,
    );
  }

  private getKey(groupId: GroupId, date: WrappedDate): string {
    return `${groupId.toString()}:${date.toString()}`;
  }

  async get(groupId: GroupId, date: WrappedDate): Promise<ReferenceIndex[]> {
    return (await this.storage.get(this.getKey(groupId, date)))?.value || [];
  }

  async store(groupId: GroupId, date: WrappedDate, indices: ReferenceIndex[]) {
    await this.storage.store(this.getKey(groupId, date), indices, Date.now());
  }

  async deleteAll() {
    await this.storageManager.deleteEphemeralDataByPrefix(ReferenceIndexRepository.storageKeyPrefix);
  }
}

export class RecentReferenceIndexRepository {
  private static storageKeyPrefix = "references.RecentReferenceIndexRepository.storage";
  private static storageTTL = 60 * 60 * 24 * 7; // 1 week

  private storageManager: StorageManager;
  private storage: EphemeralDataStorage<ReferenceIndex[]>;
  private buffers: Map<string, ReferenceIndicesBuffer> = new Map();

  constructor(storageManager: StorageManager) {
    this.storageManager = storageManager;
    this.storage = new EphemeralDataStorage(
      RecentReferenceIndexRepository.storageKeyPrefix,
      RecentReferenceIndexRepository.storageTTL,
      storageManager,
      serializeReferenceIndices,
      deserializeReferenceIndices,
    );
  }

  private getKey(groupId: GroupId, dateHour: DateHour): string {
    return `${groupId.toString()}:${dateHour.toString()}`;
  }

  async get(groupId: GroupId, dateHour: DateHour): Promise<ReferenceIndex[]> {
    const key = this.getKey(groupId, dateHour);
    const buffer = this.buffers.get(key);
    if (buffer === undefined) {
      return (await this.storage.get(key))?.value || [];
    } else {
      return Array.from(buffer.indices.values());
    }
  }

  async addReply(groupId: GroupId, dateHour: DateHour, postId: PostId, replyPostId: PostId, byMember: boolean) {
    const key = this.getKey(groupId, dateHour);
    let buffer = this.buffers.get(key);
    if (buffer === undefined) {
      buffer = new ReferenceIndicesBuffer(groupId, dateHour, []);
      this.buffers.set(key, buffer);
    }
    buffer.addReply(postId, replyPostId, byMember);
  }

  async addQuote(groupId: GroupId, dateHour: DateHour, postId: PostId, quotePostId: PostId, byMember: boolean) {
    const key = this.getKey(groupId, dateHour);
    let buffer = this.buffers.get(key);
    if (buffer === undefined) {
      buffer = new ReferenceIndicesBuffer(groupId, dateHour, []);
      this.buffers.set(key, buffer);
    }
    buffer.addQuote(postId, quotePostId, byMember);
  }

  async addRepost(groupId: GroupId, dateHour: DateHour, postId: PostId, actorId: ActorId, byMember: boolean) {
    const key = this.getKey(groupId, dateHour);
    let buffer = this.buffers.get(key);
    if (buffer === undefined) {
      buffer = new ReferenceIndicesBuffer(groupId, dateHour, []);
      this.buffers.set(key, buffer);
    }
    buffer.addRepost(postId, actorId, byMember);
  }

  async flushAll() {
    for (const buffer of this.buffers.values()) {
      this.flush(buffer);
    }
  }

  private async flush(buffer: ReferenceIndicesBuffer) {
    const key = this.getKey(buffer.groupId, buffer.dateHour);
    if (buffer.changed) {
      await this.storage.store(key, Array.from(buffer.indices.values()), Date.now());
      buffer.changed = false;
    } else if (buffer.isExpired()) {
      this.buffers.delete(key);
    }
  }

  async deleteAll() {
    await this.storageManager.deleteEphemeralDataByPrefix(RecentReferenceIndexRepository.storageKeyPrefix);
    this.buffers.clear();
  }
}

class ReferenceIndicesBuffer {
  private static bufferTTL = 24 * 60 * 60 * 1000; // 1 day

  groupId: GroupId;
  dateHour: DateHour;
  indices: SerializableKeyMap<PostId, ReferenceIndex>;
  changedAt: Date;
  changed: boolean;

  constructor(groupId: GroupId, dateHour: DateHour, indices: ReferenceIndex[]) {
    this.groupId = groupId;
    this.dateHour = dateHour;
    this.indices = new SerializableKeyMap();
    for (const index of indices) {
      this.indices.set(index.postId, index);
    }
    this.changed = false;
    this.changedAt = new Date();
  }

  private getOrInitIndex(postId: PostId): ReferenceIndex {
    if (this.indices.has(postId)) {
      return this.indices.get(postId)!;
    } else {
      const index: ReferenceIndex = {
        postId,
        countsByMembers: { quote: 0, reply: 0, repost: 0, like: 0 },
        countsByNeighbors: { quote: 0, reply: 0, repost: 0, like: 0 },
        repostingActors: [],
        referringPosts: { quotes: [], replies: [] },
      };
      this.indices.set(postId, index);
      return index;
    }
  }

  private setChanged() {
    this.changed = true;
    this.changedAt = new Date();
  }

  addReply(postId: PostId, replyPostId: PostId, byMember: boolean) {
    const index = this.getOrInitIndex(postId);
    index.countsByMembers.reply++;
    if (byMember) {
      index.referringPosts.replies.push(replyPostId);
    }
    this.setChanged();
  }

  addQuote(postId: PostId, quotePostId: PostId, byMember: boolean) {
    const index = this.getOrInitIndex(postId);
    index.countsByMembers.quote++;
    if (byMember) {
      index.referringPosts.quotes.push(quotePostId);
    }
    this.setChanged();
  }

  addRepost(postId: PostId, actorId: ActorId, byMember: boolean) {
    const index = this.getOrInitIndex(postId);
    index.countsByMembers.repost++;
    if (byMember) {
      index.repostingActors.push(actorId);
    }
    this.setChanged();
  }

  isExpired(): boolean {
    return this.changedAt.getTime() < Date.now() - ReferenceIndicesBuffer.bufferTTL;
  }
}
