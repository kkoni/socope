import {
  AppBskyActorDefs,
  AppBskyFeedDefs,
  AppBskyEmbedImages,
  AppBskyEmbedExternal,
  AppBskyEmbedRecord,
} from '@atproto/api';
import {
  ActorId,
  Post,
  PostId,
  PostTextPart,
  EmbeddedImage,
  EmbeddedWebPage,
  Reply,
  Repost,
  SNSTypes,
} from '../data';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

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

export const FacetTypes = {
  Link: "Link",
  Hashtag: "Hashtag",
  Mention: "Mention",
} as const;

export type FacetType = typeof FacetTypes[keyof typeof FacetTypes];


interface Facet {
  byteStart: number;
  byteEnd: number;
  type: FacetType;
}

interface LinkFacet extends Facet {
  uri: string;
}

interface HashtagFacet extends Facet {
  tag: string;
}

interface MentionFacet extends Facet {
  did: string;
}

export function createPostFromPostView(postView: AppBskyFeedDefs.PostView): Post|undefined {
  function createFacet(facetObj: any): Facet|undefined {
    if (
      facetObj.index === undefined ||
      facetObj.index.byteStart === undefined ||
      facetObj.index.byteEnd === undefined ||
      facetObj.features === undefined ||
      !Array.isArray(facetObj.features) ||
      facetObj.features.length !== 1
    ) {
      return undefined;
    }
    switch(facetObj.features[0].$type) {
      case 'app.bsky.richtext.facet#link':
        if (facetObj.features[0].uri === undefined) {
          return undefined;
        }
        return {
          byteStart: facetObj.index.byteStart,
          byteEnd: facetObj.index.byteEnd,
          type: FacetTypes.Link,
          uri: facetObj.features[0].uri,
        } as LinkFacet;
      case 'app.bsky.richtext.facet#tag':
        if (facetObj.features[0].tag === undefined) {
          return undefined;
        }
        return {
          byteStart: facetObj.index.byteStart,
          byteEnd: facetObj.index.byteEnd,
          type: FacetTypes.Hashtag,
          tag: facetObj.features[0].tag,
        } as HashtagFacet;
      case 'app.bsky.richtext.facet#mention':
        if (facetObj.features[0].did === undefined) {
          return undefined;
        }
        return {
          byteStart: facetObj.index.byteStart,
          byteEnd: facetObj.index.byteEnd,
          type: FacetTypes.Mention,
          did: facetObj.features[0].did,
        } as MentionFacet;
    }
    return undefined;
  }

  function facetToPostTextPart(textBytes: Uint8Array, facet: Facet): PostTextPart|undefined {
    const text = textDecoder.decode(textBytes.slice(facet.byteStart, facet.byteEnd));
    switch(facet.type) {
      case FacetTypes.Link:
        return {
          text,
          isHashtag: false,
          linkUrl: (facet as LinkFacet).uri,
        };
      case FacetTypes.Hashtag:
        return {
          text,
          isHashtag: true,
        };
      case FacetTypes.Mention:
        return {
          text,
          isHashtag: false,
          mentionedActorId: new ActorId(SNSTypes.ATProto, (facet as MentionFacet).did),
        };
    }
    return undefined;
  }

  function createText(postView: AppBskyFeedDefs.PostView): PostTextPart[]|undefined {
    const record = postView.record as any;
    const text = record.text;
    if (text === undefined) {
      return undefined;
    }
    const facets = record.facets === undefined ? [] : record.facets.map(createFacet).filter((facet: Facet|undefined) => facet !== undefined) as Facet[];
    if (facets.length === 0) {
      return [{ text, isHashtag: false }];
    }
    facets.sort((a, b) => a.byteStart - b.byteStart);

    const textBytes = textEncoder.encode(text);
    const textParts: PostTextPart[] = [];
    if (facets[0].byteStart > 0) {
      textParts.push({ text: textDecoder.decode(textBytes.slice(0, facets[0].byteStart)), isHashtag: false });
    }
    for (let i = 0; i < facets.length; i++) {
      const facet = facets[i];
      const facetTextPart = facetToPostTextPart(textBytes, facet);
      if (facetTextPart !== undefined) {
        textParts.push(facetTextPart);
      }
      if (i < facets.length - 1) {
        textParts.push({ text: textDecoder.decode(textBytes.slice(facets[i].byteEnd, facets[i + 1].byteStart)), isHashtag: false });
      }
    }
    if (facets[facets.length - 1].byteEnd < textBytes.length) {
      textParts.push({ text: textDecoder.decode(textBytes.slice(facets[facets.length - 1].byteEnd)), isHashtag: false });
    }
    return textParts;
  }

  function createEmbeddedImages(postView: AppBskyFeedDefs.PostView): EmbeddedImage[] {
    const embedType = postView.embed?.$type;
    if (embedType !== 'app.bsky.embed.images#view') {
      return [];
    }
    const embedImagesView = postView.embed as AppBskyEmbedImages.View;
    return embedImagesView.images.map((image) => {
      return {
        url: image.thumb,
        width: image.aspectRatio?.width ?? 0,
        height: image.aspectRatio?.height ?? 0,
      }
    });
  }

  function createEmbeddedWebPage(postView: AppBskyFeedDefs.PostView): EmbeddedWebPage|undefined {
    const embedType = postView.embed?.$type;
    if (embedType !== 'app.bsky.embed.external#view') {
      return undefined;
    }
    const embedExternalView = postView.embed as AppBskyEmbedExternal.View;
    return {
      url: embedExternalView.external.uri,
      title: embedExternalView.external.title,
      description: embedExternalView.external.description,
      thumbnailImageUrl: embedExternalView.external.thumb,
    };
  }

  function createEmbeddedPostId(postView: AppBskyFeedDefs.PostView): PostId|undefined {
    const embedType = postView.embed?.$type;
    if (embedType !== 'app.bsky.embed.record#view') {
      return undefined;
    }
    const embedRecordView = postView.embed as AppBskyEmbedRecord.View;
    const recordType = embedRecordView.record.$type;
    if (recordType !== 'app.bsky.embed.record#viewRecord') {
      return undefined;
    }
    const viewRecord = embedRecordView.record as AppBskyEmbedRecord.ViewRecord;
    return new PostId(SNSTypes.ATProto, viewRecord.uri);
  }

  function createReply(postView: AppBskyFeedDefs.PostView): Reply|undefined {
    const record = postView.record as any;
    if (record.reply === undefined || record.reply.root.uri === undefined || record.reply.parent.uri === undefined) {
      return undefined;
    }
    return {
      rootPostId: new PostId(SNSTypes.ATProto, record.reply.root.uri),
      parentPostId: new PostId(SNSTypes.ATProto, record.reply.parent.uri),
    };
  }

  const id = new PostId(SNSTypes.ATProto, postView.uri);
  const authorId = new ActorId(SNSTypes.ATProto, postView.author.did);
  const parsedIndexedAt = Date.parse(postView.indexedAt);
  if (isNaN(parsedIndexedAt)) {
    return undefined;
  }
  const createdAt = new Date(parsedIndexedAt);
  const text = createText(postView);
  if (text === undefined) {
    return undefined;
  }
  const embeddedImages = createEmbeddedImages(postView);
  const embeddedPostId = createEmbeddedPostId(postView);
  const embeddedWebPage = createEmbeddedWebPage(postView);
  const reply = createReply(postView);
  return {
    id,
    authorId,
    createdAt,
    text,
    embeddedImages,
    embeddedPostId,
    embeddedWebPage,
    reply,
  };
}

export function createPostOrRepostFromFeedViewPost(feedViewPost: AppBskyFeedDefs.FeedViewPost): {post?: Post, repost?: Repost} {
  if (feedViewPost.reason === undefined) {
    return {post: createPostFromPostView(feedViewPost.post)};
  } else if (feedViewPost.reason.$type === 'app.bsky.feed.defs#reasonRepost') {
    const reasonRepost = feedViewPost.reason as AppBskyFeedDefs.ReasonRepost;
    const parsedIndexedAt = Date.parse(reasonRepost.indexedAt);
    if (isNaN(parsedIndexedAt)) {
      return {};
    }
    return {
      repost: {
        repostedPostId: new PostId(SNSTypes.ATProto, feedViewPost.post.uri),
        createdBy: new ActorId(SNSTypes.ATProto, reasonRepost.by.did),
        createdAt: new Date(parsedIndexedAt),
      }
    };
  }
  return {};
}
