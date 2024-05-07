import { Queue, SerializableKeyMap } from '../lib/util';
import {
  ActorId,
  GroupId,
  deserializeActorId,
  serializeActorId,
  deserializeGroupId,
  serializeGroupId
} from '../data';

export interface NeighborCrawlStatus {
  groupId: GroupId;
  startedAt: Date;
}

export interface NeighborCrawlDataSet {
  groupActorIds: Set<string>;
  closeNeighborIds: Set<string>;
  errorActorIds: Set<string>;
  followCounts: SerializableKeyMap<ActorId, { countByMember: number, countByNeighbor: number }>;
}

export interface NeighborCrawlFollowsFetchParams {
  actorId: ActorId,
  cursor?: string,
  errorCount: number,
}

export interface NeighborCrawlResult {
  groupId: GroupId,
  startedAt: Date,
  finishedAt: Date,
  groupActorIds: ActorId[],
  isSucceeded: boolean,
  error?: string
}

function neighborCrawlResultToSerializableObject(result: NeighborCrawlResult): any {
  return {
    groupId: serializeGroupId(result.groupId),
    startedAt: result.startedAt.getTime(),
    finishedAt: result.finishedAt.getTime(),
    groupActorIds: result.groupActorIds.map(serializeActorId),
    isSucceeded: result.isSucceeded,
    error: result.error,
  };
}

function serializableObjectToNeighborCrawlResult(obj: any): NeighborCrawlResult|undefined {
  if (obj && obj.groupId && obj.startedAt && obj.groupActorIds && obj.finishedAt && obj.isSucceeded) {
    const groupId = deserializeGroupId(obj.groupId);
    if (groupId) {
      return {
        groupId,
        startedAt: new Date(obj.startedAt),
        finishedAt: new Date(obj.finishedAt),
        groupActorIds: obj.groupActorIds.map(deserializeActorId),
        isSucceeded: obj.isSucceeded,
        error: obj.error,
      };
    }
  }
  return undefined;
}

export function serializeNeighborCrawlResult(result: NeighborCrawlResult): string {
  return JSON.stringify(neighborCrawlResultToSerializableObject(result));
}

export function deserializeNeighborCrawlResult(s: string): NeighborCrawlResult|undefined {
  return serializableObjectToNeighborCrawlResult(JSON.parse(s));
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

  getSize(): number {
    return this.queue.getSize();
  }
}

export class NeighborCrawlFollowsFetchBuffer {
  private buffer: SerializableKeyMap<ActorId, ActorId[]> = new SerializableKeyMap();

  add(actorId: ActorId, followedIds: ActorId[]) {
    let buffered = this.buffer.get(actorId);
    if (buffered === undefined) {
      this.buffer.set(actorId, [...followedIds]);
    } else {
      buffered.push(...followedIds);
    }
  }

  get(actorId: ActorId): ActorId[]|undefined {
    return this.buffer.get(actorId);
  }

  delete(actorId: ActorId): void {
    this.buffer.delete(actorId);
  }

  clear(): void {
    this.buffer.clear();
  }
}

export interface FeedFetchResult {
  actorId: ActorId;
  fetchedAt: Date;
  mostRecentlyPostedAt?: Date;
  isSucceeded: boolean;
}

function feedFetchResultToSerializableObject(result: FeedFetchResult): any {
  return {
    actorId: serializeActorId(result.actorId),
    fetchedAt: result.fetchedAt.getTime(),
    isSucceeded: result.isSucceeded,
  };
}

function serializableObjectToFeedFetchResult(obj: any): FeedFetchResult|undefined {
  if (obj && obj.actorId && obj.fetchedAt && obj.isSucceeded) {
    const actorId = deserializeActorId(obj.actorId);
    if (actorId) {
      return {
        actorId,
        fetchedAt: new Date(obj.fetchedAt),
        isSucceeded: obj.isSucceeded,
      };
    }
  }
  return undefined;
}

export function serializeFeedFetchResult(result: FeedFetchResult): string {
  return JSON.stringify(feedFetchResultToSerializableObject(result));
}

export function deserializeFeedFetchResult(s: string): FeedFetchResult|undefined {
  return serializableObjectToFeedFetchResult(JSON.parse(s));
}
