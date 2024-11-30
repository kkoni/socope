import { EphemeralDataStorage, LongLivedDataStorage, StorageManager, getStorageManager } from '../lib/storage';
import { PriorityQueue, SerializableKeyMap, SerializableValueSet } from '../lib/util';
import { ActorId, GroupId } from '../data';
import {
  FeedFetchResult,
  NeighborCrawlResult,
  NeighborCrawlStatus,
  NeighborCrawlFollowsFetchQueue,
  NeighborCrawlFollowsFetchBuffer,
  NeighborCrawlDataSet,
  GroupActors,
  deserializeNeighborCrawlResult,
  serializeNeighborCrawlResult,
  deserializeFeedFetchResult,
  serializeFeedFetchResult,
} from './data';

interface Singletons {
  neighborCrawlResultRepository: NeighborCrawlResultRepository;
  neighborCrawlStatusRepository: NeighborCrawlStatusRepository;
  feedFetchResultRepository: FeedFetchResultRepository;
  feedFetchQueue: FeedFetchQueue;
  groupActorMapping: GroupActorMapping;
}

const singletons = {} as Singletons;

export async function getNeighborCrawlResultRepository(): Promise<NeighborCrawlResultRepository> {
  if (!singletons.neighborCrawlResultRepository) {
    const storageManager = await getStorageManager();
    singletons.neighborCrawlResultRepository = new NeighborCrawlResultRepository(storageManager);
    await singletons.neighborCrawlResultRepository.load();
  }
  return singletons.neighborCrawlResultRepository;
}

export function getNeighborCrawlStatusRepository(): NeighborCrawlStatusRepository {
  if (!singletons.neighborCrawlStatusRepository) {
    singletons.neighborCrawlStatusRepository = new NeighborCrawlStatusRepository();
  }
  return singletons.neighborCrawlStatusRepository;
}

export async function getFeedFetchResultRepository(): Promise<FeedFetchResultRepository> {
  if (!singletons.feedFetchResultRepository) {
    const storageManager = await getStorageManager();
    singletons.feedFetchResultRepository = new FeedFetchResultRepository(storageManager);
  }
  return singletons.feedFetchResultRepository;
}

export function getFeedFetchQueue(): FeedFetchQueue {
  if (!singletons.feedFetchQueue) {
    singletons.feedFetchQueue = new FeedFetchQueue();
  }
  return singletons.feedFetchQueue;
}

export function getGroupActorMapping(): GroupActorMapping {
  if (!singletons.groupActorMapping) {
    singletons.groupActorMapping = new GroupActorMapping();
  }
  return singletons.groupActorMapping;
}

export class NeighborCrawlResultRepository {
  private static storageKeyPrefix = 'NeighborCrawlResultRepository.storage';

  private storage: LongLivedDataStorage<NeighborCrawlResult>;

  constructor(storageManager: StorageManager) {
    this.storage = new LongLivedDataStorage(
      NeighborCrawlResultRepository.storageKeyPrefix,
      storageManager,
      serializeNeighborCrawlResult,
      deserializeNeighborCrawlResult,
    );
  }

  async load(): Promise<void> {
    await this.storage.load();
  }

  async store(result: NeighborCrawlResult): Promise<void> {
    await this.storage.store(result.groupId.toString(), result);
  }

  async get(groupId: GroupId): Promise<NeighborCrawlResult|undefined> {
    return this.storage.get(groupId.toString());
  }

  async delete(groupId: GroupId): Promise<void> {
    await this.storage.delete(groupId.toString());
  }
}

export class NeighborCrawlStatusRepository {
  private status?: NeighborCrawlStatus;
  private fetchFinished: boolean = false;
  private followsFetchQueue: NeighborCrawlFollowsFetchQueue = new NeighborCrawlFollowsFetchQueue();
  private followsFetchBuffer: NeighborCrawlFollowsFetchBuffer = new NeighborCrawlFollowsFetchBuffer();
  private dataSet?: NeighborCrawlDataSet;

  initializeCrawl(status: NeighborCrawlStatus, dataSet?: NeighborCrawlDataSet): void {
    this.status = status;
    this.dataSet = dataSet;
    this.fetchFinished = false;
    this.followsFetchQueue.clear();
    this.followsFetchBuffer.clear();
  }

  get(): NeighborCrawlStatus|undefined {
    return this.status;
  }

  getDataSet(): NeighborCrawlDataSet|undefined {
    return this.dataSet;
  }

  getFollowsFetchQueue(): NeighborCrawlFollowsFetchQueue {
    return this.followsFetchQueue;
  }

