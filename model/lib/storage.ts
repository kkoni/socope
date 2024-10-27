import * as SQLite from 'expo-sqlite';
import { Cache as LibCache, MemoryStore } from 'react-native-cache';
import { getEpochSeconds } from './util';

export interface StorageManager {
  /**
   * 
   * @param key 
   * @param value 
   * @param now - Unix time
   * @param ttl - seconds
   */
  storeEphemeralData(key: string, value: string, now: number, ttl: number): Promise<void>;

  getEphemeralData(key: string): Promise<string | undefined>;

  /**
   * @param key
   * @returns - value and updatedAt (Unix time)
   */
  getEphemeralDataWithUpdatedAt(key: string): Promise<{ value: string, updatedAt: number } | undefined>;

  /**
   * 
   * @param key
   * @returns - Unix time
   */
  getUpdatedAt(key: string): Promise<number | undefined>;

  /**
   * 
   * @param now - Unix time
   */
  deleteExpiredEphemeralData(now: number): Promise<void>;

  deleteEphemeralDataByPrefix(prefix: string): Promise<void>;

  /**
   * 
   * @param key 
   * @param value 
   * @param now - Unix time
   */
  storeLongLivedData(key: string, value: string): Promise<void>;

  getLongLivedData(key: string): Promise<string | undefined>;

  deleteLongLivedData(key: string): Promise<void>;
}

const databaseName = 'db.db';
const ephemeralDataTableName = "ephemeral_data";
const longLivedDataTableName = "long_lived_data";
const ephemeralDataCountLimit = 1000000;

function isResultSetError(result: SQLite.ResultSet | SQLite.ResultSetError): result is SQLite.ResultSetError {
  return (result as any).rowsAffected === undefined;
}

function isResultSet(result: SQLite.ResultSet | SQLite.ResultSetError): result is SQLite.ResultSet {
  return (result as any).rowsAffected !== undefined;
}

class StorageManagerImpl implements StorageManager {
  private db: SQLite.SQLiteDatabase | undefined = undefined;
  private ephemeralDataCount: number = 0;

