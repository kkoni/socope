import { LongLivedDataStorage, StorageManager, getStorageManager } from '../lib/storage';
import { GroupId } from '../data';
import {
  NeighborCrawlResult,
  NeighborCrawlStatus,
  NeighborCrawlFollowsFetchQueue,
  NeighborCrawlFollowsFetchBuffer,
  NeighborCrawlDataSet,
  deserializeNeighborCrawlResult,
  serializeNeighborCrawlResult
} from './data';

interface Singletons {
  neighborCrawlResultRepository: NeighborCrawlResultRepository;
  neighborCrawlStatusRepository: NeighborCrawlStatusRepository;
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
  private activityPubFetchFinished: boolean = false;
  private atProtoFetchFinished: boolean = false;
  private activityPubFollowsFetchQueue: NeighborCrawlFollowsFetchQueue = new NeighborCrawlFollowsFetchQueue();
  private atProtoFollowsFetchQueue: NeighborCrawlFollowsFetchQueue = new NeighborCrawlFollowsFetchQueue();
  private followsFetchBuffer: NeighborCrawlFollowsFetchBuffer = new NeighborCrawlFollowsFetchBuffer();
  private activityPubDataSet?: NeighborCrawlDataSet;
  private atProtoDataSet?: NeighborCrawlDataSet;

  initializeCrawl(status: NeighborCrawlStatus, activityPubDataSet?: NeighborCrawlDataSet, atProtoDataSet?: NeighborCrawlDataSet): void {
    this.status = status;
    this.activityPubDataSet = activityPubDataSet;
    this.atProtoDataSet = atProtoDataSet;
    this.activityPubFetchFinished = false;
    this.atProtoFetchFinished = false;
    this.activityPubFollowsFetchQueue.clear();
    this.atProtoFollowsFetchQueue.clear();
    this.followsFetchBuffer.clear();
  }

  get(): NeighborCrawlStatus|undefined {
    return this.status;
  }

  getActivityPubDataSet(): NeighborCrawlDataSet|undefined {
    return this.activityPubDataSet;
  }

  getAtProtoDataSet(): NeighborCrawlDataSet|undefined {
    return this.atProtoDataSet;
  }

  getActivityPubFollowsFetchQueue(): NeighborCrawlFollowsFetchQueue {
    return this.activityPubFollowsFetchQueue;
  }

  getAtProtoFollowsFetchQueue(): NeighborCrawlFollowsFetchQueue { 
    return this.atProtoFollowsFetchQueue;
  }

  getFollowsFetchBuffer(): NeighborCrawlFollowsFetchBuffer {
    return this.followsFetchBuffer;
  }

  isActivityPubFetchFinished(): boolean {
    return this.activityPubFetchFinished;
  }

  setActivityPubFetchFinished(): void {
    this.activityPubFetchFinished = true;
  }

  isAtProtoFetchFinished(): boolean {
    return this.atProtoFetchFinished;
  }

  setAtProtoFetchFinished(): void {
    this.atProtoFetchFinished = true;
  }

  delete(): void {
    this.status = undefined;
    this.activityPubFetchFinished = false;
    this.atProtoFetchFinished = false;
    this.activityPubDataSet = undefined;
    this.atProtoDataSet = undefined;
    this.activityPubFollowsFetchQueue.clear();
    this.atProtoFollowsFetchQueue.clear();
    this.followsFetchBuffer.clear();
  }
}
