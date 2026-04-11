import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface DeadLetterEntry {
  id: string;
  cardType: string;
  messageId: string;
  reason: string;
  attempts: number;
  enqueuedAt: string;
  resolvedAt: string | null;
}

interface DeadLetterDbRow {
  id: string;
  card_type: string;
  message_id: string;
  reason: string;
  attempts: number;
  enqueued_at: string;
  resolved_at: string | null;
}

function toEntry(row: DeadLetterDbRow): DeadLetterEntry {
  return {
    id: row.id,
    cardType: row.card_type,
    messageId: row.message_id,
    reason: row.reason,
    attempts: row.attempts,
    enqueuedAt: row.enqueued_at,
    resolvedAt: row.resolved_at
  };
}

/**
 * Dead letter store for failed card patch operations.
 * Uses the feishu_card_patch_deadletters table (DDL managed by SqliteRepository).
 */
export class DeadLetterStore {
  constructor(private readonly db: Database.Database) {}

  insert(entry: Omit<DeadLetterEntry, "id" | "resolvedAt">): void {
    this.db
      .prepare(
        `INSERT INTO feishu_card_patch_deadletters
          (id, card_type, message_id, reason, attempts, enqueued_at, resolved_at)
          VALUES (?, ?, ?, ?, ?, ?, NULL)`
      )
      .run(
        randomUUID(),
        entry.cardType,
        entry.messageId,
        entry.reason,
        entry.attempts,
        entry.enqueuedAt
      );
  }

  listUnresolved(limit = 100): DeadLetterEntry[] {
    const rows = this.db
      .prepare<[number], DeadLetterDbRow>(
        `SELECT * FROM feishu_card_patch_deadletters
          WHERE resolved_at IS NULL
          ORDER BY enqueued_at ASC
          LIMIT ?`
      )
      .all(limit);
    return rows.map(toEntry);
  }

  resolve(id: string, resolvedAt: string): void {
    this.db
      .prepare(
        "UPDATE feishu_card_patch_deadletters SET resolved_at = ? WHERE id = ?"
      )
      .run(resolvedAt, id);
  }

  countUnresolved(): number {
    const row = this.db
      .prepare<[], { count: number }>(
        "SELECT COUNT(*) as count FROM feishu_card_patch_deadletters WHERE resolved_at IS NULL"
      )
      .get();
    return row?.count ?? 0;
  }
}
