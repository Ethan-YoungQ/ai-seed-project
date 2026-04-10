import type Database from "better-sqlite3";
import type { SqliteRepository } from "../../../storage/sqlite-repository.js";
import type { CardType, LiveCardRow } from "./types.js";

interface LiveCardDbRow {
  id: string;
  card_type: string;
  feishu_message_id: string;
  feishu_chat_id: string;
  camp_id: string;
  period_id: string | null;
  window_id: string | null;
  card_version: string;
  state_json: string;
  sent_at: string;
  last_patched_at: string | null;
  expires_at: string;
  closed_reason: string | null;
}

function toRow(row: LiveCardDbRow): LiveCardRow {
  return {
    id: row.id,
    cardType: row.card_type as CardType,
    feishuMessageId: row.feishu_message_id,
    feishuChatId: row.feishu_chat_id,
    campId: row.camp_id,
    periodId: row.period_id,
    windowId: row.window_id,
    cardVersion: row.card_version,
    stateJson: JSON.parse(row.state_json),
    sentAt: row.sent_at,
    lastPatchedAt: row.last_patched_at,
    expiresAt: row.expires_at,
    closedReason: (row.closed_reason as LiveCardRow["closedReason"]) ?? null
  };
}

export class LiveCardRepository {
  private readonly db: Database.Database;

  constructor(sqliteRepo: SqliteRepository) {
    this.db = (sqliteRepo as unknown as { db: Database.Database }).db;
  }

  insert(row: LiveCardRow): void {
    this.db.prepare(
      `INSERT INTO feishu_live_cards (
        id, card_type, feishu_message_id, feishu_chat_id, camp_id,
        period_id, window_id, card_version, state_json,
        sent_at, last_patched_at, expires_at, closed_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      row.id, row.cardType, row.feishuMessageId, row.feishuChatId, row.campId,
      row.periodId, row.windowId, row.cardVersion, JSON.stringify(row.stateJson),
      row.sentAt, row.lastPatchedAt, row.expiresAt, row.closedReason
    );
  }

  findActive(cardType: CardType, feishuChatId: string): LiveCardRow | null {
    const row = this.db.prepare<[string, string], LiveCardDbRow>(
      `SELECT * FROM feishu_live_cards
        WHERE card_type = ? AND feishu_chat_id = ? AND closed_reason IS NULL
        ORDER BY sent_at DESC LIMIT 1`
    ).get(cardType, feishuChatId);
    return row ? toRow(row) : null;
  }

  findById(id: string): LiveCardRow | null {
    const row = this.db.prepare<[string], LiveCardDbRow>(
      "SELECT * FROM feishu_live_cards WHERE id = ?"
    ).get(id);
    return row ? toRow(row) : null;
  }

  updateState(id: string, stateJson: unknown, patchedAt: string): void {
    this.db.prepare(
      `UPDATE feishu_live_cards SET state_json = ?, last_patched_at = ? WHERE id = ?`
    ).run(JSON.stringify(stateJson), patchedAt, id);
  }

  close(id: string, reason: LiveCardRow["closedReason"]): void {
    this.db.prepare("UPDATE feishu_live_cards SET closed_reason = ? WHERE id = ?")
      .run(reason, id);
  }

  listExpiringWithinDays(now: Date, days: number): LiveCardRow[] {
    const threshold = new Date(now.getTime() + days * 86400 * 1000).toISOString();
    const rows = this.db.prepare<[string], LiveCardDbRow>(
      `SELECT * FROM feishu_live_cards
        WHERE closed_reason IS NULL AND expires_at <= ?
        ORDER BY expires_at ASC`
    ).all(threshold);
    return rows.map(toRow);
  }

  withTransaction<T>(fn: () => T): T {
    const tx = this.db.transaction(fn);
    return tx();
  }
}
