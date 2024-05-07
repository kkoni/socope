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
  rawData: any;
  authorId: ActorId;
  createdAt?: Date;
  embeddedPostId?: PostId;
  reply?: Reply;
  repost?: Repost;
}

export interface Reply {
  rootPostId: PostId;
  parentPostId: PostId;
}

export interface Repost {
  by : ActorId;
  indexedAt: Date;
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
  activityPubNeighbors: Neighbor[];
  atProtoNeighbors: Neighbor[];
}

export interface Neighbor {
  actorId: ActorId;
  score: number;
}

function neighborsToSerializableObject(neighbors: Neighbors): any {
  return {
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
  if (obj) {
    const activityPubNeighbors = obj.activityPubNeighbors ?
      obj.activityPubNeighbors.map(serializableObjectToNeighbor).filter((neighbor: any) => neighbor !== undefined) as Neighbor[] : [];
    const atProtoNeighbors = obj.atProtoNeighbors ?
      obj.atProtoNeighbors.map(serializableObjectToNeighbor).filter((neighbor: any) => neighbor !== undefined) as Neighbor[] : [];
    return {
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
