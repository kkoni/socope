import jp from 'jsonpath';
import jsonld from 'jsonld';
import http from '../lib/http';
import { Cache, CachedStorage, EphemeralDataStorage, StorageManager, getStorageManager } from '../lib/storage';
import { Actor, AcctUri, serializeActor, deserializeActor } from './data';

interface Singletons {
  actorRepository: ActorRepository;
}

const singletons = {} as Singletons;

export async function getActorRepository(): Promise<ActorRepository> {
  if (!singletons.actorRepository) {
    const storageManager = await getStorageManager();
    singletons.actorRepository = new ActorRepository(storageManager);
  }
  return singletons.actorRepository;
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
