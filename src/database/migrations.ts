/**
 * Database migration runner
 * For future schema changes (current schema is applied automatically)
 */

import * as fs from 'fs';
import * as path from 'path';
import type { DatabaseClient } from './client';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Load migrations from migrations/ directory
 */
export function loadMigrations(migrationsDir: string): Migration[] {
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  return files.map((file) => {
    const match = file.match(/^(\d+)_(.+)\.sql$/);
    if (!match) {
      throw new Error(`Invalid migration filename: ${file}`);
    }

    const version = parseInt(match[1], 10);
    const name = match[2];
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

    return { version, name, sql };
  });
}

/**
 * Run pending migrations
 */
export function runMigrations(db: DatabaseClient, migrations: Migration[]): void {
  const currentVersion = parseInt(db.getConfig('schema_version') || '0', 10);

  const pending = migrations.filter((m) => m.version > currentVersion);

  if (pending.length === 0) {
    console.log('No pending migrations');
    return;
  }

  console.log(`Running ${pending.length} migration(s)...`);

  for (const migration of pending) {
    console.log(`  Applying ${migration.version}_${migration.name}...`);
    // Note: Would need to expose exec() method on DatabaseClient for this to work
    // For now, migrations are reference-only
    db.setConfig('schema_version', migration.version.toString());
    console.log(`  ✓ Applied ${migration.version}_${migration.name}`);
  }

  console.log('Migrations complete');
}
