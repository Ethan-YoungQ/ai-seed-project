export interface SyncResult {
  added: number;
  updated: number;
  totalInGroup: number;
  syncedAt: string;
}

export interface MemberSyncService {
  syncGroupMembers(chatId: string): Promise<SyncResult>;
  syncUserAvatars(openIds: string[]): Promise<void>;
}

export type MemberSyncTraceEntry =
  | { method: "syncGroupMembers"; chatId: string }
  | { method: "syncUserAvatars"; openIds: string[] };

export class StubMemberSyncService implements MemberSyncService {
  readonly trace: MemberSyncTraceEntry[] = [];

  async syncGroupMembers(chatId: string): Promise<SyncResult> {
    this.trace.push({ method: "syncGroupMembers", chatId });
    return {
      added: 0,
      updated: 0,
      totalInGroup: 0,
      syncedAt: new Date().toISOString()
    };
  }

  async syncUserAvatars(openIds: string[]): Promise<void> {
    this.trace.push({ method: "syncUserAvatars", openIds: [...openIds] });
  }
}