  getFollowsFetchBuffer(): NeighborCrawlFollowsFetchBuffer {
    return this.followsFetchBuffer;
  }

  isFetchFinished(): boolean {
    return this.fetchFinished;
  }

  setFetchFinished(): void {
    this.fetchFinished = true;
  }

  delete(): void {
    this.status = undefined;
    this.fetchFinished = false;
    this.dataSet = undefined;
    this.followsFetchQueue.clear();
    this.followsFetchBuffer.clear();
  }
}

export class FeedFetchResultRepository {
  private static storageKeyPrefix = 'FeedFetchResultRepository.storage';
  private static storageTTL = 7 * 24 * 60 * 60 * 1000; // 7 days

  private storageManager: StorageManager;
  private storage: EphemeralDataStorage<FeedFetchResult>;

  constructor(storageManager: StorageManager) {
    this.storageManager = storageManager;
    this.storage = new EphemeralDataStorage(
      FeedFetchResultRepository.storageKeyPrefix,
      FeedFetchResultRepository.storageTTL,
      storageManager,
      serializeFeedFetchResult,
      deserializeFeedFetchResult,
    );
  }

  async store(result: FeedFetchResult): Promise<void> {
    await this.storage.store(result.actorId.toString(), result, Date.now());
  }

  async get(actorId: ActorId): Promise<FeedFetchResult|undefined> {
    return (await this.storage.get(actorId.toString()))?.value;
  }

  async deleteAll(): Promise<void> {
    await this.storageManager.deleteEphemeralDataByPrefix(FeedFetchResultRepository.storageKeyPrefix);
  }
}

export class FeedFetchQueue {
  private queue: PriorityQueue<ActorId> = new PriorityQueue<ActorId>(10000, (value: ActorId) => value.toString());

  enqueue(actorId: ActorId, nextFetchTime: Date): void {
    this.queue.enqueue(actorId, nextFetchTime.getTime());
  }

  peek(): { actorId: ActorId, nextFetchTime: Date }|undefined {
    const result = this.queue.peek();
    return result ? { actorId: result.value, nextFetchTime: new Date(result.priority) } : undefined;
  }

  dequeue(): { actorId: ActorId, nextFetchTime: Date }|undefined {
    const result = this.queue.dequeue();
    return result ? { actorId: result.value, nextFetchTime: new Date(result.priority) } : undefined;
  }

  has(actorId: ActorId): boolean {
    return this.queue.has(actorId);
  }
}

export class GroupActorMapping {
  private allActorIds = new SerializableValueSet<ActorId>();
  private memberToGroupsMap = new SerializableKeyMap<ActorId, GroupId[]>();
  private neighborToGroupsMap = new SerializableKeyMap<ActorId, GroupId[]>();

  setGroupActors(groupActorsArray: GroupActors[]) {
    this.allActorIds.clear();
    this.memberToGroupsMap.clear();
    this.neighborToGroupsMap.clear();
    for (const groupActors of groupActorsArray) {
      const { groupId, memberIds, neighborIds } = groupActors;
      for (const memberId of memberIds) {
        this.allActorIds.add(memberId);
        let groups = this.memberToGroupsMap.get(memberId);
        if (groups === undefined) {
          groups = [];
          this.memberToGroupsMap.set(memberId, groups);
        }
        groups.push(groupId);
      }
      const memberIdSet = new SerializableValueSet<ActorId>([...memberIds]);
      for (const neighborId of neighborIds) {
        this.allActorIds.add(neighborId);
        if (!memberIdSet.has(neighborId)) {
          let groups = this.neighborToGroupsMap.get(neighborId);
          if (groups === undefined) {
            groups = [];
            this.neighborToGroupsMap.set(neighborId, groups);
          }
          groups.push(groupId);
        }
      }
    }    
  }

  includes(actorId: ActorId): boolean {
    return this.allActorIds.has(actorId);
  }

  includesAsMember(actorId: ActorId): boolean {
    return this.memberToGroupsMap.has(actorId);
  }

  getMemberGroupIds(actorId: ActorId): GroupId[] {
    return this.memberToGroupsMap.get(actorId) ?? [];
  }

  getNeighborGroupIds(actorId: ActorId): GroupId[] {
    return this.neighborToGroupsMap.get(actorId) ?? [];
  }

  getAllMemberIds(): ActorId[] {
    return [...this.memberToGroupsMap.keys()];
  }

  getAllNeighborIds(): ActorId[] {
    return [...this.neighborToGroupsMap.keys()];
  }
}
