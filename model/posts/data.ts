import { ActorId, PostId, SNSType, SNSTypes } from '../data';

export interface PostIndex {
  postId: PostId;
  postedAt: Date;
  postedBy: ActorId;
  repostedPostId?: PostId;
}

export function serializePostIndices(indices: PostIndex[]): string {
  return JSON.stringify(indices.map(postIndexToSerializableObject));
}

export function deserializePostIndices(s: string): PostIndex[] {
  return JSON.parse(s).map(serializableObjectToPostIndex).filter((x: PostIndex|undefined): x is PostIndex => x !== undefined);
}

function postIndexToSerializableObject(index: PostIndex): any {
  return {
    st: abbreviateSNSType(index.postId.snsType),
    pid: index.postId.value,
    pat: index.postedAt.getTime(),
    pby: index.postedBy.value,
    rpid: index.repostedPostId?.value,
  }
}

function serializableObjectToPostIndex(obj: any): PostIndex|undefined {
  if (obj && obj.st && obj.pid && obj.pat && obj.pby) {
    const snsType = extendAbbreviatedSNSType(obj.st);
    if (snsType) {
      return {
        postId: new PostId(snsType, obj.pid),
        postedAt: new Date(obj.pat),
        postedBy: new ActorId(snsType, obj.pby),
        repostedPostId: obj.rpid ? new PostId(snsType, obj.rpid) : undefined,
      };
    }
  }
  return undefined;
}

function abbreviateSNSType(snsType: SNSType): string {
  switch (snsType) {
    case SNSTypes.ActivityPub: return 'ap';
    case SNSTypes.ATProto: return 'at';
  }
  return 'unknown';
}

function extendAbbreviatedSNSType(abbreviated: string): SNSType|undefined {
  switch (abbreviated) {
    case 'ap': return SNSTypes.ActivityPub;
    case 'at': return SNSTypes.ATProto;
  }
  return undefined;
}
