import jp from 'jsonpath';
import jsonld from 'jsonld';
import http from '../lib/http';
import { Cache, CachedStorage, EphemeralDataStorage, StorageManager, getStorageManager } from '../lib/storage';
import {
  Actor,
  AcctUri,
  Announce,
  ASObject,
  Create,
  Document,
  Note,
  OrderedCollection,
  OrderedCollectionPage,
  serializeActor,
  deserializeActor
} from './data';

interface Singletons {
  actorRepository: ActorRepository;
  followingClient: FollowingClient;
}

const singletons = {} as Singletons;

export async function getActorRepository(): Promise<ActorRepository> {
  if (!singletons.actorRepository) {
    const storageManager = await getStorageManager();
    singletons.actorRepository = new ActorRepository(storageManager);
  }
  return singletons.actorRepository;
}

export function getFollowingClient(): FollowingClient {
  if (!singletons.followingClient) {
    singletons.followingClient = new FollowingClient();
  }
  return singletons.followingClient;
}

const asNamespace = "https://www.w3.org/ns/activitystreams#";
const acceptActivityJsonHeader = {"Accept": "application/activity+json"};

export class ActorRepository {
  private static storageKeyPrefix = 'activity-pub.ActorRepository.storage';
  private static storageTTL = 60 * 60 * 24 * 2;
  private static cacheTTL = 60 * 60 * 24;
  private static cacheMaxKeys = 100000;

  private storage: CachedStorage<Actor>;

  constructor(storageManager: StorageManager) {
    this.storage = new CachedStorage(
      new EphemeralDataStorage(
        ActorRepository.storageKeyPrefix,
        ActorRepository.storageTTL,
        storageManager,
        serializeActor,
        deserializeActor,
      ),
      new Cache(
        ActorRepository.cacheTTL,
        ActorRepository.cacheMaxKeys,
        serializeActor,
        deserializeActor,
      )
    );
  }

  async fetchByAcctUri(acctUri: AcctUri): Promise<Actor|undefined> {
    const id = await this.fetchActorIdByAcctUri(acctUri);
    return id ? await this.fetch(id) : undefined;
  }

  private async fetchActorIdByAcctUri(acctUri: AcctUri): Promise<string|undefined> {
    try {
      const webFingerUri = `https://${acctUri.host}/.well-known/webfinger`;
      const webFingerParams = {resource: `acct:${acctUri.user}@${acctUri.host}`};
      const response = await http.get(webFingerUri, {}, webFingerParams);
      if (response.status === 404) {
        return undefined;
      } else if (response.status !== 200) {
        throw new Error('WebFinger error: ' + response.status);
      }
      const json = await response.json();
      const href = jp.query(json, '$.links[?(@.rel == "self")].href')[0] ?? undefined;
      if (href === undefined) {
        console.info(`WebFinger error: no self link found in response: uri=${webFingerUri}`);
        return undefined;
      } else if (!href.startsWith('https://')) {
        console.info(`WebFinger error: self link is not a https URI: uri=${webFingerUri}, href=${href}`);
        return undefined;
      }
      return href;
    } catch(e: any) {
      if (e.cause && e.cause.code === 'ENOTFOUND') {
        return undefined;
      } else {
        throw e;
      }
    }
  }

  async fetch(id: string): Promise<Actor|undefined> {
    try {
      const response = await http.get(id, acceptActivityJsonHeader);
      if (response.status === 404) {
        this.storage.store(id, undefined);
        return undefined;
      } else if (response.status !== 200) {
        throw new Error('ActivityPub get Actor error: ' + response.status);
      }
      const actor = await parseActor(await response.json());
      if (actor === undefined) {
        console.info(`ActivityPub get actor error: failed to parse actor: id=${id}`);
        return undefined; 
      }
      this.storage.store(id, actor);
      return actor;
    } catch(e: any) {
      if (e.cause && e.cause.code === 'ENOTFOUND') {
        this.storage.store(id, undefined);
        return undefined;
      } else {
        throw e;
      }
    }
  }

