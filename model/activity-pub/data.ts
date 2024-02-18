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
