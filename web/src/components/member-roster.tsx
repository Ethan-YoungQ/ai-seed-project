import { startTransition } from "react";

import { updateMember } from "../lib/api";
import type { MemberEntry } from "../types";

interface MemberRosterProps {
  entries: MemberEntry[];
  onUpdated: () => Promise<void>;
}

export function MemberRoster({ entries, onUpdated }: MemberRosterProps) {
  async function toggleBoard(member: MemberEntry) {
    await updateMember(member.id, {
      isExcludedFromBoard: !member.isExcludedFromBoard
    });

    startTransition(() => {
      void onUpdated();
    });
  }

  async function toggleParticipant(member: MemberEntry) {
    await updateMember(member.id, {
      isParticipant: !member.isParticipant
    });

    startTransition(() => {
      void onUpdated();
    });
  }

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Member controls</p>
          <h2>成员白名单与排除</h2>
        </div>
        <p className="panel__hint">控制谁进入评估、谁从公共榜单隐藏</p>
      </div>

      <div className="member-roster">
        {entries.map((entry) => (
          <article key={entry.id} className="member-roster__card">
            <div>
              <p className="member-roster__name">{entry.name}</p>
              <p className="member-roster__meta">
                {entry.department} · {entry.roleType} · {entry.status}
              </p>
            </div>
            <div className="member-roster__actions">
              <button className="ghost-button" onClick={() => void toggleParticipant(entry)} type="button">
                {entry.isParticipant ? "移出参训" : "加入参训"}
              </button>
              <button className="ghost-button" onClick={() => void toggleBoard(entry)} type="button">
                {entry.isExcludedFromBoard ? "恢复上榜" : "从榜单排除"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
