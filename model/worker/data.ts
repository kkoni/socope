import { Queue } from '../lib/util';
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
  followCounts: Map<string, { countByMember: number, countByNeighbor: number }>;
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
