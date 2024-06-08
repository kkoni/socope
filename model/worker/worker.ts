import { AppBskyFeedDefs } from '@atproto/api';
import { SerializableKeyMap, SerializableValueSet, equalsAsSet, getEpochSeconds } from '../lib/util';
import { ActorId, Group, Neighbor, Post, SNSTypes } from '../data';
import { getActorRepository, getGroupRepository, getFollowsRepository, getNeighborsRepository } from '../repositories';
import { PostIndex } from '../posts/data';
import {
  getActorRepository as getActivityPubActorRepository,
  getFollowingClient as getActivityPubFollowingClient,
} from '../activity-pub/repositories';
import {
  getFollowsClient as getATProtoFollowsClient,
  getFeedRepository as getATProtoFeedRepository,
} from '../atproto/repositories';
import {
  NeighborCrawlStatus,
  NeighborCrawlFollowsFetchParams,
  NeighborCrawlFollowsFetchQueue,
  NeighborCrawlDataSet,
  FeedFetchResult,
} from './data';
import {
  getNeighborCrawlResultRepository,
  getNeighborCrawlStatusRepository,
  getFeedFetchQueue,
  getFeedFetchResultRepository,
} from './repositories';
import { getPostIndexRepository } from '../posts/repositories';

let neighborCrawlStartWorker: NeighborCrawlStartWorker|undefined;
let neighborCrawlWorker: NeighborCrawlWorker|undefined;
let feedFetchEnqueueWorker: FeedFetchEnqueueWorker|undefined;
let feedFetchWorker: FeedFetchWorker|undefined;
let postIndexFlushWorker: PostIndexFlushWorker|undefined;

export function startWorkers(setCurrentNeighborCrawlStatus: (status: NeighborCrawlStatus|undefined) => void) {
  if (neighborCrawlStartWorker === undefined) {
    neighborCrawlStartWorker = new NeighborCrawlStartWorker(setCurrentNeighborCrawlStatus);
    neighborCrawlStartWorker.start();
  }
  if (neighborCrawlWorker === undefined) {
    neighborCrawlWorker = new NeighborCrawlWorker(setCurrentNeighborCrawlStatus);
    neighborCrawlWorker.start();
  }
  if (feedFetchEnqueueWorker === undefined) {
    feedFetchEnqueueWorker = new FeedFetchEnqueueWorker();
    feedFetchEnqueueWorker.start();
  }
  if (feedFetchWorker === undefined) {
    feedFetchWorker = new FeedFetchWorker();
    feedFetchWorker.start();
  }
  if (postIndexFlushWorker === undefined) {
    postIndexFlushWorker = new PostIndexFlushWorker();
    postIndexFlushWorker.start();
  }
}

export function stopWorkers() {
  neighborCrawlStartWorker?.stop();
  neighborCrawlWorker?.stop();
  feedFetchEnqueueWorker?.stop();
  feedFetchWorker?.stop();
  postIndexFlushWorker?.stop();
}

class NeighborCrawlStartWorker {
  private static successIntervalHours = 24 * 3;
  private static errorIntervalHours = 6;

  private setCurrentNeighborCrawlStatus: (status: NeighborCrawlStatus|undefined) => void;
  private clearInterval: any|undefined;

  constructor(setCurrentNeighborCrawlStatus: (status: NeighborCrawlStatus|undefined) => void) {
    this.setCurrentNeighborCrawlStatus = setCurrentNeighborCrawlStatus;
  }

  start(){
    this.clearInterval = setInterval(() => { this.execute(); }, 1000);
  }

  stop() {
    if (this.clearInterval !== undefined) {
      clearInterval(this.clearInterval);
    }
  }

  private async execute() {
    try {
      const groupRepository = await getGroupRepository();
      for (const group of (await groupRepository.getAll())) {
        await this.checkStatusAndStartCrawl(group);
      }
    } catch(e) {
      console.error('NeighborCrawlStartWorker error', e);
    }
  }

