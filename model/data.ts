import deepEqual from 'deep-equal';
import { Serializable } from './lib/util';

export const SNSTypes = {
  ActivityPub: "ActivityPub",
  ATProto: "ATProto",
} as const;

export type SNSType = typeof SNSTypes[keyof typeof SNSTypes];

export function parseSNSType(s: string): SNSType|undefined {
  switch (s) {
    case SNSTypes.ActivityPub:
    case SNSTypes.ATProto:
      return s;
    default:
      return undefined;
  }
}

export class ActorId implements Serializable {
  snsType: SNSType;
  value: string;

  constructor(snsType: SNSType, value: string) {
    this.snsType = snsType;
    this.value = value;
  }

  toString(): string {
    return `${this.snsType}:${this.value}`;
  }

  equals(other: ActorId): boolean {
    return deepEqual(this, other);
  }
}

export function parseActorId(s: string): ActorId|undefined {
  const colonIndex = s.indexOf(":");
  if (colonIndex === -1) {
    return undefined;
  }
  const snsType = parseSNSType(s.substring(0, colonIndex));
  if (!snsType) {
    return undefined;
  }
  return new ActorId(snsType, s.substring(colonIndex + 1));
}

export function actorIdToSerializableObject(id: ActorId): any {
  return {
    snsType: id.snsType,
    value: id.value,
  };
}

export function serializableObjectToActorId(obj: any): ActorId|undefined {
  if (obj && obj.snsType && obj.value) {
    const snsType = parseSNSType(obj.snsType);
    if (snsType) {
      return new ActorId(snsType, obj.value);
    }
  }
  return undefined;
}

export function serializeActorId(id: ActorId): string {
  return JSON.stringify(actorIdToSerializableObject(id));
}

export function deserializeActorId(s: string): ActorId|undefined {
  return serializableObjectToActorId(JSON.parse(s));
}

export interface Actor {
  id: ActorId;
  uri: string;
  name: string;
  handle: string;
  icon?: string;
}

function actorToSerializableObject(actor: Actor): any {
  return {
    id: actorIdToSerializableObject(actor.id),
    uri: actor.uri,
    name: actor.name,
    handle: actor.handle,
    icon: actor.icon,
  };
}

function serializableObjectToActor(obj: any): Actor|undefined {
  if (obj && obj.id && obj.uri && obj.name && obj.handle) {
    const id = serializableObjectToActorId(obj.id);
    if (id) {
      return {
        id,
        uri: obj.uri,
        name: obj.name,
        handle: obj.handle,
        icon: obj.icon,
      };
    }
  }
  return undefined;
}

export function serializeActor(actor: Actor): string {
  return JSON.stringify(actorToSerializableObject(actor));
}

export function deserializeActor(s: string): Actor|undefined {
  return serializableObjectToActor(JSON.parse(s));
}

export class PostId implements Serializable {
  snsType: SNSType;
  value: string;

  constructor(snsType: SNSType, value: string) {
    this.snsType = snsType;
    this.value = value;
  }

  toString(): string {
    return `${this.snsType}:${this.value}`;
  }

  equals(other: PostId): boolean {
    return deepEqual(this, other);
  }
}

export function postIdToSerializableObject(id: PostId): any {
  return {
    snsType: id.snsType,
    value: id.value,
  };
}

export function serializableObjectToPostId(obj: any): PostId|undefined {
  if (obj && obj.snsType && obj.value) {
    const snsType = parseSNSType(obj.snsType);
    if (snsType) {
      return new PostId(snsType, obj.value);
    }
  }
  return undefined;
}

export function serializePostId(id: PostId): string {
  return JSON.stringify(postIdToSerializableObject(id));
}

export function deserializePostId(s: string): PostId|undefined {
  return serializableObjectToPostId(JSON.parse(s));
}

export interface Post {
  id: PostId;
  authorId: ActorId;
  createdAt: Date;
  text: PostTextPart[];
  embeddedImages: EmbeddedImage[];
  embeddedPostId?: PostId;
  embeddedWebPage?: EmbeddedWebPage;
  reply?: Reply;
  url?: string;
}

export function serializePost(post: Post): string {
  return JSON.stringify(postToSerializableObject(post));
}

export function deserializePost(s: string): Post|undefined {
  return serializableObjectToPost(JSON.parse(s));
}

