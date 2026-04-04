import { startTransition } from "react";

import { reviewCandidate } from "../lib/api";
import type { OperatorSubmissionEntry } from "../types";

interface OperatorSubmissionsProps {
  entries: OperatorSubmissionEntry[];
  onUpdated: () => Promise<void>;
}

export function OperatorSubmissions({ entries, onUpdated }: OperatorSubmissionsProps) {
  async function markValid(entry: OperatorSubmissionEntry) {
    await reviewCandidate(entry.candidateId, {
      action: "override_score",
      reviewer: "operator-ui",
      note: "运营后台兜底判定为有效提交",
      override: {
        finalStatus: "valid",
        baseScore: 5,
        processScore: 2,
        qualityScore: 1,
        communityBonus: 0
      }
    });

    startTransition(() => {
      void onUpdated();
    });
  }

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Review queue</p>
          <h2>提交复核</h2>
        </div>
        <p className="panel__hint">查看候选提交并执行运营兜底判分</p>
      </div>

      <div className="operator-list">
        {entries.map((entry) => (
          <article className="operator-list__row" key={entry.candidateId}>
            <div>
              <strong>{entry.memberName}</strong>
              <p>
                {entry.sessionTitle} · {entry.department} · {entry.finalStatus}
              </p>
            </div>
            <div className="operator-list__actions">
              <span className="operator-list__score">{entry.totalScore} 分</span>
              <button className="ghost-button" onClick={() => void markValid(entry)} type="button">
                兜底判有效
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
