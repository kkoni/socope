import { ProfileViewDetailed } from '@atproto/api/dist/client/types/app/bsky/actor/defs';
import { Actor as ActivityPubActor, getHandle, handleToAcctUri } from './activity-pub/data';
import { getActorRepository as getActivityPubActorRepository } from './activity-pub/repositories';
import { getActorRepository as getATProtoActorRepository } from './atproto/repositories';
import { Actor, ActorId, Group, GroupId, SNSType, SNSTypes } from './data';

interface Singletons {
  actorRepository: ActorRepository;
  groupRepository: GroupRepository;
}

const singletons = {} as Singletons;

export function getActorRepository(): ActorRepository {
  if (!singletons.actorRepository) {
    singletons.actorRepository = new ActorRepository();
  }
  return singletons.actorRepository;
}

export function getGroupRepository(): GroupRepository {
  if (!singletons.groupRepository) {
    singletons.groupRepository = new GroupRepository();
  }
  return singletons.groupRepository;
}

const activityPubHandleRegex = /^[^@]+@[^@]+$/

export class ActorRepository {
  async fetchByHandle(handle: string): Promise<Actor|undefined> {
    let snsType: SNSType = SNSTypes.ATProto;
    if (handle.match(activityPubHandleRegex)) {
      snsType = SNSTypes.ActivityPub;
    }
    switch (snsType) {
      case SNSTypes.ActivityPub:
        const acctUri = handleToAcctUri(handle);
        if (acctUri === undefined) {
          return undefined;
        }
        const activityPubActor = await getActivityPubActorRepository().fetchByAcctUri(acctUri);
        return activityPubActor ? this.convertActivityPubActor(activityPubActor) : undefined;
      case SNSTypes.ATProto:
        const atProtoActor = await getATProtoActorRepository().fetch(handle);
        return atProtoActor ? this.convertATProtoActor(atProtoActor) : undefined;
    }
  }

  async get(id: ActorId): Promise<Actor|undefined> {
    switch (id.snsType) {
      case SNSTypes.ActivityPub:
        const activityPubActor = await getActivityPubActorRepository().get(id.value);
        return activityPubActor ? this.convertActivityPubActor(activityPubActor) : undefined;
      case SNSTypes.ATProto:
        const atProtoActor = await getATProtoActorRepository().get(id.value);
        return atProtoActor ? this.convertATProtoActor(atProtoActor) : undefined;
    }
  }

  private convertActivityPubActor(actor: ActivityPubActor): Actor {
    return {
      id: { snsType: SNSTypes.ActivityPub, value: actor.id },
      uri: actor.url,
      name: actor.name,
      handle: getHandle(actor),
      icon: actor.icon,
    };
  }

  private convertATProtoActor(actor: ProfileViewDetailed): Actor {
    return {
      id: { snsType: SNSTypes.ATProto, value: actor.did },
      uri: `https://bsky.app/profile/${actor.handle}`,
      name: actor.displayName || actor.handle,
      handle: actor.handle,
      icon: actor.avatar,
    };
  }
}

export class GroupRepository {
  private list: Group[] = [];

  create(name: string, actorIds: ActorId[]): Group {
    const newGroup: Group = {
      id: this.getNextId(),
      name,
      actorIds,
    };
    this.store(newGroup);
    return newGroup;
  }

  store(group: Group): void {
    const index = this.list.findIndex((g) => g.id.value === group.id.value);
    if (index === -1) {
      this.list.push(group);
    } else {
      this.list[index] = group;
    }
  }

  delete(id: GroupId): void {
    this.list = this.list.filter((group) => group.id.value !== id.value);
  }

  get(id: GroupId): Group | undefined {
    return this.list.find((group) => group.id.value === id.value);
  }

  getAll(): Group[] {
    return this.list;
  }

  getNextId(): GroupId {
    let nextId = 1;
    if (this.list.length >= 1) {
      nextId = Math.max(...this.list.map((group) => group.id.value)) + 1;
    }
    return { value: nextId };
  }
}
