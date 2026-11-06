// 本地存储：一个 SQLite 文件，默认放在 ./data/english.db（可用环境变量 DATA_DIR 改位置）。
// 使用 Node 自带的 node:sqlite，不需要额外安装数据库。
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Lesson } from '../app/cards';

const g = globalThis as unknown as { __englishDb?: DatabaseSync };

function open(): DatabaseSync {
  if (!g.__englishDb) {
    const dir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(path.join(dir, 'english.db'));
    db.exec('PRAGMA journal_mode=WAL');
    db.exec('CREATE TABLE IF NOT EXISTS lessons (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
    g.__englishDb = db;
  }
  return g.__englishDb;
}

export function listLessons(): Lesson[] {
  const rows = open().prepare('SELECT data FROM lessons').all() as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as Lesson);
}

export function getLessonRaw(id: string): string | undefined {
  const row = open().prepare('SELECT data FROM lessons WHERE id = ?').get(id) as { data: string } | undefined;
  return row?.data;
}

/** 覆盖保存（存在则更新）。 */
export function upsertLesson(lesson: Lesson): void {
  open()
    .prepare('INSERT INTO lessons (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
    .run(lesson.id, JSON.stringify(lesson));
}

/** 仅在 id 不存在时写入，返回是否真的写入了。导入用它，避免覆盖已有的复习进度。 */
export function insertIfAbsent(lesson: Lesson): boolean {
  const r = open().prepare('INSERT OR IGNORE INTO lessons (id, data) VALUES (?, ?)').run(lesson.id, JSON.stringify(lesson));
  return Number(r.changes) > 0;
}

/** 乐观更新：只有数据仍等于 oldRaw 时才写入，防止两个页面同时改。 */
export function swapLesson(id: string, oldRaw: string, next: Lesson): boolean {
  const r = open().prepare('UPDATE lessons SET data = ? WHERE id = ? AND data = ?').run(JSON.stringify(next), id, oldRaw);
  return Number(r.changes) > 0;
}
