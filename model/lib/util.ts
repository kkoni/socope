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

export async function linkHandler(url: string) {
  if (await Linking.canOpenURL(url)) {
    await Linking.openURL(url);
  } else {
    console.error('Cannot open URL: ' + url);
  }
};
