import { LongLivedDataStorage, StorageManager, getStorageManager } from '../lib/storage';
import { Queue } from '../lib/util';
import { ActorId, GroupId } from '../data';
import {
  NeighborCrawlResult,
  NeighborCrawlStatus,
  NeighborCrawlFollowsFetchParams,
  deserializeNeighborCrawlResult,
  serializeNeighborCrawlResult
} from './data';

interface Singletons {
  neighborCrawlResultRepository: NeighborCrawlResultRepository;
  neighborCrawlStatusRepository: NeighborCrawlStatusRepository;
  neighborCrawlFollowsFetchQueue: NeighborCrawlFollowsFetchQueue;
  neighborCrawlFollowsFetchBuffer: NeighborCrawlFollowsFetchBuffer;
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

export function getNeighborCrawlFollowsFetchQueue(): NeighborCrawlFollowsFetchQueue {
  if (!singletons.neighborCrawlFollowsFetchQueue) {
    singletons.neighborCrawlFollowsFetchQueue = new NeighborCrawlFollowsFetchQueue();
  }
  return singletons.neighborCrawlFollowsFetchQueue;
}

export function getNeighborCrawlFollowsFetchBuffer(): NeighborCrawlFollowsFetchBuffer {
  if (!singletons.neighborCrawlFollowsFetchBuffer) {
    singletons.neighborCrawlFollowsFetchBuffer = new NeighborCrawlFollowsFetchBuffer();
  }
  return singletons.neighborCrawlFollowsFetchBuffer;
}

export class NeighborCrawlResultRepository {
  private static storageKeyPrefix = 'NeighborCrawlResultRepository.storage';

  private storage: LongLivedDataStorage<NeighborCrawlResult>;

  constructor(private storageManager: StorageManager) {
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

  store(status: NeighborCrawlStatus): void {
    this.status = status;
  }

  get(): NeighborCrawlStatus|undefined {
    return this.status;
  }

  delete(): void {
    this.status = undefined;
  }
}

export class NeighborCrawlFollowsFetchQueue {
  private static queueLimit = 1000;

  private queue: Queue<NeighborCrawlFollowsFetchParams> = new Queue(NeighborCrawlFollowsFetchQueue.queueLimit);

  enqueue(params: NeighborCrawlFollowsFetchParams): boolean {
    return this.queue.enqueue(params);
  }

  dequeue(): NeighborCrawlFollowsFetchParams|undefined {
    return this.queue.dequeue();
  }

  isEmpty(): boolean {
    return this.queue.isEmpty() ?? true;
  }

  clear(): void {
    this.queue.clear();
  }
}

export class NeighborCrawlFollowsFetchBuffer {
  private buffer: Map<string, ActorId[]> = new Map();

  add(actorId: ActorId, followedIds: ActorId[]) {
    let buffered = this.buffer.get(actorId.toString());
    if (buffered === undefined) {
      this.buffer.set(actorId.toString(), [...followedIds]);
    } else {
      buffered.push(...followedIds);
    }
  }

  get(actorId: ActorId): ActorId[]|undefined {
    return this.buffer.get(actorId.toString());
  }

  delete(actorId: ActorId): void {
    this.buffer.delete(actorId.toString());
  }

  clear(): void {
    this.buffer.clear();
  }
}
