import deepEqual from 'deep-equal';

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

export interface Actor {
  id: ActorId;
  uri: string;
  name: string;
  handle: string;
  icon?: string;
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

export interface Group {
  id: GroupId;
  name: string;
  actorIds: ActorId[];
}