  private async checkStatusAndStartCrawl(group: Group): Promise<void> {
    const statusRepository = getNeighborCrawlStatusRepository();
    const status = statusRepository.get();
    if (status !== undefined) {
      return;
    }

    if (await this.isTimeToStartCrawl(group)) {
      const activityPubActorIds = group.actorIds.filter((aid) => aid.snsType === SNSTypes.ActivityPub);
      const atProtoActorIds = group.actorIds.filter((aid) => aid.snsType === SNSTypes.ATProto);
      const activityPubDataSet = activityPubActorIds.length === 0 ? undefined : await this.createInitialDataSet(activityPubActorIds, statusRepository.getActivityPubFollowsFetchQueue());
      const atProtoDataSet = atProtoActorIds.length === 0 ? undefined : await this.createInitialDataSet(atProtoActorIds, statusRepository.getAtProtoFollowsFetchQueue());
      const newStatus = {
        groupId: group.id,
        startedAt: new Date(),
        fetchFinished: { activityPub: 0, atProto: 0 },
      };
      statusRepository.initializeCrawl(newStatus, activityPubDataSet, atProtoDataSet);
      this.setCurrentNeighborCrawlStatus(newStatus);
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

  private async createInitialDataSet(actorIds: ActorId[], followsFetchQueue: NeighborCrawlFollowsFetchQueue): Promise<NeighborCrawlDataSet> {
    const dataSet = {
      groupActorIds: new SerializableValueSet(actorIds),
      closeNeighborIds: new SerializableValueSet<ActorId>(),
      errorActorIds: new SerializableValueSet<ActorId>(),
      followCounts: new SerializableKeyMap<ActorId, { countByMember: number, countByNeighbor: number }>(),
    };
    for (const actorId of actorIds) {
      await checkFollowsAndEnqueueFetchParamsIfNecessary(actorId, true, dataSet, followsFetchQueue);
    }
    return dataSet;
  }
}

async function checkFollowsAndEnqueueFetchParamsIfNecessary(
  actorId: ActorId,
  isMember: boolean,
  dataSet: NeighborCrawlDataSet,
  followsFetchQueue: NeighborCrawlFollowsFetchQueue,
) {
  const followsRepository = await getFollowsRepository();
  const follows = await followsRepository.get(actorId);
  if (follows === undefined) {
    followsFetchQueue.enqueue({actorId, errorCount: 0});
  } else {
    addFollowCounts(dataSet.followCounts, isMember, follows.followedIds);
  }
}

function addFollowCounts(
  followCounts: SerializableKeyMap<ActorId, { countByMember: number, countByNeighbor: number }>,
  isMember: boolean,
  followedIds: ActorId[],
) {
  for (const followedId of followedIds) {
    if (!followCounts.has(followedId)) {
      followCounts.set(followedId, { countByMember: 0, countByNeighbor: 0 });
    }
    if (isMember) {
      followCounts.get(followedId)!.countByMember++;
    } else {
      followCounts.get(followedId)!.countByNeighbor++;
    }
  }
}

interface FollowsFetchResult {
  nextParams?: NeighborCrawlFollowsFetchParams,
  allFollowsAvailable: boolean,
  isError: boolean,
}

class NeighborCrawlWorker {
  private static intervalMillis = 2000;
  private static enoughActorsThreshold = 100;
  private static followsFetchRetryLimit = 3;
  private static maxNeighbors = 1000;
  private static neighborFollowCountThreshold = 2;

  private setCurrentNeighborCrawlStatus: (status: NeighborCrawlStatus|undefined) => void;
  private clearInterval: any|undefined;

  constructor(setCurrentNeighborCrawlStatus: (status: NeighborCrawlStatus|undefined) => void) {
    this.setCurrentNeighborCrawlStatus = setCurrentNeighborCrawlStatus;
  }

  start() {
    this.clearInterval = setInterval(() => { this.execute(); }, NeighborCrawlWorker.intervalMillis);
  }

  stop() {
    if (this.clearInterval !== undefined) {
      clearInterval(this.clearInterval);
    }
  }

  private async execute() {
    try {
      await this.crawl();
    } catch(e) {
      console.error('NeighborCrawlWorker error', e);
    }
  }

  private async crawl(): Promise<void> {
    const start = Date.now();
    const statusRepository = getNeighborCrawlStatusRepository();
    const status = statusRepository.get();
    if (status === undefined) {
      return;
    }
    while (Date.now() - start < NeighborCrawlWorker.intervalMillis - 500) {
      const activityPubDataSet = statusRepository.getActivityPubDataSet();
      const atProtoDataSet = statusRepository.getAtProtoDataSet();
      if (activityPubDataSet !== undefined && !statusRepository.isActivityPubFetchFinished()) {
        if (await this.fetchNext(status, activityPubDataSet, statusRepository.getActivityPubFollowsFetchQueue())) {
          statusRepository.setActivityPubFetchFinished();
        }
      } else if (atProtoDataSet !== undefined && !statusRepository.isAtProtoFetchFinished()) {
        const ret = await this.fetchNext(status, atProtoDataSet, statusRepository.getAtProtoFollowsFetchQueue());
        if (ret) {
          statusRepository.setAtProtoFetchFinished();
        }
      } else {
        await this.finalizeCrawl(status);
      }
      if (statusRepository.get() === undefined) {
        return;
      }
    }
  }

  private async fetchNext(status: NeighborCrawlStatus, dataSet: NeighborCrawlDataSet, followsFetchQueue: NeighborCrawlFollowsFetchQueue): Promise<boolean> {
    const followsFetchBuffer = getNeighborCrawlStatusRepository().getFollowsFetchBuffer();
    const followsFetchParams = followsFetchQueue.dequeue();
    if (followsFetchParams === undefined) {
      if (this.hasEnoughActors(dataSet) || !(await this.addCloseNeighbor(dataSet, followsFetchQueue))) {
        return true;
      }
    } else {
      const followsFetchResult = await this.fetchFollows(followsFetchParams, dataSet);
      if (followsFetchResult.isError) {
        followsFetchBuffer.delete(followsFetchParams.actorId);
        dataSet.errorActorIds.add(followsFetchParams.actorId);
        if (dataSet.errorActorIds.size > (dataSet.groupActorIds.size + dataSet.closeNeighborIds.size) / 2) {
          await this.finalizeCrawlByError(status);
        }
      } else if (followsFetchResult.allFollowsAvailable) {
        const followedIds = followsFetchBuffer.get(followsFetchParams.actorId);
        if (followedIds !== undefined) {
          const followsRepository = await getFollowsRepository();
          await followsRepository.store(followsFetchParams.actorId, followedIds.map((aid) => aid.value));
          addFollowCounts(dataSet.followCounts, dataSet.groupActorIds.has(followsFetchParams.actorId), followedIds);
        }
      } else {
        if (followsFetchResult.nextParams !== undefined) {
          followsFetchQueue.enqueue(followsFetchResult.nextParams);
        }
      }
    }
    return false;
  }

  private hasEnoughActors(dataSet: NeighborCrawlDataSet): boolean {
    return dataSet.groupActorIds.size + dataSet.closeNeighborIds.size - dataSet.errorActorIds.size >= NeighborCrawlWorker.enoughActorsThreshold;
  }
    

  private async fetchFollows(
    params: NeighborCrawlFollowsFetchParams,
    dataSet: NeighborCrawlDataSet,
  ): Promise<FollowsFetchResult> {
    switch(params.actorId.snsType) {
      case SNSTypes.ActivityPub:
        return await this.fetchActivityPubFollowing(params, dataSet);
      case SNSTypes.ATProto:
        return await this.fetchATProtoFollows(params, dataSet);
    }
  }

  private async fetchActivityPubFollowing(
    params: NeighborCrawlFollowsFetchParams,
    dataSet: NeighborCrawlDataSet,
  ): Promise<FollowsFetchResult> {
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
      const followsFetchBuffer = getNeighborCrawlStatusRepository().getFollowsFetchBuffer();
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

  private async fetchATProtoFollows(
    params: NeighborCrawlFollowsFetchParams,
    dataSet: NeighborCrawlDataSet,
  ): Promise<FollowsFetchResult> {
    try {
      const client = getATProtoFollowsClient();
      const response = await client.fetch(params.actorId.value, params.cursor);
      if (response === undefined) {
        return { allFollowsAvailable: false, isError: true };
      }
      const followedIds = response.followedIds.map((aid) => new ActorId(SNSTypes.ATProto, aid));
      const followsFetchBuffer = getNeighborCrawlStatusRepository().getFollowsFetchBuffer();
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

  private async addCloseNeighbor(dataSet: NeighborCrawlDataSet, followsFetchQueue: NeighborCrawlFollowsFetchQueue): Promise<boolean> {
    const followCounts = Array.from(dataSet.followCounts.entries());
    this.sortFollowCounts(followCounts);
    for (const fc of followCounts) {
      const actorId = fc[0];
      if (!dataSet.groupActorIds.has(actorId) && !dataSet.closeNeighborIds.has(actorId) && !dataSet.errorActorIds.has(actorId)) {
        dataSet.closeNeighborIds.add(actorId);
        await checkFollowsAndEnqueueFetchParamsIfNecessary(actorId, dataSet.groupActorIds.has(actorId), dataSet, followsFetchQueue);
        return true;
      }
    }
    return false;
  }

  private sortFollowCounts(followCounts:[ActorId, { countByMember: number, countByNeighbor: number }][]) {
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
    const statusRepository = getNeighborCrawlStatusRepository();
    const activityPubDataSet = statusRepository.getActivityPubDataSet();
    const atProtoDataSet = statusRepository.getAtProtoDataSet();
    const activityPubMemberCount = activityPubDataSet?.groupActorIds.size || 0;
    const atProtoMemberCount = atProtoDataSet?.groupActorIds.size || 0;
    const memberCount = activityPubMemberCount + atProtoMemberCount;
    const activityPubNeighborsLimit = memberCount === 0 ? 0 : NeighborCrawlWorker.maxNeighbors * (activityPubMemberCount / memberCount);
    const atProtoNeighborsLimit = memberCount === 0 ? 0 : NeighborCrawlWorker.maxNeighbors * (atProtoMemberCount / memberCount);
    const activityPubNeighbors = activityPubDataSet === undefined ? [] : this.selectNeighbors(activityPubDataSet, activityPubNeighborsLimit);
    const atProtoNeighbors = atProtoDataSet === undefined ? [] : this.selectNeighbors(atProtoDataSet, atProtoNeighborsLimit);

    const neighborsRepository = await getNeighborsRepository();
    neighborsRepository.store(status.groupId, { groupId: status.groupId, activityPubNeighbors, atProtoNeighbors });

    const resultRepository = await getNeighborCrawlResultRepository();
    const groupActorIds: ActorId[] = [];
    if (activityPubDataSet !== undefined) {
      groupActorIds.push(...Array.from(activityPubDataSet.groupActorIds.values()));
    }
    if (atProtoDataSet !== undefined) {
      groupActorIds.push(...Array.from(atProtoDataSet.groupActorIds.values()));
    }
    resultRepository.store({
      groupId: status.groupId,
      isSucceeded: true,
      startedAt: status.startedAt,
      finishedAt: new Date(),
      groupActorIds,
    });
    getNeighborCrawlStatusRepository().delete();
    this.setCurrentNeighborCrawlStatus(undefined);
    console.log('Finish neighbor crawl for group ' + status.groupId.toString());
  }

  private selectNeighbors(dataSet: NeighborCrawlDataSet, limit: number): Neighbor[] {
    const neighbors: Neighbor[] = Array.from(dataSet.followCounts.entries()).map((fc) => {
      const actorId: ActorId = fc[0];
      if (dataSet.groupActorIds.has(actorId) || fc[1].countByMember + fc[1].countByNeighbor <= NeighborCrawlWorker.neighborFollowCountThreshold) {
        return undefined;
      }
      const score = fc[1].countByMember * 2 + fc[1].countByNeighbor;
      return { actorId,  score };
    }).filter((neighbor) => neighbor !== undefined) as Neighbor[];
    neighbors.sort((a, b) => b.score - a.score);
    return neighbors.slice(0, limit);
  }

  private async finalizeCrawlByError(status: NeighborCrawlStatus): Promise<void> {
    const statusRepository = getNeighborCrawlStatusRepository();
    const activityPubDataSet = statusRepository.getActivityPubDataSet();
    const atProtoDataSet = statusRepository.getAtProtoDataSet();
    const resultRepository = await getNeighborCrawlResultRepository();
    const groupActorIds: ActorId[] = [];
    if (activityPubDataSet !== undefined) {
      groupActorIds.push(...Array.from(activityPubDataSet.groupActorIds.values()));
    }
    if (atProtoDataSet !== undefined) {
      groupActorIds.push(...Array.from(atProtoDataSet.groupActorIds.values()));
    }
    resultRepository.store({
      groupId: status.groupId,
      isSucceeded: false,
      startedAt: status.startedAt,
      finishedAt: new Date(),
      groupActorIds,
    });
    getNeighborCrawlStatusRepository().delete();
    this.setCurrentNeighborCrawlStatus(undefined);
    console.log('Fail neighbor crawl for group ' + status.groupId.toString());
  }
}

const successFeedFetchIntervalMillis = 10 * 60 * 1000;
const errorFeedFetchIntervalMillis = 60 * 60 * 1000;

class FeedFetchEnqueueWorker {
  private static intervalMillis = 10000;

  private clearInterval: any|undefined;

  start() {
    this.clearInterval = setInterval(() => { this.execute(); }, FeedFetchEnqueueWorker.intervalMillis);
  }

  stop() {
    if (this.clearInterval !== undefined) {
      clearInterval(this.clearInterval);
    }
  }

  private async execute(): Promise<void> {
    try {
      const groupRepository = await getGroupRepository();
      const feedFetchQueue = getFeedFetchQueue();
      const feedFetchResultRepository = await getFeedFetchResultRepository();
      const groups = await groupRepository.getAll();
      for (const group of groups) {
        for (const actorId of group.actorIds) {
          if (!feedFetchQueue.has(actorId)) {
            const previousResult = await feedFetchResultRepository.get(actorId);
            if (previousResult === undefined) {
              feedFetchQueue.enqueue(actorId, new Date());
            } else if (previousResult.isSucceeded) {
              feedFetchQueue.enqueue(actorId, new Date(previousResult.fetchedAt.getTime() + successFeedFetchIntervalMillis));
            } else {
              feedFetchQueue.enqueue(actorId, new Date(previousResult.fetchedAt.getTime() + errorFeedFetchIntervalMillis));
            }
          }
        }
      }
    } catch(e) {
      console.error('FeedFetchWorker error', e);
    }
  }
}

class FeedFetchWorker {
  private static intervalMillis = 10000;
  private static limitPerFetch = 10;
  private static limitPerActor = 100;

  private clearInterval: any|undefined;
  
  start(){
    this.clearInterval = setInterval(() => { this.execute(); }, FeedFetchWorker.intervalMillis);
  }

  stop() {
    if (this.clearInterval !== undefined) {
      clearInterval(this.clearInterval);
    }
  }

  private async execute(): Promise<void> {
    try {
      const start = Date.now();
      const feedFetchQueue = getFeedFetchQueue();
      while (Date.now() - start < FeedFetchWorker.intervalMillis - 1000) {
        const peeked = feedFetchQueue.peek();
        if (peeked === undefined || peeked.nextFetchTime.getTime() > Date.now()) {
          break;
        }
        const dequeued = feedFetchQueue.dequeue();
        if (dequeued === undefined) {
          break;
        }
        await this.fetchFeed(dequeued.actorId);
      }
    } catch(e) {
      console.error('FeedFetchWorker error', e);
    }
  }

  private async fetchFeed(actorId: ActorId): Promise<void> {
    const feedFetchResultRepository = await getFeedFetchResultRepository();
    const feedFetchQueue = getFeedFetchQueue();
    const previousResult = await feedFetchResultRepository.get(actorId);

    let fetchResult: {isSucceeded: boolean, mostRecentlyPostedAt?: Date};
    if (actorId.snsType === SNSTypes.ATProto) {
      fetchResult = await this.fetchATProtoFeed(actorId, previousResult);
    } else {
      fetchResult = {isSucceeded: true};
    }
    feedFetchResultRepository.store(
      {
        actorId,
        fetchedAt: new Date(),
        isSucceeded: fetchResult.isSucceeded,
        mostRecentlyPostedAt: fetchResult.mostRecentlyPostedAt ?? previousResult?.mostRecentlyPostedAt,
      }
    );
    if (fetchResult.isSucceeded) {
      feedFetchQueue.enqueue(actorId, new Date(Date.now() + successFeedFetchIntervalMillis));
    } else {
      feedFetchQueue.enqueue(actorId, new Date(Date.now() + errorFeedFetchIntervalMillis));
    }
  }

  private async fetchATProtoFeed(actorId: ActorId, previousResult?: FeedFetchResult): Promise<{isSucceeded: boolean, mostRecentlyPostedAt?:Date}> {
    const actor = await getActorRepository().get(actorId);
    const feedRepository = getATProtoFeedRepository();

    function getPostedAt(post: AppBskyFeedDefs.FeedViewPost): Date|undefined {
      let parsed: number;
      if (post.reason === undefined) {
        parsed = Date.parse(post.post.indexedAt);
      } else {
        parsed = Date.parse(post.reason.indexedAt as string);
      }
      if (isNaN(parsed)) {
        return undefined;
      }
      return new Date(parsed);
    }

    async function fetchPosts(limit: number, cursor?: string): Promise<{posts: Post[], cursor?: string}> {
      const result = await feedRepository.fetchAuthorFeed(actorId, limit, cursor);
      const newPosts = result.posts.filter((post) => {
        return post.createdAt !== undefined && (previousResult?.mostRecentlyPostedAt === undefined || previousResult.mostRecentlyPostedAt.getTime() < post.createdAt.getTime());
      });
      return { posts: newPosts, cursor: newPosts.length === limit ? result.cursor : undefined };
    }

    async function storePostIndices(posts: Post[]) {
      const groupIds = [
        ...(await (await getGroupRepository()).getGroupIdsByActor(actorId)),
        ...(await (await getNeighborsRepository()).getGroupIdsByActor(actorId)),
      ];
      const postIndexRepository = await getPostIndexRepository();
      
      for (const post of posts) {
        const postIndex: PostIndex = {
          postId: post.id,
          postedAt: post.createdAt,
          postedBy: actorId,
        }
        for (const groupId of groupIds) {
          await postIndexRepository.add(groupId, postIndex);
        }
      }
    }

    try {
      const firstFetchResult = await fetchPosts(1);
      if (firstFetchResult.posts.length === 0) {
        return {isSucceeded: true};
      }
      const posts = [...firstFetchResult.posts];
      let cursor: string|undefined = firstFetchResult.cursor;
      while(cursor !== undefined && posts.length < FeedFetchWorker.limitPerActor) {
        const fetchResult = await fetchPosts(FeedFetchWorker.limitPerFetch, cursor);
        posts.push(...fetchResult.posts);
        cursor = fetchResult.cursor;
      }
      await storePostIndices(posts);
      const mostRecentlyPostedAt = (posts.map((post) => post.createdAt).filter((x) => x !== undefined) as Date[])
        .reduce((a, b) => a.getTime() > b.getTime() ? a : b);
      return {isSucceeded: true, mostRecentlyPostedAt };
    } catch(e) {
      console.error('FeedFetchWorker error', e);
      return {isSucceeded: false};
    }
  }
}

class PostIndexFlushWorker {
  private static intervalMillis = 60000;

  private clearInterval: any|undefined;
  
  start(){
    this.clearInterval = setInterval(() => { this.execute(); }, PostIndexFlushWorker.intervalMillis);
  }

  stop() {
    if (this.clearInterval !== undefined) {
      clearInterval(this.clearInterval);
    }
  }

  private async execute(): Promise<void> {
    try {
      const postIndexRepository = await getPostIndexRepository();
      await postIndexRepository.flushAll();
    } catch(e) {
      console.error('PostIndexFlushWorker error', e);
    }
  }
}
