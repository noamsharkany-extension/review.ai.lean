import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
class SQLiteConnection {
    constructor(dbPath) {
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.initializeSchema();
    }
    initializeSchema() {
        const schemaPath = join(__dirname, 'schema.sql');
        const schema = readFileSync(schemaPath, 'utf-8');
        this.db.exec(schema);
    }
    async query(sql, params = []) {
        try {
            const stmt = this.db.prepare(sql);
            return stmt.all(params);
        }
        catch (error) {
            console.error('SQLite query error:', error);
            throw error;
        }
    }
    async run(sql, params = []) {
        try {
            const stmt = this.db.prepare(sql);
            const result = stmt.run(params);
            return {
                changes: result.changes,
                lastInsertRowid: result.lastInsertRowid
            };
        }
        catch (error) {
            console.error('SQLite run error:', error);
            throw error;
        }
    }
    async get(sql, params = []) {
        try {
            const stmt = this.db.prepare(sql);
            return stmt.get(params);
        }
        catch (error) {
            console.error('SQLite get error:', error);
            throw error;
        }
    }
    async close() {
        this.db.close();
    }
    async transaction(callback) {
        const transaction = this.db.transaction(callback);
        return transaction();
    }
}
class PostgreSQLConnection {
    constructor(connectionString) {
        this.pool = new Pool({
            connectionString,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });
        this.initializeSchema();
    }
    async initializeSchema() {
        try {
            const schemaPath = join(__dirname, 'schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            const pgSchema = schema
                .replace(/AUTOINCREMENT/g, 'SERIAL')
                .replace(/DATETIME/g, 'TIMESTAMP')
                .replace(/BOOLEAN DEFAULT FALSE/g, 'BOOLEAN DEFAULT FALSE')
                .replace(/CURRENT_TIMESTAMP/g, 'NOW()');
            await this.pool.query(pgSchema);
        }
        catch (error) {
            console.error('PostgreSQL schema initialization error:', error);
            throw error;
        }
    }
    async query(sql, params = []) {
        try {
            const client = await this.pool.connect();
            try {
                const result = await client.query(sql, params);
                return result.rows;
            }
            finally {
                client.release();
            }
        }
        catch (error) {
            console.error('PostgreSQL query error:', error);
            throw error;
        }
    }
    async run(sql, params = []) {
        try {
            const client = await this.pool.connect();
            try {
                const result = await client.query(sql, params);
                return {
                    changes: result.rowCount || 0,
                    lastInsertRowid: result.rows[0]?.id
                };
            }
            finally {
                client.release();
            }
        }
        catch (error) {
            console.error('PostgreSQL run error:', error);
            throw error;
        }
    }
    async get(sql, params = []) {
        try {
            const client = await this.pool.connect();
            try {
                const result = await client.query(sql, params);
                return result.rows[0];
            }
            finally {
                client.release();
            }
        }
        catch (error) {
            console.error('PostgreSQL get error:', error);
            throw error;
        }
    }
    async close() {
        await this.pool.end();
    }
    async transaction(callback) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback();
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
}
export function createDatabaseConnection() {
    const databaseUrl = process.env.DATABASE_URL || 'sqlite:./data/reviews.db';
    if (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://')) {
        return new PostgreSQLConnection(databaseUrl);
    }
    else if (databaseUrl.startsWith('sqlite:')) {
        const dbPath = databaseUrl.replace('sqlite:', '');
        const { mkdirSync } = require('fs');
        const { dirname } = require('path');
        mkdirSync(dirname(dbPath), { recursive: true });
        return new SQLiteConnection(dbPath);
    }
    else {
        throw new Error(`Unsupported database URL: ${databaseUrl}`);
    }
}
let dbInstance = null;
export function getDatabase() {
    if (!dbInstance) {
        dbInstance = createDatabaseConnection();
    }
    return dbInstance;
}
export async function closeDatabaseConnection() {
    if (dbInstance) {
        await dbInstance.close();
        dbInstance = null;
    }
}
//# sourceMappingURL=connection.js.map