  async initialize(): Promise<void> {
    try {
      this.db = SQLite.openDatabase(databaseName);
      const result1 = (await this.db.execAsync(
        [{
          sql: `CREATE TABLE IF NOT EXISTS ${ephemeralDataTableName} (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL, expired_at INTEGER NOT NULL)`,
          args: [],
        }],
        false
      ))[0];
      if (isResultSetError(result1)) {
        throw result1.error;
      }
      const result2 = (await this.db.execAsync(
        [{
          sql: `CREATE TABLE IF NOT EXISTS ${longLivedDataTableName} (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
          args: [],
        }],
        false
      ))[0];
      if (isResultSetError(result2)) {
        throw result2.error;
      }
      this.ephemeralDataCount = await this.getEphemeralDataCount();
    } catch(e: any) {
      console.log(e);
    }
  }

  private async getEphemeralDataCount(): Promise<number> {
    if (this.db === undefined) return 0;
    const result = (await this.db.execAsync(
      [{
        sql: `SELECT COUNT(*) FROM ${ephemeralDataTableName}`,
        args: [],
      }],
      true
    ))[0];
    if (isResultSet(result)) {
      return result.rows[0]['COUNT(*)'];
    } else if (isResultSetError(result)) {
      throw result.error;
    }
    return 0;
  }

  async storeEphemeralData(key: string, value: string, now: number, ttl: number): Promise<void> {
    if (this.db === undefined || this.ephemeralDataCount >= ephemeralDataCountLimit) throw new Error('ephemeral data count limit exceeded');
    const expiredAt = now + ttl;
    const result = (await this.db.execAsync(
      [{
        sql: `INSERT OR REPLACE INTO ${ephemeralDataTableName} (key, value, updated_at, expired_at) VALUES (?, ?, ?, ?)`,
        args: [key, value, now, expiredAt],
      }],
      false
    ))[0];
    if (isResultSet(result) && result.insertId !== undefined) {
      this.ephemeralDataCount++;
    }
  }

  public async getEphemeralData(key: string): Promise<string | undefined> {
    if (this.db === undefined) return undefined;
    const result = (await this.db.execAsync(
      [{
        sql: `SELECT value FROM ${ephemeralDataTableName} WHERE key = ?`,
        args: [key],
      }],
      true
    ))[0];
    if (isResultSet(result) && result.rows.length > 0) {
      return result.rows[0]['value'];
    } else if (isResultSetError(result)) {
      console.log(result.error);
    }
    return undefined;
  }

  public async getEphemeralDataWithUpdatedAt(key: string): Promise<{ value: string, updatedAt: number } | undefined> {
    if (this.db === undefined) return undefined;
    const result = (await this.db.execAsync(
      [{
        sql: `SELECT value, updated_at FROM ${ephemeralDataTableName} WHERE key = ?`,
        args: [key],
      }],
      true
    ))[0];
    if (isResultSet(result) && result.rows.length > 0) {
      return {
        value: result.rows[0]['value'],
        updatedAt: result.rows[0]['updated_at'],
      };
    } else if (isResultSetError(result)) {
      console.log(result.error);
    }
    return undefined;
  }

  public async getUpdatedAt(key: string): Promise<number | undefined> {
    if (this.db === undefined) return undefined;
    const result = (await this.db.execAsync(
      [{
        sql: `SELECT updated_at FROM ${ephemeralDataTableName} WHERE key = ?`,
        args: [key],
      }],
      true
    ))[0];
    if (isResultSet(result) && result.rows.length > 0) {
      return result.rows[0]['updated_at'];
    } else if (isResultSetError(result)) {
      console.log(result.error);
    }
    return undefined;
  }

  public async deleteExpiredEphemeralData(now: number): Promise<void> {
    if (this.db === undefined) return;
    const result = (await this.db.execAsync(
      [{
        sql: `DELETE FROM ${ephemeralDataTableName} WHERE expired_at < ?`,
        args: [now],
      }],
      false
    ))[0];
    if (isResultSetError(result)) {
      console.log(result.error);
    } else if (isResultSet(result)) {
      this.ephemeralDataCount = await this.getEphemeralDataCount();
    }
  }

  public async deleteEphemeralDataByPrefix(prefix: string): Promise<void> {
    if (this.db === undefined) return;
    const result = (await this.db.execAsync(
      [{
        sql: `DELETE FROM ${ephemeralDataTableName} WHERE key LIKE ?`,
        args: [`${prefix}%`],
      }],
      false
    ))[0];
    if (isResultSetError(result)) {
      console.log(result.error);
    } else if (isResultSet(result)) {
      this.ephemeralDataCount = await this.getEphemeralDataCount();
    }
  }

  public async storeLongLivedData(key: string, value: string): Promise<void> {
    if (this.db === undefined) return;
    const result = (await this.db.execAsync(
      [{
        sql: `INSERT OR REPLACE INTO ${longLivedDataTableName} (key, value, updated_at) VALUES (?, ?, ?)`,
        args: [key, value, getEpochSeconds()],
      }],
      false
    ))[0];
    if (isResultSetError(result)) {
      console.log(result.error);
    }
  }

  public async getLongLivedData(key: string): Promise<string | undefined> {
    if (this.db === undefined) return undefined;
    const result = (await this.db.execAsync(
      [{
        sql: `SELECT value FROM ${longLivedDataTableName} WHERE key = ?`,
        args: [key],
      }],
      true
    ))[0];
    if (isResultSet(result) && result.rows.length > 0) {
      return result.rows[0]['value'];
    } else if (isResultSetError(result)) {
      console.log(result.error);
    }
    return undefined;
  }

  public async deleteLongLivedData(key: string): Promise<void> {
    if (this.db === undefined) return;
    const result = (await this.db.execAsync(
      [{
        sql: `DELETE FROM ${longLivedDataTableName} WHERE key = ?`,
        args: [key],
      }],
      false
    ))[0];
    if (isResultSetError(result)) {
      console.log(result.error);
    }
  }
}

let storageManagerSingleton: StorageManagerImpl|undefined;

export async function getStorageManager(): Promise<StorageManager> {
  if (storageManagerSingleton === undefined) {
    storageManagerSingleton = new StorageManagerImpl();
    await storageManagerSingleton.initialize();
  }
  return storageManagerSingleton;
}


export class LongLivedDataStorage<D> {
  private all: Map<string, D> = new Map();
  private storageKeyPrefix: string;
  private storageManager: StorageManager;
  private serializer: (data: D) => string;
  private deserializer: (s: string) => D|undefined;
  private allKeysStorageKey: string;
  
  constructor(
    storageKeyPrefix: string,
    storageManager: StorageManager,
    serializer: (data: D) => string,
    deserializer: (s: string) => D|undefined,
  ) {
    this.storageKeyPrefix = storageKeyPrefix;
    this.storageManager = storageManager;
    this.serializer = serializer;
    this.deserializer = deserializer;
    this.allKeysStorageKey = `${this.storageKeyPrefix}:allKeys`;
  }

  private getDataStorageKey(key: string): string {
    return `${this.storageKeyPrefix}:data:${key}`;
  }

  async load(): Promise<void> {
    this.all.clear();
    const allKeys = await this.loadAllKeys();
    for (const key of allKeys) {
      const s = await this.storageManager.getLongLivedData(this.getDataStorageKey(key));
      if (s === undefined) {
        continue;
      }
      const parsed = this.deserializer(s);
      if (parsed === undefined) {
        continue;
      }
      this.all.set(key, parsed);
    }
  }

  private async loadAllKeys(): Promise<string[]> {
    const s = await this.storageManager.getLongLivedData(this.allKeysStorageKey);
    if (s === undefined) {
      return [];
    }
    return JSON.parse(s);
  }

  async get(key: string): Promise<D | undefined> {
    return this.all.get(key);
  }

  async getAll(): Promise<D[]> {
    return Array.from(this.all.values());
  }

  async store(key: string, data: D): Promise<void> {
    const isNewKey = !this.all.has(key);
    this.all.set(key, data);
    if (isNewKey) {
      await this.saveAllKeys();
    }
    await this.storageManager.storeLongLivedData(this.getDataStorageKey(key), this.serializer(data));
  }

  async delete(key: string): Promise<void> {
    this.all.delete(key);
    await this.saveAllKeys();
    await this.storageManager.deleteLongLivedData(this.getDataStorageKey(key));
  }

  private async saveAllKeys(): Promise<void> {
    const allKeys = Array.from(this.all.keys());
    await this.storageManager.storeLongLivedData(this.allKeysStorageKey, JSON.stringify(allKeys));
  }
}

export class EphemeralDataStorage<D> {
  private keyPrefix: string;
  private storageTTL: number;
  private storageManager: StorageManager;
  private serializer: (data: D) => string;
  private deserializer: (s: string) => D|undefined;

  /**
   * 
   * @param keyPrefix 
   * @param storageTTL - seconds
   */
  constructor(
    keyPrefix: string,
    storageTTL: number,
    storageManager: StorageManager,
    serializer: (data: D) => string,
    deserializer: (s: string) => D|undefined
  ) {
    this.keyPrefix = keyPrefix;
    this.storageTTL = storageTTL;
    this.storageManager = storageManager;
    this.serializer = serializer;
    this.deserializer = deserializer;
  }

  private getCompleteKey(key: string): string {
    return this.keyPrefix + key;
  }

  async get(key: string): Promise<{value: D, updatedAt: number} | undefined> {
    const s = await this.storageManager.getEphemeralDataWithUpdatedAt(this.getCompleteKey(key));
    if (s === undefined) {
      return undefined;
    }
    const value = this.deserializer(s.value);
    if (value === undefined) {
      return undefined;
    }
    return {value: value, updatedAt: s.updatedAt};
  }

  /**
   * 
   * @param key 
   * @returns - UNIX time
   */
  async getUpdatedAt(key: string): Promise<number | undefined> {
    return await this.storageManager.getUpdatedAt(this.getCompleteKey(key));
  }

  async store(key: string, data: D, now: number): Promise<void> {
    await this.storageManager.storeEphemeralData(this.getCompleteKey(key), this.serializer(data), now, this.storageTTL);
  }
}

export class Cache<D> {
  private cache: LibCache;
  private serializer: (data: D) => string;
  private deserializer: (s: string) => D|undefined;

  /**
   * 
   * @param cacheTTL - seconds
   * @param cacheMaxKeys
   */
  constructor(
    cacheTTL: number,
    cacheMaxKeys: number,
    serializer: (data: D) => string,
    deserializer: (s: string) => D|undefined
  ) {
    this.cache = new LibCache({
      namespace: 'socope-cache',
      policy: {
        stdTTL: cacheTTL,
        maxEntries: cacheMaxKeys,
      },
      backend: MemoryStore,
    });
    this.serializer = serializer;
    this.deserializer = deserializer;
  }

  /**
   * 
   * @param key 
   * @returns - stored data and the update time (UNIX time)
   */
  async get(key: string): Promise<{value: D|undefined} | undefined> {
    const serialized = await this.cache.get(key);
    if (serialized === undefined) {
      return undefined;
    } else if (serialized === 'undefined') {
      return {value: undefined};
    } else {
      return {value: this.deserializer(serialized)};
    }
  }

  async store(key: string, value: D|undefined): Promise<void> {
    const serialized = value === undefined ? 'undefined' : this.serializer(value);
    await this.cache.set(key, serialized);
  }
}

export class CachedStorage<D> {
  private storage: EphemeralDataStorage<D>;
  private cache: Cache<D>;

  constructor(storage: EphemeralDataStorage<D>, cache: Cache<D>) {
    this.storage = storage;
    this.cache = cache;
  }

  /**
   * 
   * @param key 
   * @returns - stored data and the update time (UNIX time)
   */
  async get(key: string): Promise<{value: D|undefined} | undefined> {
    const cached = await this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const stored = await this.storage.get(key);
    if (stored === undefined) {
      return undefined;
    }
    this.cache.store(key, stored.value);
    return {value: stored.value};
  }

  async store(key: string, value: D|undefined) {
    if (value !== undefined) {
      this.storage.store(key, value, getEpochSeconds());
    }
    this.cache.store(key, value);
  }
}
