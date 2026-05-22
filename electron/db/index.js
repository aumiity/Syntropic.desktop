import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { initializeSchema } from './schema';
import { seedDatabase } from './seed';
var db;
export function getDb() {
    if (!db) {
        var userDataPath = app.getPath('userData');
        var dbDir = path.join(userDataPath, 'database');
        if (!fs.existsSync(dbDir))
            fs.mkdirSync(dbDir, { recursive: true });
        var dbPath = path.join(dbDir, 'syntropic.db');
        db = new Database(dbPath);
        initializeSchema(db);
        seedDatabase(db);
    }
    return db;
}
export function closeDb() {
    if (db) {
        db.close();
        db = undefined;
    }
}
