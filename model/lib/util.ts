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

export interface Serializable {
  toString(): string;
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
  private valueSet: Set<string> = new Set();
  private limit: number;
  private valueSerializer: (value: T) => string;

  constructor(limit: number, valueSerializer: (value: T) => string) {
    this.limit = limit;
    this.valueSerializer = valueSerializer;
  }

  public enqueue(value: T, priority: number): boolean {
    if (this.isFull() || this.has(value)) {
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
    this.valueSet.add(this.valueSerializer(value));
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
    this.valueSet.delete(this.valueSerializer(ret.value));
    return ret;
  }

  public peek(): { value: T, priority: number }|undefined {
    if (this.isEmpty()) {
      return undefined;
    }
    return this.queue[0];
  }

  public has(value: T): boolean {
    return this.valueSet.has(this.valueSerializer(value));
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

export class SerializableKeyMap<K extends Serializable, V> {
  private keyMap: Map<string, K>;
  private valueMap: Map<string, V>;

  constructor(keyMap?: Map<string, K>, valueMap?: Map<string, V>) {
    this.keyMap = keyMap || new Map();
    this.valueMap = valueMap || new Map();
  }

  public set(key: K, value: V) {
    this.keyMap.set(key.toString(), key);
    this.valueMap.set(key.toString(), value);
  }

  public get(key: K): V|undefined {
    return this.valueMap.get(key.toString());
  }

  public delete(key: K) {
    this.keyMap.delete(key.toString());
    this.valueMap.delete(key.toString());
  }

  public has(key: K): boolean {
    return this.valueMap.has(key.toString());
  }

  public clear() {
    this.keyMap.clear();
    this.valueMap.clear();
  }

  public keys(): IterableIterator<K> {
    return this.keyMap.values();
  }

  public entries(): IterableIterator<[K, V]> {
    return new SerializableKeyMapIterator(this.keyMap.values(), this.valueMap);
  }

  public values(): IterableIterator<V> {
    return this.valueMap.values();
  }
  
  public get size(): number {
    return this.valueMap.size;
  }

  public clone(): SerializableKeyMap<K, V> {
    return new SerializableKeyMap(new Map(this.keyMap), new Map(this.valueMap));
  }
}

class SerializableKeyMapIterator<K extends Serializable, V> implements IterableIterator<[K, V]> {
  private keyIterator: IterableIterator<K>;
  private valueMap: Map<string, V>;

  constructor(keyIterator: IterableIterator<K>, valueMap: Map<string, V>) {
    this.keyIterator = keyIterator;
    this.valueMap = valueMap;
  }

  public next(): IteratorResult<[K, V]> {
    const key = this.keyIterator.next();
    if (key.done) {
      return { done: true, value: undefined };
    }
    const value = this.valueMap.get(key.value.toString());
    if (value === undefined) {
      return { done: true, value: undefined };
    }
    return { done: false, value: [key.value, value] };
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this;
  }
}

export class SerializableValueSet<T extends Serializable> {
  private valueMap: Map<string, T>;

  constructor(values?: T[], valueMap?: Map<string, T>) {
    if (valueMap !== undefined) {
      this.valueMap = valueMap;
    } else {
      this.valueMap = new Map();
      if (values !== undefined) {
        for (const value of values) {
          this.add(value);
        }
      }
    }
  }

  add(value: T) {
    this.valueMap.set(value.toString(), value);
  }

  delete(value: T) {
    this.valueMap.delete(value.toString());
  }

  has(value: T) {
    return this.valueMap.has(value.toString());
  }

  values(): IterableIterator<T> {
    return this.valueMap.values();
  }

  clear() {
    this.valueMap.clear();
  }

  clone(): SerializableValueSet<T> {
    return new SerializableValueSet(undefined, new Map(this.valueMap));
  }

  get size(): number {
    return this.valueMap.size;
  }
}
