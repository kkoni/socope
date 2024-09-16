import { ActorId, PostId } from '../data';

export interface PostIndex {
  postId: PostId;
  postedAt: Date;
  postedBy: ActorId;
}

export function serializePostIndices(indices: PostIndex[]): string {
  return JSON.stringify(indices.map(postIndexToSerializableObject));
}

export function deserializePostIndices(s: string): PostIndex[] {
  return JSON.parse(s).map(serializableObjectToPostIndex).filter((x: PostIndex|undefined): x is PostIndex => x !== undefined);
}

function postIndexToSerializableObject(index: PostIndex): any {
  return {
    pid: index.postId.value,
    pat: index.postedAt.getTime(),
    pby: index.postedBy.value,
  }
}

function serializableObjectToPostIndex(obj: any): PostIndex|undefined {
  if (obj && obj.pid && obj.pat && obj.pby) {
    return {
      postId: new PostId(obj.pid),
      postedAt: new Date(obj.pat),
      postedBy: new ActorId(obj.pby),
    };
  }
  return undefined;
}
