import { describe, expect, it } from '@jest/globals';
import { PriorityQueue, SerializableValueSet } from './util';

describe('PriorityQueue', () => {
  it('should pop the smallest element', () => {
    const queue = new PriorityQueue<string>(5, (value: string) => value);
    expect(queue.isEmpty()).toEqual(true);
    expect(queue.enqueue('a', 5)).toEqual(true);
    expect(queue.isEmpty()).toEqual(false);
    expect(queue.enqueue('b', 1)).toEqual(true);
    expect(queue.enqueue('c', 3)).toEqual(true);
    expect(queue.enqueue('d', 2)).toEqual(true);
    expect(queue.enqueue('e', 4)).toEqual(true);
    expect(queue.enqueue('f', 6)).toEqual(false);
    expect(queue.isFull()).toEqual(true);

    expect(queue.peek()).toEqual({ value: 'b', priority: 1 });
    expect(queue.dequeue()).toEqual({ value: 'b', priority: 1 });
    expect(queue.isFull()).toEqual(false);
    expect(queue.peek()).toEqual({ value: 'd', priority: 2 });
    expect(queue.dequeue()).toEqual({ value: 'd', priority: 2 });

    expect(queue.enqueue('g', 2)).toEqual(true);
    expect(queue.peek()).toEqual({ value: 'g', priority: 2 });
    expect(queue.dequeue()).toEqual({ value: 'g', priority: 2 });
    expect(queue.peek()).toEqual({ value: 'c', priority: 3 });
    expect(queue.dequeue()).toEqual({ value: 'c', priority: 3 });
    expect(queue.peek()).toEqual({ value: 'e', priority: 4 });
    expect(queue.dequeue()).toEqual({ value: 'e', priority: 4 });
    expect(queue.peek()).toEqual({ value: 'a', priority: 5 });
    expect(queue.dequeue()).toEqual({ value: 'a', priority: 5 });

    expect(queue.isEmpty()).toEqual(true);

    expect(queue.enqueue('a', 2)).toEqual(true);
    expect(queue.enqueue('b', 5)).toEqual(true);
    expect(queue.enqueue('a', 10)).toEqual(false);
    expect(queue.dequeue()).toEqual({ value: 'a', priority: 2 });
    expect(queue.dequeue()).toEqual({ value: 'b', priority: 5 });
    expect(queue.isEmpty()).toEqual(true);
  });
});

describe('SerializableValueSet', () => {
  it('should add and delete values', () => {
    const set = new SerializableValueSet<string>();
    expect(set.has('a')).toEqual(false);
    set.add('a');
    expect(set.has('a')).toEqual(true);
    set.add('a');
    expect(set.has('a')).toEqual(true);
    set.delete('a');
    expect(set.has('a')).toEqual(false);
  });
});
