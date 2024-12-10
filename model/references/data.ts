import { ActorId, PostId } from '../data';

export interface ReferenceIndex {
  postId: PostId;
  countsByMembers: Counts;
  countsByNeighbors: Counts;
  repostingActors: ActorId[];
  referringPosts: ReferringPosts;
}

export interface Counts {
  quote: number;
  reply: number;
  repost: number;
  like: number;
}

export interface ReferringPosts {
  quotes: PostId[];
  replies: PostId[];
}

export function serializeReferenceIndices(indices: ReferenceIndex[]): string {
  return JSON.stringify(indices.map(referenceIndexToSerializableObject));
}

export function deserializeReferenceIndices(s: string): ReferenceIndex[] {
  return JSON.parse(s).map(serializableObjectToReferenceIndex).filter((x: ReferenceIndex|undefined): x is ReferenceIndex => x !== undefined);
}

function referenceIndexToSerializableObject(index: ReferenceIndex): any {
  return {
    pid: index.postId.value,
    cbm: countsToSerializableObject(index.countsByMembers),
    cbn: countsToSerializableObject(index.countsByNeighbors),
    ras: index.repostingActors.map((actorId) => actorId.value),
    rp: referringPostsToSerializableObject(index.referringPosts),
  };
}

function countsToSerializableObject(counts: Counts): any {
  return {
    q: counts.quote,
    r: counts.reply,
    rp: counts.repost,
    l: counts.like,
  };
}

function referringPostsToSerializableObject(referringPosts: ReferringPosts): any {
  return {
    q: referringPosts.quotes.map((postId) => postId.value),
    r: referringPosts.replies.map((postId) => postId.value),
  };
}

function serializableObjectToReferenceIndex(obj: any): ReferenceIndex|undefined {
  if (obj && obj.pid && obj.cbm && obj.cbn && obj.ras && obj.rp && Array.isArray(obj.ras)) {
    const countsByMembers = serializableObjectToCounts(obj.cbm);
    const countsByNeighbors = serializableObjectToCounts(obj.cbn);
    const repostingActors = obj.ras.map((value: string) => new ActorId(value));
    const referringPosts = serializableObjectToReferringPosts(obj.rp);
    if (!countsByMembers || !countsByNeighbors || !referringPosts) {
      return undefined;
    }
    return {
      postId: new PostId(obj.pid),
      countsByMembers: countsByMembers,
      countsByNeighbors: countsByNeighbors,
      repostingActors: repostingActors,
      referringPosts: referringPosts,
    };
  }
  return undefined;
}

function serializableObjectToCounts(obj: any): Counts|undefined {
  if (obj && obj.q && obj.r && obj.rp && obj.l) {
    return {
      quote: obj.q,
      reply: obj.r,
      repost: obj.rp,
      like: obj.l,
    };
  }
  return undefined;
}

function serializableObjectToReferringPosts(obj: any): ReferringPosts|undefined {
  if (obj && obj.q && obj.r) {
    return {
      quotes: obj.q.map((value: string) => new PostId(value)),
      replies: obj.r.map((value: string) => new PostId(value)),
    };
  }
  return undefined;
}
