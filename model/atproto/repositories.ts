import { BskyAgent, AppBskyActorDefs, AppBskyFeedDefs, stringifyLex, jsonToLex } from '@atproto/api';
import { Cache, CachedStorage, EphemeralDataStorage, StorageManager, getStorageManager } from '../lib/storage';
import { serializeProfile, deserializeProfile } from './data';

interface Singletons {
  bskyAgent?: BskyAgent;
  actorRepository?: ActorRepository;
  followsClient?: FollowsClient;
  feedClient?: FeedClient;
}

const singletons = {} as Singletons;

function getBskyAgent(): BskyAgent {
  if (!singletons.bskyAgent) {
    doPolyfill();
    singletons.bskyAgent = new BskyAgent({ service: 'https://api.bsky.app' });
  }
  return singletons.bskyAgent;
}

export async function getActorRepository(): Promise<ActorRepository> {
  if (!singletons.actorRepository) {
    const storageManager = await getStorageManager();
    singletons.actorRepository = new ActorRepository(storageManager);
  }
  return singletons.actorRepository;
}

export function getFollowsClient(): FollowsClient {
  if (!singletons.followsClient) {
    singletons.followsClient = new FollowsClient();
  }
  return singletons.followsClient;
}

export function getFeedClient(): FeedClient {
  if (!singletons.feedClient) {
    singletons.feedClient = new FeedClient();
  }
  return singletons.feedClient;
}

export class ActorRepository {
  private static storageKeyPrefix = 'activity-pub.ActorRepository.storage';
  private static storageTTL = 60 * 60 * 24 * 2;
  private static cacheTTL = 60 * 60 * 24;
  private static cacheMaxKeys = 100000;

  private storage: CachedStorage<AppBskyActorDefs.ProfileViewDetailed>;

  constructor(storageManager: StorageManager) {
    this.storage = new CachedStorage(
      new EphemeralDataStorage(
        ActorRepository.storageKeyPrefix,
        ActorRepository.storageTTL,
        storageManager,
        serializeProfile,
        deserializeProfile,
      ),
      new Cache(
        ActorRepository.cacheTTL,
        ActorRepository.cacheMaxKeys,
        serializeProfile,
        deserializeProfile,
      )
    );
  }

  async fetch(id: string): Promise<AppBskyActorDefs.ProfileViewDetailed|undefined> {
    try {
      const agent = getBskyAgent();
      const response = await agent.getProfile({actor: id});
      if (response.success) {
        this.storage.store(id, response.data);
        return response.data;
      } else {
        throw new Error('BlueSky getProfile error: unknown');
      }
    } catch(e: any) {
      if (e.status === 400 && e.message === 'Profile not found') {
        this.storage.store(id, undefined);
        return undefined;
      } else {
        throw e;
      }
    }
  }

  async get(id: string): Promise<AppBskyActorDefs.ProfileViewDetailed|undefined> {
    const cached = await this.storage.get(id);
    if (cached !== undefined) {
      return cached.value;
    }
    return await this.fetch(id);
  }
}

interface FollowsResponse {
  followedIds: string[];
  cursor?: string;
}

export class FollowsClient {
  async fetch(id: string, cursor?: string): Promise<FollowsResponse> {
    const agent = getBskyAgent();
    const response = await agent.getFollows({actor: id, cursor: cursor});
    if (response.success) {
      return {followedIds: response.data.follows.map((p) => p.did), cursor: response.data.cursor};
    } else {
      throw new Error('BlueSky getFollows error: unknown');
    }
  }
}

export class FeedClient {
  async fetchAuthorFeed(actorId: string, limit: number, cursor?: string): Promise<{posts: AppBskyFeedDefs.FeedViewPost[], cursor?: string}> {
    const agent = getBskyAgent();
    const response = await agent.getAuthorFeed({actor: actorId, limit, cursor});
    if (response.success) {
      return {posts: response.data.feed, cursor: response.data.cursor};
    } else {
      throw new Error('BlueSky getAuthorFeed error: unknown');
    }
  }
}

const GET_TIMEOUT = 15e3 // 15s
const POST_TIMEOUT = 60e3 // 60s

export function doPolyfill() {
  BskyAgent.configure({ fetch: fetchHandler })
}

interface FetchHandlerResponse {
  status: number
  headers: Record<string, string>
  body: ArrayBuffer | undefined
}

async function fetchHandler(
  reqUri: string,
  reqMethod: string,
  reqHeaders: Record<string, string>,
  reqBody: any,
): Promise<FetchHandlerResponse> {
  const reqMimeType = reqHeaders['Content-Type'] || reqHeaders['content-type'];
  if (reqMimeType && reqMimeType.startsWith('application/json')) {
    reqBody = stringifyLex(reqBody);
  } else if (
    typeof reqBody === 'string' &&
      (reqBody.startsWith('/') || reqBody.startsWith('file:'))
  ) {
    // NOTE
    // React native treats bodies with {uri: string} as file uploads to pull from cache
    // -prf
    reqBody = { uri: reqBody };
  }

  const controller = new AbortController();
  const to = setTimeout(
    () => controller.abort(),
    reqMethod === 'post' ? POST_TIMEOUT : GET_TIMEOUT,
  );

  const res = await fetch(reqUri, {
    method: reqMethod,
    headers: reqHeaders,
    body: reqBody,
    signal: controller.signal,
  });

  const resStatus = res.status;
  const resHeaders: Record<string, string> = {};
  res.headers.forEach((value: string, key: string) => {
    resHeaders[key] = value
  });
  const resMimeType = resHeaders['Content-Type'] || resHeaders['content-type'];
  let resBody: ArrayBuffer|undefined;
  if (resMimeType) {
    if (resMimeType.startsWith('application/json')) {
      resBody = jsonToLex(await res.json()) as ArrayBuffer;
    } else if (resMimeType.startsWith('text/')) {
      resBody = await res.text() as any;
    } else {
      resBody = await res.blob() as any;
    }
  }

  clearTimeout(to);

  return {
    status: resStatus,
    headers: resHeaders,
    body: resBody,
  };
}
