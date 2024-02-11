export const SNSTypes = {
  ActivityPub: "ActivityPub",
  ATProto: "ATProto",
} as const;

export type SNSType = typeof SNSTypes[keyof typeof SNSTypes];

export interface ActorId {
  snsType: SNSType;
  value: string;
}

export interface Actor {
  id: ActorId;
  uri: string;
  name: string;
  screenName: string;
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
