import { equalsAsSet, getEpochSeconds } from '../lib/util';
import { ActorId, Group, Neighbor, SNSTypes, parseActorId } from '../data';
import { getGroupRepository, getFollowsRepository, getNeighborsRepository } from '../repositories';
import {
  getActorRepository as getActivityPubActorRepository,
  getFollowingClient as getActivityPubFollowingClient,
} from '../activity-pub/repositories';
import { getFollowsClient as getATProtoFollowsClient } from '../atproto/repositories';
import { NeighborCrawlStatus, NeighborCrawlFollowsFetchParams } from './data';
import {
  getNeighborCrawlResultRepository,
  getNeighborCrawlStatusRepository,
  getNeighborCrawlFollowsFetchQueue,
  getNeighborCrawlFollowsFetchBuffer,
} from './repositories';

let neighborCrawlStartWorkerRunning = false;
let neighborCrawlWorkerRunning = false;

export function startWorkers() {
  if (!neighborCrawlStartWorkerRunning) {
    new NeighborCrawlStartWorker().start();
    neighborCrawlStartWorkerRunning = true;
  }
  if (!neighborCrawlWorkerRunning) {
    new NeighborCrawlWorker().start();
    neighborCrawlWorkerRunning = true;
  }
}

class NeighborCrawlStartWorker {
  private static successIntervalHours = 24 * 3;
  private static errorIntervalHours = 6;

  async start() {
    setInterval(async () => {
      try {
        const groupRepository = await getGroupRepository();
        for (const group of (await groupRepository.getAll())) {
          await this.checkStatusAndStartCrawl(group);
        }
      } catch(e) {
        console.error('NeighborCrawlStartWorker error', e);
      }
    }, 10000);
  }

  private async checkStatusAndStartCrawl(group: Group): Promise<void> {
    const statusRepository = getNeighborCrawlStatusRepository();
    const status = statusRepository.get();
    if (status !== undefined) {
      return;
    }

    if (await this.isTimeToStartCrawl(group)) {
      const followCounts = new Map<string, { countByMember: number, countByNeighbor: number }>();
      const followsFetchQueue = getNeighborCrawlFollowsFetchQueue();
      followsFetchQueue.clear();
      for (const actorId of group.actorIds) {
        checkFollowsAndEnqueueFetchParamsIfNecessary(actorId, true, followCounts);
      }
      statusRepository.store({
        groupId: group.id,
        startedAt: new Date(),
        groupActorIds: new Set(group.actorIds.map((aid) => aid.toString())),
        closeNeighborIds: new Set(),
        errorActorIds: new Set(),
        followCounts: followCounts,
      });
      console.log('Start NeighborCrawlWorker for group ' + group.id.toString());
    }
  }

  private async isTimeToStartCrawl(group: Group): Promise<boolean> {
    const resultRepository = await getNeighborCrawlResultRepository();
    const lastResult = await resultRepository.get(group.id);
    return lastResult === undefined ||
      !equalsAsSet(lastResult.groupActorIds.map((gid) => gid.toString()), group.actorIds.map((gid) => gid.toString())) ||
      (lastResult.isSucceeded && lastResult.finishedAt.getTime() < getEpochSeconds() - NeighborCrawlStartWorker.successIntervalHours * 3600) ||
      (!lastResult.isSucceeded && lastResult.finishedAt.getTime() < getEpochSeconds() - NeighborCrawlStartWorker.errorIntervalHours * 3600);
  }
}

async function checkFollowsAndEnqueueFetchParamsIfNecessary(
  actorId: ActorId,
  isMember: boolean,
  followCounts: Map<string, { countByMember: number, countByNeighbor: number }>,
) {
  const followsRepository = await getFollowsRepository();
  const followsFetchQueue = getNeighborCrawlFollowsFetchQueue();
  const follows = await followsRepository.get(actorId);
  if (follows === undefined) {
    followsFetchQueue.enqueue({actorId, errorCount: 0});
  } else {
    addFollowCounts(followCounts, isMember, follows.followedIds);
  }
}

function addFollowCounts(
  followCounts: Map<string, { countByMember: number, countByNeighbor: number }>,
  isMember: boolean,
  followedIds: ActorId[],
) {
  for (const followedId of followedIds) {
    const followedIdString = followedId.toString();
    const count = followCounts.get(followedIdString);
    if (count === undefined) {
      followCounts.set(followedIdString, { countByMember: 0, countByNeighbor: 0 });
    }
    if (isMember) {
      followCounts.get(followedIdString)!.countByMember++;
    } else {
      followCounts.get(followedIdString)!.countByNeighbor++;
    }
  }
}

interface FollowsFetchResult {
  nextParams?: NeighborCrawlFollowsFetchParams,
  allFollowsAvailable: boolean,
  isError: boolean,
}