  async get(id: string): Promise<Actor|undefined> {
    const cached = await this.storage.get(id);
    if (cached !== undefined) {
      return cached.value;
    }
    return await this.fetch(id);
  }
}

export class FollowingClient {
  async fetchFirstPageUri(followingUri: string): Promise<string|undefined> {
    try {
      const response = await http.get(followingUri, acceptActivityJsonHeader);
      if (400 <= response.status && response.status < 500) {
        return undefined;
      } else if (response.status !== 200) {
        throw new Error('ActivityPub get Following error: ' + response.status);
      }
      const json = await response.json();
      const orderedCollection = await parseOrderedCollection(json);
      return orderedCollection?.first;
    } catch(e: any) {
      if (e.cause && e.cause.code === 'ENOTFOUND') {
        return undefined;
      } else {
        throw e;
      }
    }
  }

  async fetchPage(pageUri: string): Promise<OrderedCollectionPage|undefined> {
    try {
      const response = await http.get(pageUri, acceptActivityJsonHeader);
      if (400 <= response.status && response.status < 500) {
        return undefined;
      } else if (response.status !== 200) {
        throw new Error('ActivityPub get Following error: ' + response.status);
      }
      const json = await response.json();
      return await parseOrderedCollectionPage(json);
    } catch(e: any) {
      if (e.cause && e.cause.code === 'ENOTFOUND') {
        return undefined;
      } else {
        throw e;
      }
    }
  }
}

function asProperty(name: string): string {
  return asNamespace + name;
}

async function parseActor(json: any): Promise<Actor|undefined> {
  const obj = (await jsonld.expand(json))[0] as any;
  const id = obj['@id'];
  const url = obj[asProperty('url')]?.[0]?.['@id'];
  const name = obj[asProperty('name')]?.[0]?.['@value'];
  const preferredUsername = obj[asProperty('preferredUsername')]?.[0]?.['@value'];
  const summary = obj[asProperty('summary')]?.[0]?.['@value'];
  const following = obj[asProperty('following')]?.[0]?.['@id'];
  const outbox = obj[asProperty('outbox')]?.[0]?.['@id'];
  const icon = obj[asProperty('icon')]?.[0];
  const iconUrl = icon?.[asProperty('url')]?.[0]?.['@id'];

  if (id == undefined || url == undefined || name == undefined || following == undefined || outbox == undefined) {
    return undefined;
  }
  return {id, url, name, following, outbox, preferredUsername, summary, icon: iconUrl};
}

async function parseOrderedCollection(json: any): Promise<OrderedCollection|undefined> {
  const expanded: any = (await jsonld.expand(json))[0];
  const type = expanded['@type']?.[0];
  if (type !== asProperty('OrderedCollection')) {
    return undefined;
  }
  const id = expanded['@id'];
  const totalItems = expanded[asProperty('totalItems')]?.[0]?.['@value'];
  const first = expanded[asProperty('first')]?.[0]?.['@id'];
  const last = expanded[asProperty('last')]?.[0]?.['@id'];
  if (id === undefined || totalItems === undefined || first === undefined) {
    return undefined;
  }
  return {id, totalItems, first, last};
}

async function parseOrderedCollectionPage(json: any): Promise<OrderedCollectionPage|undefined> {
  function readItem(item: any): ASObject|string|undefined {
    const type = item['@type']?.[0];
    if (type === undefined) {
      if (item['@id'] !== undefined && typeof item['@id'] === 'string') {
        return item['@id'];
      } else {
        return undefined;
      }
    } else {
      return readObject(item);
    }
  }

  const expanded: any = (await jsonld.expand(json))[0];
  const type = expanded['@type']?.[0];
  if (type !== asProperty('OrderedCollectionPage')) {
    return undefined;
  }
  const id = expanded['@id'];
  const partOf = expanded[asProperty('partOf')]?.[0]?.['@id'];
  const next = expanded[asProperty('next')]?.[0]?.['@id'];
  const prev = expanded[asProperty('prev')]?.[0]?.['@id'];
  const items = expanded[asProperty('items')]?.[0]?.['@list']?.map(readItem).filter((o: ASObject|string|undefined) => o !== undefined) ?? [];
  return {id, partOf, next, prev, items};
}

