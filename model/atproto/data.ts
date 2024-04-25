import { AppBskyActorDefs, AppBskyFeedDefs } from '@atproto/api';
import {
  ActorId,
  Post as IPost,
  PostId,
  Reply,
  Repost,
  SNSTypes
} from '../data';

function profileToSerializableObject(profile: AppBskyActorDefs.ProfileViewDetailed): any {
  return {
    did: profile.did,
    handle: profile.handle,
    displayName: profile.displayName,
    description: profile.description,
    avatar: profile.avatar,
    banner: profile.banner,
    followersCount: profile.followersCount,
    followsCount: profile.followsCount,
    postsCount: profile.postsCount,
    indexedAt: profile.indexedAt,
  };
}

function serializableObjectToProfile(serializable: any): AppBskyActorDefs.ProfileViewDetailed {
  return {
    did: serializable.did,
    handle: serializable.handle,
    displayName: serializable.displayName,
    description: serializable.description,
    avatar: serializable.avatar,
    banner: serializable.banner,
    followersCount: serializable.followersCount,
    followsCount: serializable.followsCount,
    postsCount: serializable.postsCount,
    indexedAt: serializable.indexedAt,
  };
}

export function serializeProfile(profile: AppBskyActorDefs.ProfileViewDetailed): string {
  return JSON.stringify(profileToSerializableObject(profile));
}

export function deserializeProfile(s: string): AppBskyActorDefs.ProfileViewDetailed {
  return serializableObjectToProfile(JSON.parse(s));
}

export class ATProtoPost implements IPost {
  id: PostId;
  rawData: AppBskyFeedDefs.FeedViewPost;
  authorId: ActorId;
  createdAt?: Date;
  embeddedPostId?: PostId;
  reply?: Reply;
  repost?: Repost;

  constructor(rawData: AppBskyFeedDefs.FeedViewPost) {
    this.id = new PostId(SNSTypes.ATProto, rawData.post.uri);
    this.rawData = rawData;
    this.authorId = new ActorId(SNSTypes.ATProto, rawData.post.author.did);
    const parsedIndexedAt = Date.parse(rawData.post.indexedAt);
    this.createdAt = isNaN(parsedIndexedAt) ? undefined : new Date(parsedIndexedAt);
    if (rawData.post.embed && rawData.post.embed.record && (rawData.post.embed.record as any).uri) {
      this.embeddedPostId = new PostId(SNSTypes.ATProto, (rawData.post.embed.record as any).uri);
    }
    this.reply = this.createReply(rawData.reply);
    this.repost = this.createRepost(rawData.reason as AppBskyFeedDefs.ReasonRepost);
  }

  private createReply(reply: AppBskyFeedDefs.ReplyRef|undefined): Reply|undefined {
    if (!reply || !reply.root || !reply.root.uri || !reply.parent || !reply.parent.uri) {
      return undefined;
    }
    return {
      rootPostId: new PostId(SNSTypes.ATProto, reply.root.uri as string),
      parentPostId: new PostId(SNSTypes.ATProto, reply.parent.uri as string),
    };
  }

  private createRepost(reason: AppBskyFeedDefs.ReasonRepost|undefined): Repost|undefined {
    if (!reason || !reason.by || !reason.by.did || !reason.indexedAt) {
      return undefined;
    }
    const parsedIndexedAt = Date.parse(reason.indexedAt);
    if (isNaN(parsedIndexedAt)) {
      return undefined;
    }
    return {
      by: new ActorId(SNSTypes.ATProto, reason.by.did),
      indexedAt: new Date(parsedIndexedAt),
    };
  }
}
