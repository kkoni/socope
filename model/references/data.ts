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

export const referenceScoreMemberFactor = 5;

export function createEmptyReferenceIndex(postId: PostId): ReferenceIndex {
  return {
    postId: postId,
    countsByMembers: {
      quote: 0,
      reply: 0,
      repost: 0,
      like: 0,
    },
    countsByNeighbors: {
      quote: 0,
      reply: 0,
      repost: 0,
      like: 0,
    },
    repostingActors: [],
    referringPosts: {
      quotes: [],
      replies: [],
    },
  };
}

export function addReferenceIndex(target: ReferenceIndex, added: ReferenceIndex) {
  target.countsByMembers.quote += added.countsByMembers.quote;
  target.countsByMembers.reply += added.countsByMembers.reply;
  target.countsByMembers.repost += added.countsByMembers.repost;
  target.countsByMembers.like += added.countsByMembers.like;
  target.countsByNeighbors.quote += added.countsByNeighbors.quote;
  target.countsByNeighbors.reply += added.countsByNeighbors.reply;
  target.countsByNeighbors.repost += added.countsByNeighbors.repost;
  target.countsByNeighbors.like += added.countsByNeighbors.like;
  target.repostingActors.push(...added.repostingActors);
  target.referringPosts.quotes.push(...added.referringPosts.quotes);
  target.referringPosts.replies.push(...added.referringPosts.replies);
}

export function getReferenceScore(index: ReferenceIndex): number {
  return (
    index.countsByMembers.quote +
    index.countsByMembers.reply +
    index.countsByMembers.repost +
    index.countsByMembers.like * 0.5
  ) * referenceScoreMemberFactor + (
    index.countsByNeighbors.quote +
    index.countsByNeighbors.reply +
    index.countsByNeighbors.repost +
    index.countsByNeighbors.like * 0.5
  );
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
  if (obj && obj.q !== undefined && obj.r !== undefined && obj.rp !== undefined && obj.l != undefined) {
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