export function postToSerializableObject(post: Post): any {
  return {
    id: postIdToSerializableObject(post.id),
    authorId: actorIdToSerializableObject(post.authorId),
    createdAt: post.createdAt.toISOString(),
    text: post.text.map(postTextPartToSerializableObject),
    embeddedImages: post.embeddedImages.map(embeddedImageToSerializableObject),
    embeddedPostId: post.embeddedPostId ? postIdToSerializableObject(post.embeddedPostId) : undefined,
    embeddedWebPage: post.embeddedWebPage ? embeddedWebPageToSerializableObject(post.embeddedWebPage) : undefined,
    reply: post.reply ? replyToSerializableObject(post.reply) : undefined,
    url: post.url,
  };
}

export function serializableObjectToPost(obj: any): Post|undefined {
  if (obj && obj.id && obj.authorId && obj.createdAt && obj.text && obj.embeddedImages) {
    const id = serializableObjectToPostId(obj.id);
    const authorId = serializableObjectToActorId(obj.authorId);
    if (id && authorId) {
      const createdAt = new Date(obj.createdAt);
      const text = obj.text.map(serializableObjectToPostTextPart).filter((part: any) => part !== undefined) as PostTextPart[];
      const embeddedImages = obj.embeddedImages.map(serializableObjectToEmbeddedImage).filter((image: any) => image !== undefined) as EmbeddedImage[];
      const embeddedPostId = obj.embeddedPostId ? serializableObjectToPostId(obj.embeddedPostId) : undefined;
      const embeddedWebPage = obj.embeddedWebPage ? serializableObjectToEmbeddedWebPage(obj.embeddedWebPage) : undefined;
      const reply = obj.reply ? serializableObjectToReply(obj.reply) : undefined;
      return {
        id,
        authorId,
        createdAt,
        text,
        embeddedImages,
        embeddedPostId,
        embeddedWebPage,
        reply,
        url :obj.url,
      };
    }
  }
  return undefined;
}

export function getPostUrl(post: Post, actor?: Actor): string|undefined {
  if (post.id.snsType === SNSTypes.ATProto) {
    if (actor === undefined) {
      return undefined;
    }
    const idLastSlashIndex = post.id.value.lastIndexOf("/");
    if (idLastSlashIndex === -1) {
      return undefined;
    }
    return 'https://bsky.app/profile/' + actor.handle + '/post/' + post.id.value.slice(idLastSlashIndex+1);
  } else {
    return post.url;
  }
}

export interface Reply {
  rootPostId: PostId;
  parentPostId: PostId;
}

export function replyToSerializableObject(reply: Reply): any {
  return {
    rootPostId: postIdToSerializableObject(reply.rootPostId),
    parentPostId: postIdToSerializableObject(reply.parentPostId),
  };
}

export function serializableObjectToReply(obj: any): Reply|undefined {
  if (obj && obj.rootPostId && obj.parentPostId) {
    const rootPostId = serializableObjectToPostId(obj.rootPostId);
    const parentPostId = serializableObjectToPostId(obj.parentPostId);
    if (rootPostId && parentPostId) {
      return {
        rootPostId,
        parentPostId,
      };
    }
  }
  return undefined;
}

export interface PostTextPart {
  text: string;
  isHashtag: boolean;
  linkUrl?: string;
  mentionedActorId?: ActorId;
}

export function postTextPartToSerializableObject(part: PostTextPart): any {
  return {
    text: part.text,
    isHashtag: part.isHashtag,
    linkUrl: part.linkUrl,
    mentionedActorId: part.mentionedActorId ? actorIdToSerializableObject(part.mentionedActorId) : undefined,
  };
}

export function serializableObjectToPostTextPart(obj: any): PostTextPart|undefined {
  if (obj && obj.text && obj.isHashtag) {
    const mentionedActorId = obj.mentionedActorId ? serializableObjectToActorId(obj.mentionedActorId) : undefined;
    return {
      text: obj.text,
      isHashtag: obj.isHashtag,
      linkUrl: obj.linkUrl,
      mentionedActorId,
    };
  }
  return undefined;
}

export interface EmbeddedImage {
  url: string;
  width: number;
  height: number;
}

export function embeddedImageToSerializableObject(image: EmbeddedImage): any {
  return {
    url: image.url,
    width: image.width,
    height: image.height,
  };
}

export function serializableObjectToEmbeddedImage(obj: any): EmbeddedImage|undefined {
  if (obj && obj.url && obj.width && obj.height) {
    return {
      url: obj.url,
      width: obj.width,
      height: obj.height,
    };
  }
  return undefined;
}

export interface EmbeddedWebPage {
  url: string;
  title: string;
  description: string;
  thumbnailImageUrl?: string;
}

