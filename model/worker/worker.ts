import { SerializableKeyMap, SerializableValueSet, equalsAsSet, getEpochSeconds } from '../lib/util';
import { ActorId, Group, Neighbor, Post, deserializeActorId } from '../data';
import { getGroupRepository, getFollowsRepository, getNeighborsRepository } from '../repositories';
import { PostIndex } from '../posts/data';
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
  GroupActors,
} from './data';
import {
  getNeighborCrawlResultRepository,
  getNeighborCrawlStatusRepository,
  getFeedFetchQueue,
  getFeedFetchResultRepository,
  getGroupActorMapping,
} from './repositories';
import { getPostIndexRepository, getNewPostIndicesRepository } from '../posts/repositories';

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
      const dataSet = group.memberIds.length === 0 ? undefined : {
        groupMemberIds: new SerializableValueSet(group.memberIds),
        closeNeighborIds: new SerializableValueSet<ActorId>(),
        errorActorIds: new SerializableValueSet<ActorId>(),
        followCounts: new SerializableKeyMap<ActorId, { countByMember: number, countByNeighbor: number }>(),
      };
      const newStatus = {
        groupId: group.id,
        startedAt: new Date(),
        fetchFinished: { activityPub: 0, atProto: 0 },
      };
      statusRepository.initializeCrawl(newStatus, dataSet);
      if (dataSet !== undefined) {
        for (const memberId of group.memberIds) {
          await checkFollowsAndEnqueueFetchParamsIfNecessary(memberId, true, dataSet, statusRepository.getFollowsFetchQueue());
        }
      }
      this.setCurrentNeighborCrawlStatus(newStatus);
      console.log('Start NeighborCrawlWorker for group ' + group.id.toString());
    }
  }

  private async isTimeToStartCrawl(group: Group): Promise<boolean> {
    const resultRepository = await getNeighborCrawlResultRepository();
    const lastResult = await resultRepository.get(group.id);
    return lastResult === undefined ||
      !equalsAsSet(lastResult.groupMemberIds.map((mid) => mid.toString()), group.memberIds.map((mid) => mid.toString())) ||
      (lastResult.isSucceeded && lastResult.finishedAt.getTime() < getEpochSeconds() - NeighborCrawlStartWorker.successIntervalHours * 3600) ||
      (!lastResult.isSucceeded && lastResult.finishedAt.getTime() < getEpochSeconds() - NeighborCrawlStartWorker.errorIntervalHours * 3600);
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
      const dataSet = statusRepository.getDataSet();
      if (dataSet !== undefined && !statusRepository.isFetchFinished()) {
        const ret = await this.fetchNext(status, dataSet, statusRepository.getFollowsFetchQueue());
        if (ret) {
          statusRepository.setFetchFinished();
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
        if (dataSet.errorActorIds.size > (dataSet.groupMemberIds.size + dataSet.closeNeighborIds.size) / 2) {
          await this.finalizeCrawlByError(status);
        }
      } else if (followsFetchResult.allFollowsAvailable) {
        const followedIds = followsFetchBuffer.get(followsFetchParams.actorId);
        if (followedIds !== undefined) {
          const followsRepository = await getFollowsRepository();
          await followsRepository.store(followsFetchParams.actorId, followedIds);
          addFollowCounts(dataSet.followCounts, dataSet.groupMemberIds.has(followsFetchParams.actorId), followedIds);
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
    return dataSet.groupMemberIds.size + dataSet.closeNeighborIds.size - dataSet.errorActorIds.size >= NeighborCrawlWorker.enoughActorsThreshold;
  }
    

  private async fetchFollows(
    params: NeighborCrawlFollowsFetchParams,
    dataSet: NeighborCrawlDataSet,
  ): Promise<FollowsFetchResult> {
    try {
      const client = getATProtoFollowsClient();
      const response = await client.fetch(params.actorId.value, params.cursor);
      if (response === undefined) {
        return { allFollowsAvailable: false, isError: true };
      }
      const followedIds = response.followedIds.map(deserializeActorId);
      const followsFetchBuffer = getNeighborCrawlStatusRepository().getFollowsFetchBuffer();
      followsFetchBuffer.add(params.actorId, followedIds);
      if (response.cursor === undefined) {
        return { allFollowsAvailable: true, isError: false };
      } else {
        return { nextParams: { ...params, cursor: response.cursor, errorCount: 0 }, allFollowsAvailable: false, isError: false };
      }
    } catch(e: any) {
      console.error('NeighborCrawlWorker.fetchFollows error', e);
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
      if (!dataSet.groupMemberIds.has(actorId) && !dataSet.closeNeighborIds.has(actorId) && !dataSet.errorActorIds.has(actorId)) {
        dataSet.closeNeighborIds.add(actorId);
        await checkFollowsAndEnqueueFetchParamsIfNecessary(actorId, dataSet.groupMemberIds.has(actorId), dataSet, followsFetchQueue);
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
    const dataSet = statusRepository.getDataSet();
    const neighbors = dataSet === undefined ? [] : this.selectNeighbors(dataSet, NeighborCrawlWorker.maxNeighbors);

    const neighborsRepository = await getNeighborsRepository();
    neighborsRepository.store({ groupId: status.groupId, neighbors });

    const resultRepository = await getNeighborCrawlResultRepository();
    const groupMemberIds = dataSet === undefined ? [] : Array.from(dataSet.groupMemberIds.values());
    resultRepository.store({
      groupId: status.groupId,
      isSucceeded: true,
      startedAt: status.startedAt,
      finishedAt: new Date(),
      groupMemberIds,
    });
    getNeighborCrawlStatusRepository().delete();
    this.setCurrentNeighborCrawlStatus(undefined);
    console.log('Finish neighbor crawl for group ' + status.groupId.toString());
  }

  private selectNeighbors(dataSet: NeighborCrawlDataSet, limit: number): Neighbor[] {
    const neighbors: Neighbor[] = Array.from(dataSet.followCounts.entries()).map((fc) => {
      const actorId: ActorId = fc[0];
      if (dataSet.groupMemberIds.has(actorId) || fc[1].countByMember + fc[1].countByNeighbor <= NeighborCrawlWorker.neighborFollowCountThreshold) {
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
    const dataSet = statusRepository.getDataSet();
    const resultRepository = await getNeighborCrawlResultRepository();
    const groupMemberIds: ActorId[] = dataSet === undefined ? [] : Array.from(dataSet.groupMemberIds.values());
    resultRepository.store({
      groupId: status.groupId,
      isSucceeded: false,
      startedAt: status.startedAt,
      finishedAt: new Date(),
      groupMemberIds,
    });
    getNeighborCrawlStatusRepository().delete();
    this.setCurrentNeighborCrawlStatus(undefined);
    console.log('Fail neighbor crawl for group ' + status.groupId.toString());
  }
}

const memberSuccessFeedFetchIntervalMillis = 10 * 60 * 1000;
const memberErrorFeedFetchIntervalMillis = 60 * 60 * 1000;
const neighborSuccessFeedFetchIntervalMillis = 60 * 60 * 1000;
const neighborErrorFeedFetchIntervalMillis = 6 * 60 * 60 * 1000;

class FeedFetchEnqueueWorker {
  private static intervalMillis = 60000;

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
    async function getGroupActors(group: Group): Promise<GroupActors> {
      const neighbors = await (await getNeighborsRepository()).get(group.id);
      const neighborIds: ActorId[] = neighbors?.neighbors?.map((n) => n.actorId) ?? [];
      return { groupId: group.id, memberIds: group.memberIds, neighborIds: neighborIds };
    }

    async function enqueueNewActors(actorIds: ActorId[], successIntervalMillis: number, errorIntervalMillis: number) {
      const feedFetchResultRepository = await getFeedFetchResultRepository();
      const feedFetchQueue = getFeedFetchQueue();
      for (const actorId of actorIds) {
        if (!feedFetchQueue.has(actorId)) {
          const previousResult = await feedFetchResultRepository.get(actorId);
          if (previousResult === undefined) {
            feedFetchQueue.enqueue(actorId, new Date());
          } else if (previousResult.isSucceeded) {
            feedFetchQueue.enqueue(actorId, new Date(previousResult.fetchedAt.getTime() + successIntervalMillis));
          } else {
            feedFetchQueue.enqueue(actorId, new Date(previousResult.fetchedAt.getTime() + errorIntervalMillis));
          }
        }
      }
    }

    try {
      const groupRepository = await getGroupRepository();
      const groupActorMapping = getGroupActorMapping();
      const groups = await groupRepository.getAll();
      const groupActorsArray: GroupActors[] = [];
      for (const group of groups) {
        groupActorsArray.push(await getGroupActors(group));
      }
      groupActorMapping.setGroupActors(groupActorsArray);
      enqueueNewActors(groupActorMapping.getAllMemberIds(), memberSuccessFeedFetchIntervalMillis, memberErrorFeedFetchIntervalMillis);
      //enqueueNewActors(groupActorMapping.getAllNeighborIds(), neighborSuccessFeedFetchIntervalMillis, neighborErrorFeedFetchIntervalMillis);
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
    const groupActorMapping = getGroupActorMapping();
    if (!groupActorMapping.includes(actorId)) {
      return;
    }
    const isMember = groupActorMapping.includesAsMember(actorId);

    async function fetchATProtoFeed(actorId: ActorId, previousResult?: FeedFetchResult): Promise<{isSucceeded: boolean, mostRecentlyPostedAt?:Date}> {
      const feedRepository = getATProtoFeedRepository();
  
      async function fetchPosts(limit: number, cursor?: string): Promise<{posts: Post[], cursor?: string}> {
        const result = await feedRepository.fetchAuthorFeed(actorId, limit, isMember, cursor);
        const newPosts = result.posts.filter((post) => {
          return post.createdAt !== undefined && (previousResult?.mostRecentlyPostedAt === undefined || previousResult.mostRecentlyPostedAt.getTime() < post.createdAt.getTime());
        });
        return { posts: newPosts, cursor: newPosts.length === limit ? result.cursor : undefined };
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
        await processPosts(posts);
        const mostRecentlyPostedAt = (posts.map((post) => post.createdAt).filter((x) => x !== undefined) as Date[])
          .reduce((a, b) => a.getTime() > b.getTime() ? a : b);
        return {isSucceeded: true, mostRecentlyPostedAt };
      } catch(e) {
        console.error('FeedFetchWorker error', e);
        return {isSucceeded: false};
      }
    }

    async function processPosts(posts: Post[]) {
      storePostIndex(posts);
      countReferences(posts);
    }

    async function storePostIndex(posts: Post[]) {
      const groupIds = groupActorMapping.getMemberGroupIds(actorId);
      const postIndexRepository = await getPostIndexRepository();
      const newPostIndicesRepository = getNewPostIndicesRepository();
      
      for (const post of posts) {
        const postIndex: PostIndex = {
          postId: post.id,
          postedAt: post.createdAt,
          postedBy: actorId,
        }
        for (const groupId of groupIds) {
          const added = await postIndexRepository.add(groupId, postIndex);
          if (added) {
            console.log('New post fetched: ' + JSON.stringify(post));
            newPostIndicesRepository.add(groupId, postIndex);
          }
        }
      }
    }

    async function countReferences(posts: Post[]) {
      // TODO: implementations
    }

    const feedFetchResultRepository = await getFeedFetchResultRepository();
    const feedFetchQueue = getFeedFetchQueue();
    const previousResult = await feedFetchResultRepository.get(actorId);

    let fetchResult = await fetchATProtoFeed(actorId, previousResult);
    feedFetchResultRepository.store(
      {
        actorId,
        fetchedAt: new Date(),
        isSucceeded: fetchResult.isSucceeded,
        mostRecentlyPostedAt: fetchResult.mostRecentlyPostedAt ?? previousResult?.mostRecentlyPostedAt,
      }
    );
    let intervalMillis: number;
    if (fetchResult.isSucceeded) {
      if (isMember) {
        intervalMillis = memberSuccessFeedFetchIntervalMillis;
      } else {
        intervalMillis = neighborSuccessFeedFetchIntervalMillis;
      }
    } else {
      if (isMember) {
        intervalMillis = memberErrorFeedFetchIntervalMillis;
      } else {
        intervalMillis = neighborErrorFeedFetchIntervalMillis;
      }
    }
    feedFetchQueue.enqueue(actorId, new Date(Date.now() + intervalMillis));
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
