import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { initializeSchema } from './schema'
import { seedDatabase } from './seed'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    const userDataPath = app.getPath('userData')
    const dbDir = path.join(userDataPath, 'database')
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
    const dbPath = path.join(dbDir, 'syntropic.db')
    db = new Database(dbPath)
    initializeSchema(db)
    seedDatabase(db)
  }
  return db
}

export function closeDb() {
  if (db) {
    db.close()
    db = undefined as unknown as Database.Database
  }
}