export function embeddedWebPageToSerializableObject(webPage: EmbeddedWebPage): any {
  return {
    url: webPage.url,
    title: webPage.title,
    description: webPage.description,
    thumbnailImageUrl: webPage.thumbnailImageUrl,
  };
}

export function serializableObjectToEmbeddedWebPage(obj: any): EmbeddedWebPage|undefined {
  if (obj && obj.url && obj.title && obj.description) {
    return {
      url: obj.url,
      title: obj.title,
      description: obj.description,
      thumbnailImageUrl: obj.thumbnailImageUrl,
    };
  }
  return undefined;
}

export interface Repost {
  repostedPostId: PostId;
  createdBy: ActorId;
  createdAt: Date;
}

export class GroupId implements Serializable {
  value: number;

  constructor(value: number) {
    this.value = value;
  }

  toString(): string {
    return this.value.toString();
  }

  equals(other: GroupId): boolean {
    return deepEqual(this, other);
  }
}

function groupIdToSerializableObject(id: GroupId): any {
  return {
    value: id.value,
  };
}

function serializableObjectToGroupId(obj: any): GroupId|undefined {
  if (obj && obj.value) {
    return new GroupId(obj.value);
  }
  return undefined;
}

export function serializeGroupId(id: GroupId): string {
  return JSON.stringify(groupIdToSerializableObject(id));
}

export function deserializeGroupId(s: string): GroupId|undefined {
  return serializableObjectToGroupId(JSON.parse(s));
}

export interface Group {
  id: GroupId;
  name: string;
  memberIds: ActorId[];
}

function groupToSerializableObject(group: Group): any {
  return {
    id: groupIdToSerializableObject(group.id),
    name: group.name,
    memberIds: group.memberIds.map(actorIdToSerializableObject),
  };
}

function serializableObjectToGroup(obj: any): Group|undefined {
  if (obj && obj.id && obj.name && obj.memberIds) {
    const id = serializableObjectToGroupId(obj.id);
    if (id) {
      const memberIds = obj.memberIds.map(serializableObjectToActorId).filter((id: any) => id !== undefined) as ActorId[];
      return {
        id,
        name: obj.name,
        memberIds,
      };
    }
  }
  return undefined;
}

export function serializeGroup(group: Group): string {
  return JSON.stringify(groupToSerializableObject(group));
}

export function deserializeGroup(s: string): Group|undefined {
  return serializableObjectToGroup(JSON.parse(s));
}

export interface Neighbors {
  groupId: GroupId;
  activityPubNeighbors: Neighbor[];
  atProtoNeighbors: Neighbor[];
}

export interface Neighbor {
  actorId: ActorId;
  score: number;
}

function neighborsToSerializableObject(neighbors: Neighbors): any {
  return {
    groupId: groupIdToSerializableObject(neighbors.groupId),
    activityPubNeighbors: neighbors.activityPubNeighbors.map(neighborToSerializableObject),
    atProtoNeighbors: neighbors.atProtoNeighbors.map(neighborToSerializableObject),
  };
}

function neighborToSerializableObject(neighbor: Neighbor): any {
  return {
    actorId: actorIdToSerializableObject(neighbor.actorId),
    score: neighbor.score,
  };
}

function serializableObjectToNeighbors(obj: any): Neighbors|undefined {
  if (obj && obj.groupId) {
    const groupId = serializableObjectToGroupId(obj.groupId);
    if (!groupId) {
      return undefined;
    }
    const activityPubNeighbors = obj.activityPubNeighbors ?
      obj.activityPubNeighbors.map(serializableObjectToNeighbor).filter((neighbor: any) => neighbor !== undefined) as Neighbor[] : [];
    const atProtoNeighbors = obj.atProtoNeighbors ?
      obj.atProtoNeighbors.map(serializableObjectToNeighbor).filter((neighbor: any) => neighbor !== undefined) as Neighbor[] : [];
    return {
      groupId,
      activityPubNeighbors,
      atProtoNeighbors,
    };
  }
  return undefined;
}

function serializableObjectToNeighbor(obj: any): Neighbor|undefined {
  if (obj && obj.actorId && obj.score) {
    const actorId = serializableObjectToActorId(obj.actorId);
    if (actorId) {
      return {
        actorId,
        score: obj.score,
      };
    }
  }
  return undefined;
}

export function serializeNeighbors(neighbors: Neighbors): string {
  return JSON.stringify(neighborsToSerializableObject(neighbors));
}

export function deserializeNeighbors(s: string): Neighbors|undefined {
  return serializableObjectToNeighbors(JSON.parse(s));
}
