import { Linking } from 'react-native';

export function getEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function toEpochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export function epochSecondsToDate(epochSeconds: number): Date {
  return new Date(epochSeconds * 1000);
}

export function equalsAsSet(a: string[], b: string[]): boolean {
  const aSet = new Set(a);
  const bSet = new Set(b);
  return b.every((x) => aSet.has(x)) && a.every((x) => bSet.has(x));
}

export class Queue<T> {
  private size: number = 0;
  private head: number = 0;
  private tail: number = 0;
  private queue: T[] = [];
  private limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  public enqueue(value: T): boolean {
    if (this.isFull()) {
      return false;
    } else {
      this.queue[this.tail] = value;
      this.tail = (this.tail + 1) % this.limit;
      this.size++;
      return true;
    }
  }

  public dequeue(): T|undefined {
    if (this.isEmpty()) {
      return undefined;
    } else {
      const value = this.queue[this.head];
      this.head = (this.head + 1) % this.limit;
      this.size--;
      console.log('dequeue head=' + this.head + ' size=' + this.size);
      return value;
    }
  }

  public isFull(): boolean {
    return this.size >= this.limit;
  }

  public isEmpty(): boolean {
    return this.size === 0;
  }

  public getSize(): number {
    return this.size;
  }

  public clear(): void {
    this.size = 0;
    this.head = 0;
    this.tail = 0;
  }
}

export class PriorityQueue<T> {
  private queue: { value: T, priority: number }[] = [];
  private limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  public enqueue(value: T, priority: number): boolean {
    if (this.isFull()) {
      return false;
    }
    let ptr = this.queue.length;
    this.queue.push({value, priority});
    while (ptr > 0) {
      const parentIdx = Math.floor((ptr - 1) / 2);
      if (this.queue[parentIdx].priority <= priority) {
        break;
      }
      this.queue[ptr] = this.queue[parentIdx];
      ptr = parentIdx;
    }
    this.queue[ptr] = {value, priority};
    return true;
  }

  public dequeue(): { value: T, priority: number }|undefined {
    if (this.isEmpty()) {
      return undefined;
    }
    const ret = this.queue[0];
    const popped = this.queue.pop();
    if (this.queue.length >= 1) {
      let ptr = 0;
      while (ptr < this.queue.length) {
        let childIdx = ptr * 2 + 1;
        if (childIdx >= this.queue.length) {
          break;
        }
        let smallerChildIdx = (
          childIdx + 1 < this.queue.length &&
          this.queue[childIdx + 1].priority < this.queue[childIdx].priority
        ) ? childIdx + 1 : childIdx;
        if (this.queue[smallerChildIdx].priority >= popped!.priority) {
          break;
        }
        this.queue[ptr] = this.queue[smallerChildIdx];
        ptr = smallerChildIdx;
      }
      this.queue[ptr] = popped!;
    }
    return ret;
  }

  public getHead(): { value: T, priority: number }|undefined {
    if (this.isEmpty()) {
      return undefined;
    }
    return this.queue[0];
  }

  public isEmpty() {
    return this.queue.length === 0;
  }

  public isFull() {
    return this.queue.length >= this.limit;
  }
}

export async function linkHandler(url: string) {
  if (await Linking.canOpenURL(url)) {
    await Linking.openURL(url);
  } else {
    console.error('Cannot open URL: ' + url);
  }
};
