export interface AcctUri {
  user: string;
  host: string;
}

export interface Actor {
  id: string;
  url: string;
  name: string;
  following: string;
  outbox: string;
  preferredUsername?: string;
  summary?: string;
  icon?: string;
}

export function getAcctUri(actor: Actor): AcctUri {
  const parsedUrl = new URL(actor.url);
  const host = parsedUrl.host;
  const urlLastPath = parsedUrl.pathname.split('/').pop() as string;
  return { user: actor.preferredUsername || urlLastPath, host: host };
}

export function getHandle(actor: Actor): string {
  const acctUri = getAcctUri(actor);
  return `${acctUri.user}@${acctUri.host}`;
}

export function handleToAcctUri(userHost: string): AcctUri|undefined {
  const [ user, host ] = userHost.split('@');
  if (!user || !host) return undefined;
  return { user, host };
}

function actorToSerializableObject(actor: Actor): any {
  return {
    id: actor.id,
    url: actor.url,
    name: actor.name,
    following: actor.following,
    outbox: actor.outbox,
    preferredUsername: actor.preferredUsername,
    summary: actor.summary,
    icon: actor.icon,
  };
}

function serializableObjectToActor(obj: any): Actor|undefined {
  if (!obj.id || !obj.url || !obj.name || !obj.following || !obj.outbox) return undefined;
  return {
    id: obj.id,
    url: obj.url,
    name: obj.name,
    following: obj.following,
    outbox: obj.outbox,
    preferredUsername: obj.preferredUsername,
    summary: obj.summary,
    icon: obj.icon,
  };
}

export function serializeActor(actor: Actor): string {
  return JSON.stringify(actorToSerializableObject(actor));
}

export function deserializeActor(s: string): Actor|undefined {
  return serializableObjectToActor(JSON.parse(s));
}