function readObject(obj: any): ASObject|undefined {
  const type = obj['@type']?.[0];
  if (type === asProperty('Note')) {
    return readNote(obj);
  } else if (type === asProperty('Document')) {
    return readDocument(obj);
  } else if (type === asProperty('Create')) {
    return readCreate(obj);
  } else if (type === asProperty('Announce')) {
    return readAnnounce(obj);
  } else {  
    return undefined;
  }
}

function readNote(obj: any): Note|undefined {
  const type = obj['@type']?.[0];
  if (type !== asProperty('Note')) {
    return undefined;
  }
  const id = obj['@id'];
  const published = obj[asProperty('published')]?.[0]?.['@value'];
  const url = obj[asProperty('url')]?.[0]?.['@id'];
  const attributedTo = obj[asProperty('attributedTo')]?.[0]?.['@id'];
  const content = obj[asProperty('content')]?.[0]?.['@value'];
  const attachment = obj[asProperty('attachment')]?.map(readDocument).filter((d: Document|undefined) => d !== undefined) ?? [];
  const inReplyTo = obj[asProperty('inReplyTo')]?.[0]?.['@id'];
  if (id === undefined || published === undefined || url === undefined || attributedTo === undefined || content === undefined) {
    return undefined;
  }
  return {id, type: 'Note', published: new Date(published), url, attributedTo, content, attachment, inReplyTo};
}

function readDocument(obj: any): Document|undefined {
  const type = obj['@type']?.[0];
  if (type !== asProperty('Document')) {
    return undefined;
  }
  const id = obj['@id'] ?? '';
  const url = obj[asProperty('url')]?.[0]?.['@id'];
  const mediaType = obj[asProperty('mediaType')]?.[0]?.['@value'];
  const width = obj[asProperty('width')]?.[0]?.['@value'];
  const height = obj[asProperty('height')]?.[0]?.['@value'];
  if (url === undefined || mediaType === undefined) {
    return undefined;
  }
  return {id, type: 'Document', url, mediaType, width, height};
}

function readCreate(obj: any): Create|undefined {
  const type = obj['@type']?.[0];
  if (type !== asProperty('Create')) {
    return undefined;
  }
  const id = obj['@id'];
  const actor = obj[asProperty('actor')]?.[0]?.['@id'];
  const object = obj[asProperty('object')]?.[0];
  if (id === undefined || actor === undefined || object === undefined) {
    return undefined;
  }
  const convertedObject = readObject(object);
  if (convertedObject === undefined) {
    return undefined;
  }
  return {id, type: 'Create', actor, object: convertedObject};
}

function readAnnounce(obj: any): Announce|undefined {
  const type = obj['@type']?.[0];
  if (type !== asProperty('Announce')) {
    return undefined;
  }
  const id = obj['@id'];
  const actor = obj[asProperty('actor')]?.[0]?.['@id'];
  const object = obj[asProperty('object')]?.[0];
  const objectId = object?.['@id'];
  if (id === undefined || actor === undefined || objectId === undefined) {
    return undefined;
  }
  let objectOfAnnounce: ASObject|string;
  if ('@type' in object) {
    const convertedObject = readObject(object);
    if (convertedObject === undefined) {
      return undefined;
    }
    objectOfAnnounce = convertedObject;
  } else {
    objectOfAnnounce = objectId;
  }
  return {id, type: 'Announce', actor, object: objectOfAnnounce};
}
