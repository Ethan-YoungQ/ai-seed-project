import { useState } from "react";

import { previewAnnouncement, runAnnouncement } from "../lib/api";

interface AnnouncementPanelProps {
  onUpdated: () => Promise<void>;
}

export function AnnouncementPanel({ onUpdated }: AnnouncementPanelProps) {
  const [preview, setPreview] = useState("点击预览后显示本期双周榜单播报内容。");
  const [status, setStatus] = useState("尚未发送播报");

  async function handlePreview() {
    const data = await previewAnnouncement("biweekly_ranking");
    setPreview(data.text);
  }

  async function handleRun() {
    const result = await runAnnouncement("biweekly_ranking");
    setStatus(`播报已记录，状态：${result.status}`);
    await onUpdated();
  }

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Announcement lab</p>
          <h2>播报控制台</h2>
        </div>
        <p className="panel__hint">先预览文本，再写入公告记录并固化榜单快照</p>
      </div>

      <div className="announcement-card">
        <pre>{preview}</pre>
        <p>{status}</p>
        <div className="announcement-card__actions">
          <button className="ghost-button" onClick={() => void handlePreview()} type="button">
            预览播报
          </button>
          <button className="solid-button" onClick={() => void handleRun()} type="button">
            记录并发送
          </button>
        </div>
      </div>
    </section>
  );
}
