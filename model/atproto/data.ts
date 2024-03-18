import { ProfileViewDetailed } from '@atproto/api/dist/client/types/app/bsky/actor/defs';

function profileToSerializableObject(profile: ProfileViewDetailed): any {
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

function serializableObjectToProfile(serializable: any): ProfileViewDetailed {
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

export function serializeProfile(profile: ProfileViewDetailed): string {
  return JSON.stringify(profileToSerializableObject(profile));
}

export function deserializeProfile(s: string): ProfileViewDetailed {
  return serializableObjectToProfile(JSON.parse(s));
}
