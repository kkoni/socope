import deepEqual from 'deep-equal';
import { Serializable } from './lib/util';

export class ActorId implements Serializable {
  value: string;

  constructor(value: string) {
    this.value = value;
  }

  toString(): string {
    return this.value;
  }

  equals(other: ActorId): boolean {
    return deepEqual(this, other);
  }
}

export function serializeActorId(id: ActorId): string {
  return id.value;
}

export function deserializeActorId(s: string): ActorId {
  return new ActorId(s);
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
    id: serializeActorId(actor.id),
    uri: actor.uri,
    name: actor.name,
    handle: actor.handle,
    icon: actor.icon,
  };
}

function serializableObjectToActor(obj: any): Actor|undefined {
  if (obj && obj.id && obj.uri && obj.name && obj.handle) {
    const id = deserializeActorId(obj.id);
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
  value: string;

  constructor(value: string) {
    this.value = value;
  }

  toString(): string {
    return this.value;
  }

  equals(other: PostId): boolean {
    return deepEqual(this, other);
  }
}

export function serializePostId(id: PostId): string {
  return id.value;
}

export function deserializePostId(s: string): PostId {
  return new PostId(s);
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
    id: serializePostId(post.id),
    authorId: serializeActorId(post.authorId),
    createdAt: post.createdAt.toISOString(),
    text: post.text.map(postTextPartToSerializableObject),
    embeddedImages: post.embeddedImages.map(embeddedImageToSerializableObject),
    embeddedPostId: post.embeddedPostId ? serializePostId(post.embeddedPostId) : undefined,
    embeddedWebPage: post.embeddedWebPage ? embeddedWebPageToSerializableObject(post.embeddedWebPage) : undefined,
    reply: post.reply ? replyToSerializableObject(post.reply) : undefined,
    url: post.url,
  };
}

export function serializableObjectToPost(obj: any): Post|undefined {
  if (obj && obj.id && obj.authorId && obj.createdAt && obj.text && obj.embeddedImages) {
    const id = deserializePostId(obj.id);
    const authorId = deserializeActorId(obj.authorId);
    if (id && authorId) {
      const createdAt = new Date(obj.createdAt);
      const text = obj.text.map(serializableObjectToPostTextPart).filter((part: any) => part !== undefined) as PostTextPart[];
      const embeddedImages = obj.embeddedImages.map(serializableObjectToEmbeddedImage).filter((image: any) => image !== undefined) as EmbeddedImage[];
      const embeddedPostId = obj.embeddedPostId ? deserializePostId(obj.embeddedPostId) : undefined;
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

export function getPostUrl(post: Post, actor: Actor): string|undefined {
  if (actor === undefined) {
    return undefined;
  }
  const idLastSlashIndex = post.id.value.lastIndexOf("/");
  if (idLastSlashIndex === -1) {
    return undefined;
  }
  return 'https://bsky.app/profile/' + actor.handle + '/post/' + post.id.value.slice(idLastSlashIndex+1);
}

export interface Reply {
  rootPostId: PostId;
  parentPostId: PostId;
}

export function replyToSerializableObject(reply: Reply): any {
  return {
    rootPostId: serializePostId(reply.rootPostId),
    parentPostId: serializePostId(reply.parentPostId),
  };
}

export function serializableObjectToReply(obj: any): Reply|undefined {
  if (obj && obj.rootPostId && obj.parentPostId) {
    const rootPostId = deserializePostId(obj.rootPostId);
    const parentPostId = deserializePostId(obj.parentPostId);
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
    mentionedActorId: part.mentionedActorId ? serializeActorId(part.mentionedActorId) : undefined,
  };
}

export function serializableObjectToPostTextPart(obj: any): PostTextPart|undefined {
  if (obj && obj.text !== undefined && obj.isHashtag !== undefined) {
    const mentionedActorId = obj.mentionedActorId ? deserializeActorId(obj.mentionedActorId) : undefined;
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
  if (obj && obj.url !== undefined && obj.width !== undefined && obj.height !== undefined) {
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
  if (obj && obj.url !== undefined && obj.title !== undefined && obj.description !== undefined) {
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
    memberIds: group.memberIds.map(serializeActorId),
  };
}

function serializableObjectToGroup(obj: any): Group|undefined {
  if (obj && obj.id && obj.name && obj.memberIds) {
    const id = serializableObjectToGroupId(obj.id);
    if (id) {
      const memberIds = obj.memberIds.map(deserializeActorId).filter((id: any) => id !== undefined) as ActorId[];
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
  neighbors: Neighbor[];
}

export interface Neighbor {
  actorId: ActorId;
  score: number;
}

function neighborsToSerializableObject(neighbors: Neighbors): any {
  return {
    groupId: groupIdToSerializableObject(neighbors.groupId),
    neighbors: neighbors.neighbors.map(neighborToSerializableObject),
  };
}

function neighborToSerializableObject(neighbor: Neighbor): any {
  return {
    actorId: serializeActorId(neighbor.actorId),
    score: neighbor.score,
  };
}

function serializableObjectToNeighbors(obj: any): Neighbors|undefined {
  if (obj && obj.groupId) {
    const groupId = serializableObjectToGroupId(obj.groupId);
    if (!groupId) {
      return undefined;
    }
    const neighbors = obj.neighbors ?
      obj.neighbors.map(serializableObjectToNeighbor).filter((neighbor: any) => neighbor !== undefined) as Neighbor[] : [];
    return {
      groupId,
      neighbors,
    };
  }
  return undefined;
}

function serializableObjectToNeighbor(obj: any): Neighbor|undefined {
  if (obj && obj.actorId && obj.score) {
    const actorId = deserializeActorId(obj.actorId);
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
