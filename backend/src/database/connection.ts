import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database interface for abstraction
export interface DatabaseConnection {
  query(sql: string, params?: any[]): Promise<any[]>;
  run(sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid?: number }>;
  get(sql: string, params?: any[]): Promise<any>;
  close(): Promise<void>;
  transaction<T>(callback: () => Promise<T>): Promise<T>;
}

// SQLite implementation
class SQLiteConnection implements DatabaseConnection {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initializeSchema();
  }

  private initializeSchema() {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    this.db.exec(schema);
  }

  async query(sql: string, params: any[] = []): Promise<any[]> {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(params);
    } catch (error) {
      console.error('SQLite query error:', error);
      throw error;
    }
  }

  async run(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid?: number }> {
    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.run(params);
      return {
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid as number
      };
    } catch (error) {
      console.error('SQLite run error:', error);
      throw error;
    }
  }

  async get(sql: string, params: any[] = []): Promise<any> {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.get(params);
    } catch (error) {
      console.error('SQLite get error:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }

  async transaction<T>(callback: () => Promise<T>): Promise<T> {
    const transaction = this.db.transaction(callback);
    return transaction();
  }
}

// PostgreSQL implementation
class PostgreSQLConnection implements DatabaseConnection {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    this.initializeSchema();
  }

  private async initializeSchema() {
    try {
      const schemaPath = join(__dirname, 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf-8');
      // Convert SQLite schema to PostgreSQL
      const pgSchema = schema
        .replace(/AUTOINCREMENT/g, 'SERIAL')
        .replace(/DATETIME/g, 'TIMESTAMP')
        .replace(/BOOLEAN DEFAULT FALSE/g, 'BOOLEAN DEFAULT FALSE')
        .replace(/CURRENT_TIMESTAMP/g, 'NOW()');
      
      await this.pool.query(pgSchema);
    } catch (error) {
      console.error('PostgreSQL schema initialization error:', error);
      throw error;
    }
  }

  async query(sql: string, params: any[] = []): Promise<any[]> {
    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query(sql, params);
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('PostgreSQL query error:', error);
      throw error;
    }
  }

  async run(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid?: number }> {
    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query(sql, params);
        return {
          changes: result.rowCount || 0,
          lastInsertRowid: result.rows[0]?.id
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('PostgreSQL run error:', error);
      throw error;
    }
  }

  async get(sql: string, params: any[] = []): Promise<any> {
    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query(sql, params);
        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('PostgreSQL get error:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async transaction<T>(callback: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback();
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

// Database factory
export function createDatabaseConnection(): DatabaseConnection {
  const databaseUrl = process.env.DATABASE_URL || 'sqlite:./data/reviews.db';
  
  if (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://')) {
    return new PostgreSQLConnection(databaseUrl);
  } else if (databaseUrl.startsWith('sqlite:')) {
    const dbPath = databaseUrl.replace('sqlite:', '');
    // Ensure data directory exists
    mkdirSync(dirname(dbPath), { recursive: true });
    return new SQLiteConnection(dbPath);
  } else {
    throw new Error(`Unsupported database URL: ${databaseUrl}`);
  }
}

// Global database instance
let dbInstance: DatabaseConnection | null = null;

export function getDatabase(): DatabaseConnection {
  if (!dbInstance) {
    dbInstance = createDatabaseConnection();
  }
  return dbInstance;
}

export async function closeDatabaseConnection(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}