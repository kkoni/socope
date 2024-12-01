import { BskyAgent, AppBskyActorDefs, AppBskyFeedDefs, stringifyLex, jsonToLex } from '@atproto/api';
import { Cache, CachedStorage, EphemeralDataStorage, StorageManager, getStorageManager } from '../lib/storage';
import { ActorId, PostId, Post, Repost, serializePost, deserializePost } from '../data';
import { SerializableKeyMap } from '../lib/util';
import { serializeProfile, deserializeProfile, createPostFromPostView, createPostOrRepostFromFeedViewPost } from './data';

interface Singletons {
  bskyAgent?: BskyAgent;
  actorRepository?: ActorRepository;
  followsClient?: FollowsClient;
  feedClient?: FeedClient;
  postRepository?: PostRepository;
  feedRepository?: FeedRepository;
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

export function getPostRepository(): PostRepository {
  if (!singletons.postRepository) {
    singletons.postRepository = new PostRepository();
  }
  return singletons.postRepository;
}

export function getFeedRepository(): FeedRepository {
  if (!singletons.feedRepository) {
    singletons.feedRepository = new FeedRepository(getPostRepository());
  }
  return singletons.feedRepository;
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

  async fetchActors(ids: string[]): Promise<Map<string, AppBskyActorDefs.ProfileViewDetailed>> {
    const agent = getBskyAgent();
    const response = await agent.getProfiles({actors: ids});
    if (!response.success) {
      throw new Error('BlueSky getProfiles error: unknown');
    }
    const result = new Map<string, AppBskyActorDefs.ProfileViewDetailed>();
    for (const profile of response.data.profiles) {
      result.set(profile.did, profile);
      this.storage.store(profile.did, profile);
    }
    for (const id of ids) {
      if (!result.has(id)) {
        this.storage.store(id, undefined);
      }
    }
    return result;
  }

  async get(id: string): Promise<AppBskyActorDefs.ProfileViewDetailed|undefined> {
    const cached = await this.storage.get(id);
    if (cached !== undefined) {
      return cached.value;
    }
    return await this.fetch(id);
  }

  async getActors(ids: string[]): Promise<Map<string, AppBskyActorDefs.ProfileViewDetailed>> {
    const result = new Map<string, AppBskyActorDefs.ProfileViewDetailed>();
    const idsToFetch: string[] = [];
    for (const id of ids) {
      const cached = await this.storage.get(id);
      if (cached !== undefined) {
        if (cached.value !== undefined) {
          result.set(id, cached.value);
        }
      } else {
        idsToFetch.push(id);
      }
    }
    if (idsToFetch.length > 0) {
      const fetched = await this.fetchActors(idsToFetch);
      for (const [id, profile] of fetched) {
        result.set(id, profile);
      }
    }
    return result;
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

export class PostClient {
  async fetchPosts(uris: string[]): Promise<AppBskyFeedDefs.PostView[]> {
    const agent = getBskyAgent();
    const response = await agent.getPosts({uris});
    if (response.success) {
      return response.data.posts;
    } else {
      throw new Error('BlueSky getPosts error: unknown');
    }
  }
}

export class PostRepository {
  private static cacheTTL = 60 * 60 * 24;
  private static cacheMaxKeys = 100000;
  private static fetchPostLimit = 25;

  private cache = new Cache<Post>(
    PostRepository.cacheTTL,
    PostRepository.cacheMaxKeys,
    serializePost,
    deserializePost,
  );

  private client = new PostClient();

  async get(postIds: PostId[]): Promise<SerializableKeyMap<PostId, Post>> {
    const result = new SerializableKeyMap<PostId, Post>();
    const postIdsToFetch: PostId[] = [];
    for (const postId of postIds) {
      const cached = await this.cache.get(postId.value)
      if (cached !== undefined) {
        if (cached.value !== undefined) {
          result.set(postId, cached.value);
        }
      } else {
        postIdsToFetch.push(postId);
      }
    }
    for (let i=0; i<postIdsToFetch.length; i+=PostRepository.fetchPostLimit) {
      const fetchedPostViews = await this.client.fetchPosts(postIdsToFetch.slice(i, i+PostRepository.fetchPostLimit).map((postId) => postId.value));
      for (const postView of fetchedPostViews) {
        const post = createPostFromPostView(postView);
        if (post !== undefined) {
          await this.cache.store(post.id.value, post);
          result.set(post.id, post);
        }
      }
    }
    return result;
  }

  async storeToCache(post: Post): Promise<void> {
    await this.cache.store(post.id.value, post);
  }
}

export class FeedRepository {
  private client = new FeedClient();
  private postRepository: PostRepository;

  constructor(postRepository: PostRepository) {
    this.postRepository = postRepository;
  }

  async fetchAuthorFeed(actorId: ActorId, limit: number, caching: boolean, cursor?: string): Promise<{posts: Post[], reposts: Repost[], cursor?: string}> {
    const fetchedFeed = await this.client.fetchAuthorFeed(actorId.value, limit, cursor);
    const posts: Post[] = [];
    const reposts: Repost[] = [];
    for (const feedViewPost of fetchedFeed.posts) {
      const postOrRepost = createPostOrRepostFromFeedViewPost(feedViewPost);
      if (postOrRepost.post !== undefined) {
        posts.push(postOrRepost.post);
        if (caching) {
          this.postRepository.storeToCache(postOrRepost.post);
        }
      } else if (postOrRepost.repost !== undefined) {
        reposts.push(postOrRepost.repost);
      }
    }
    return {posts, reposts, cursor: fetchedFeed.cursor};
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