class NeighborCrawlWorker {
  private static intervalMillis = 10000;
  private static fetchesPerInterval = 20;
  private static enouchActorsThreshold = 10;
  private static followsFetchRetryLimit = 3;
  private static maxNeighbors = 1000;
  private static neighborFollowCountThreshold = 2;

  async start() {
    setInterval(async () => {
      try {
        await this.crawl();
      } catch(e) {
        console.error('NeighborCrawlWorker error', e);
      }
    }, NeighborCrawlWorker.intervalMillis);
  }

  private async crawl(): Promise<void> {
    const statusRepository = getNeighborCrawlStatusRepository();
    const status = statusRepository.get();
    if (status === undefined) {
      return;
    }
    const followsFetchQueue = getNeighborCrawlFollowsFetchQueue();
    for (let i = 0; i < NeighborCrawlWorker.fetchesPerInterval; i++) {
      const followsFetchParams = followsFetchQueue.dequeue();
      if (followsFetchParams === undefined) {
        if (this.hasEnoughActors(status) || !this.addCloseNeighbor(status)) {
          this.finalizeCrawl(status);
          return;
        }
      } else {
        const followsFetchResult = await this.fetchFollows(followsFetchParams);
        const followsFetchBuffer = getNeighborCrawlFollowsFetchBuffer();
        if (followsFetchResult.isError) {
          followsFetchBuffer.delete(followsFetchParams.actorId);
          status.errorActorIds.add(followsFetchParams.actorId.toString());
          if (status.errorActorIds.size > (status.groupActorIds.size + status.closeNeighborIds.size) / 2) {
            this.finalizeCrawlByError(status);
            return;
          }
        } else if (followsFetchResult.allFollowsAvailable) {
          const followedIds = followsFetchBuffer.get(followsFetchParams.actorId);
          if (followedIds !== undefined) {
            const followsRepository = await getFollowsRepository();
            followsRepository.store(followsFetchParams.actorId, followedIds.map((aid) => aid.value));
            addFollowCounts(status.followCounts, status.groupActorIds.has(followsFetchParams.actorId.toString()), followedIds);
          }
        } else {
          if (followsFetchResult.nextParams !== undefined) {
            const followsFetchQueue = getNeighborCrawlFollowsFetchQueue();
            followsFetchQueue.enqueue(followsFetchResult.nextParams);
          }
        }
      }
    }
  }

  private hasEnoughActors(status: NeighborCrawlStatus): boolean {
    return status.groupActorIds.size + status.closeNeighborIds.size - status.errorActorIds.size >= NeighborCrawlWorker.enouchActorsThreshold;
  }

  private async fetchFollows(params: NeighborCrawlFollowsFetchParams): Promise<FollowsFetchResult> {
    switch(params.actorId.snsType) {
      case SNSTypes.ActivityPub:
        return await this.fetchActivityPubFollowing(params);
      case SNSTypes.ATProto:
        return await this.fetchATProtoFollows(params);
    }
  }

  private async fetchActivityPubFollowing(params: NeighborCrawlFollowsFetchParams): Promise<FollowsFetchResult> {
    try {
      const client = getActivityPubFollowingClient();
      let pageUri: string|undefined = params.cursor;
      if (pageUri === undefined) {
        const actor = await (await getActivityPubActorRepository()).get(params.actorId.value);
        if (actor === undefined) {
          return { allFollowsAvailable: false, isError: true };
        }
        pageUri = await client.fetchFirstPageUri(actor.following);
      }
      if (pageUri === undefined) {
        return { allFollowsAvailable: false, isError: true };
      }
      const follows = await client.fetchPage(pageUri);
      if (follows === undefined) {
        return { allFollowsAvailable: false, isError: true };
      }
      const followedIds = follows.items.map((item) => {
        if (typeof item === 'string') {
          return new ActorId(params.actorId.snsType, item);
        } else {
          return null;
        }
      }).filter((aid) => aid !== null) as ActorId[];
      const followsFetchBuffer = getNeighborCrawlFollowsFetchBuffer();
      followsFetchBuffer.add(params.actorId, followedIds);
      if (follows.next === undefined) {
        return { allFollowsAvailable: true, isError: false };
      } else {
        return { nextParams: { ...params, cursor: follows.next, errorCount: 0 }, allFollowsAvailable: false, isError: false };
      }
    } catch(e: any) {
      console.error('NeighborCrawlWorker.fetchActivityPubFollowing error', e);
      if (params.errorCount < NeighborCrawlWorker.followsFetchRetryLimit) {
        return { nextParams: { ...params, errorCount: params.errorCount + 1 }, allFollowsAvailable: false, isError: false };
      } else {
        return { allFollowsAvailable: false, isError: true };
      }
    }
  }

