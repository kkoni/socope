import deepEqual from 'deep-equal';
import { toEpochSeconds, epochSecondsToDate } from './lib/util';

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

export class ActorId {
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

function actorIdToSerializableObject(id: ActorId): any {
  return {
    snsType: id.snsType,
    value: id.value,
  };
}

function serializableObjectToActorId(obj: any): ActorId|undefined {
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

export class PostId {
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

function postIdToSerializableObject(id: PostId): any {
  return {
    snsType: id.snsType,
    value: id.value,
  };
}

function serializableObjectToPostId(obj: any): PostId|undefined {
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
  uri: string;
  postedAt: Date;
  ownerId: ActorId;
  content: string;
  images: EmbededImage[];
}

export interface EmbededImage {
  uri: string;
  mediaType?: string;
  width?: number;
  height?: number;
  alt?: string;
}

function embededImageToSerializableObject(image: EmbededImage): any {
  return {
    uri: image.uri,
    mediaType: image.mediaType,
    width: image.width,
    height: image.height,
    alt: image.alt,
  };
}

function serializableObjectToEmbededImage(obj: any): EmbededImage|undefined {
  if (obj && obj.uri) {
    return {
      uri: obj.uri,
      mediaType: obj.mediaType,
      width: obj.width,
      height: obj.height,
      alt: obj.alt,
    };
  }
  return undefined;
}

function postToSerializableObject(post: Post): any {
  return {
    id: postIdToSerializableObject(post.id),
    uri: post.uri,
    postedAt: toEpochSeconds(post.postedAt),
    ownerId: actorIdToSerializableObject(post.ownerId),
    content: post.content,
    images: post.images.map(embededImageToSerializableObject),
  };
}

function serilalizableObjectToPost(obj: any): Post|undefined {
  if (obj && obj.id && obj.uri && obj.postedAt && obj.ownerId && obj.content && obj.images) {
    const id = serializableObjectToPostId(obj.id);
    if (id) {
      const postedAt = epochSecondsToDate(obj.postedAt);
      const ownerId = serializableObjectToActorId(obj.ownerId);
      if (ownerId) {
        const images = obj.images.map(serializableObjectToEmbededImage).filter((image: any) => image !== undefined) as EmbededImage[];
        return {
          id,
          uri: obj.uri,
          postedAt,
          ownerId,
          content: obj.content,
          images,
        };
      }
    }
  }
  return undefined;
}

export function serializePost(post: Post): string {
  return JSON.stringify(postToSerializableObject(post));
}

export function deserializePost(s: string): Post|undefined {
  return serilalizableObjectToPost(JSON.parse(s));
}

export class GroupId {
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
  actorIds: ActorId[];
}

function groupToSerializableObject(group: Group): any {
  return {
    id: groupIdToSerializableObject(group.id),
    name: group.name,
    actorIds: group.actorIds.map(actorIdToSerializableObject),
  };
}

function serializableObjectToGroup(obj: any): Group|undefined {
  if (obj && obj.id && obj.name && obj.actorIds) {
    const id = serializableObjectToGroupId(obj.id);
    if (id) {
      const actorIds = obj.actorIds.map(serializableObjectToActorId).filter((id: any) => id !== undefined) as ActorId[];
      return {
        id,
        name: obj.name,
        actorIds,
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
  closeNeighbors: Neighbor[];
  farNeighbors: Neighbor[];
}

export interface Neighbor {
  actorId: ActorId;
  followCount: number;
}

function neighborsToSerializableObject(neighbors: Neighbors): any {
  return {
    closeNeighbors: neighbors.closeNeighbors.map(neighborToSerializableObject),
    farNeighbors: neighbors.farNeighbors.map(neighborToSerializableObject),
  };
}

function neighborToSerializableObject(neighbor: Neighbor): any {
  return {
    actorId: actorIdToSerializableObject(neighbor.actorId),
    followCount: neighbor.followCount,
  };
}

function serializableObjectToNeighbors(obj: any): Neighbors|undefined {
  if (obj && obj.closeNeighbors && obj.farNeighbors) {
    const closeNeighbors = obj.closeNeighbors.map(serializableObjectToNeighbor).filter((neighbor: any) => neighbor !== undefined) as Neighbor[];
    const farNeighbors = obj.farNeighbors.map(serializableObjectToNeighbor).filter((neighbor: any) => neighbor !== undefined) as Neighbor[];
    return {
      closeNeighbors,
      farNeighbors,
    };
  }
  return undefined;
}

function serializableObjectToNeighbor(obj: any): Neighbor|undefined {
  if (obj && obj.actorId && obj.followCount) {
    const actorId = serializableObjectToActorId(obj.actorId);
    if (actorId) {
      return {
        actorId,
        followCount: obj.followCount,
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
