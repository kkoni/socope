import { ActorId } from "./core";

interface GroupId {
  value: number;
}

interface Group {
  id: GroupId;
  name: string;
  actorIds: ActorId[];
}

export class Groups {
  private list: Group[] = [];

  create(name: string, actorIds: ActorId[]): Group {
    let newId = 1;
    if (this.list.length >= 1) {
      newId = Math.max(...this.list.map((group) => group.id.value)) + 1;
    }
    const newGroup: Group = {
      id: { value: newId },
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
}