  private async fetchATProtoFollows(params: NeighborCrawlFollowsFetchParams): Promise<FollowsFetchResult> {
    try {
      const client = getATProtoFollowsClient();
      const response = await client.fetch(params.actorId.value, params.cursor);
      if (response === undefined) {
        return { allFollowsAvailable: false, isError: true };
      }
      const followedIds = response.followedIds.map((aid) => new ActorId(SNSTypes.ATProto, aid));
      const followsFetchBuffer = getNeighborCrawlFollowsFetchBuffer();
      followsFetchBuffer.add(params.actorId, followedIds);
      if (response.cursor === undefined) {
        return { allFollowsAvailable: true, isError: false };
      } else {
        return { nextParams: { ...params, cursor: response.cursor, errorCount: 0 }, allFollowsAvailable: false, isError: false };
      }
    } catch(e: any) {
      console.error('NeighborCrawlWorker.fetchATProtoFollows error', e);
      if (params.errorCount < NeighborCrawlWorker.followsFetchRetryLimit) {
        return { nextParams: { ...params, errorCount: params.errorCount + 1 }, allFollowsAvailable: false, isError: false };
      } else {
        return { allFollowsAvailable: false, isError: true };
      }
    }
  }

  private async addCloseNeighbor(status: NeighborCrawlStatus): Promise<boolean> {
    const followCounts = Array.from(status.followCounts.entries());
    this.sortFollowCounts(followCounts);
    for (const fc of followCounts) {
      if (!status.groupActorIds.has(fc[0]) && !status.closeNeighborIds.has(fc[0]) && !status.errorActorIds.has(fc[0])) {
        const actorId = parseActorId(fc[0]);
        if (actorId !== undefined) {
          status.closeNeighborIds.add(fc[0]);
          checkFollowsAndEnqueueFetchParamsIfNecessary(actorId, status.groupActorIds.has(fc[0]), status.followCounts);
          return true;
        }
      }
    }
    return false;
  }

  private sortFollowCounts(followCounts:[string, { countByMember: number, countByNeighbor: number }][]) {
    followCounts.sort((a, b) => {
      if (a[1].countByMember !== b[1].countByMember) {
        return b[1].countByMember - a[1].countByMember;
      } else if (a[1].countByNeighbor !== b[1].countByNeighbor) {
        return b[1].countByNeighbor - a[1].countByNeighbor;
      } else {
        return 0;
      }
    });
  }

  private async finalizeCrawl(status: NeighborCrawlStatus): Promise<void> {
    const closeNeighbors: Neighbor[] = [];
    for (const closeNeighborId of status.closeNeighborIds) {
      const actorId = parseActorId(closeNeighborId);
      if (actorId !== undefined) {
        const followCount = status.followCounts.get(closeNeighborId);
        closeNeighbors.push({ actorId, followCount: followCount === undefined ? 0 : followCount.countByMember + followCount.countByNeighbor });
      }
    }

    const followCounts: [string, { countByMember: number, countByNeighbor: number }][] =
      Array.from(status.followCounts.entries()).filter((fc) => {
        return !status.groupActorIds.has(fc[0]) &&
          !status.closeNeighborIds.has(fc[0]) &&
          fc[1].countByMember + fc[1].countByNeighbor > NeighborCrawlWorker.neighborFollowCountThreshold;
      });;
    this.sortFollowCounts(followCounts);
    const farNeighbors: Neighbor[] = [];
    for (const fc of followCounts) {
      const actorId = parseActorId(fc[0]);
      if (actorId !== undefined) {
        farNeighbors.push({ actorId, followCount: fc[1].countByMember + fc[1].countByNeighbor });
      }
    }
    const selectedFarNeighbors = farNeighbors.slice(0, NeighborCrawlWorker.maxNeighbors - closeNeighbors.length);

    const neighborsRepository = await getNeighborsRepository();
    neighborsRepository.store(status.groupId, { closeNeighbors, farNeighbors: selectedFarNeighbors });

    const resultRepository = await getNeighborCrawlResultRepository();
    resultRepository.store({
      groupId: status.groupId,
      isSucceeded: true,
      startedAt: status.startedAt,
      finishedAt: new Date(),
      groupActorIds: Array.from(status.groupActorIds).map((aid) => parseActorId(aid)!),
    });
    getNeighborCrawlStatusRepository().delete();
    getNeighborCrawlFollowsFetchQueue().clear();
    getNeighborCrawlFollowsFetchBuffer().clear();
    console.log('Finish neighbor crawl for group ' + status.groupId.toString());
  }

  private async finalizeCrawlByError(status: NeighborCrawlStatus): Promise<void> {
    const resultRepository = await getNeighborCrawlResultRepository();
    resultRepository.store({
      groupId: status.groupId,
      isSucceeded: false,
      startedAt: status.startedAt,
      finishedAt: new Date(),
      groupActorIds: Array.from(status.groupActorIds).map((aid) => parseActorId(aid)!),
    });
    getNeighborCrawlStatusRepository().delete();
    getNeighborCrawlFollowsFetchQueue().clear();
    getNeighborCrawlFollowsFetchBuffer().clear();
    console.log('Fail neighbor crawl for group ' + status.groupId.toString());
  }
}
