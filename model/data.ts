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

export interface ActorId {
  snsType: SNSType;
  value: string;
}

export interface Actor {
  id: ActorId;
  uri: string;
  name: string;
  handle: string;
  icon?: string;
}

export interface PostId {
  snsType: SNSType;
  value: string;
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

export interface GroupId {
  value: number;
}

export interface Group {
  id: GroupId;
  name: string;
  actorIds: ActorId[];
}

export function actorIdToString(actorId: ActorId): string {
  return `${actorId.snsType}:${actorId.value}`;
}