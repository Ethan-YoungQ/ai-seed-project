import { CSSProperties } from "react";

interface ChecklistItem {
  label: string;
  met: boolean;
  detail?: string;
}

interface ConditionChecklistProps {
  reason: string;
}

function parseChecklistItems(reason: string): ChecklistItem[] | null {
  try {
    const parsed: unknown = JSON.parse(reason);
    if (!Array.isArray(parsed)) return null;
    const items = parsed as unknown[];
    const validated = items.map((item) => {
      if (typeof item !== "object" || item === null) return null;
      const obj = item as Record<string, unknown>;
      if (typeof obj.label !== "string") return null;
      return {
        label: obj.label,
        met: Boolean(obj.met),
        detail: typeof obj.detail === "string" ? obj.detail : undefined,
      };
    });
    if (validated.some((v) => v === null)) return null;
    return validated as ChecklistItem[];
  } catch {
    return null;
  }
}

function ChecklistView({ items }: { items: ChecklistItem[] }) {
  const listStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  };

  return (
    <div style={listStyle}>
      {items.map((item, idx) => {
        const rowStyle: CSSProperties = {
          display: "flex",
          alignItems: "flex-start",
          gap: "10px",
          padding: "10px 12px",
          background: item.met ? "#22c55e10" : "#ff2d7810",
          border: `1px solid ${item.met ? "#22c55e40" : "#ff2d7840"}`,
          borderRadius: "6px",
        };

        const iconStyle: CSSProperties = {
          fontSize: "14px",
          flexShrink: 0,
          marginTop: "1px",
        };

        const textColStyle: CSSProperties = {
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        };

        const labelStyle: CSSProperties = {
          fontSize: "11px",
          fontFamily: "var(--font-mono)",
          color: "var(--text-primary)",
          lineHeight: 1.5,
        };

        const detailStyle: CSSProperties = {
          fontSize: "10px",
          fontFamily: "var(--font-mono)",
          color: "var(--text-secondary)",
          lineHeight: 1.4,
        };

        return (
          <div key={idx} style={rowStyle}>
            <span style={iconStyle}>{item.met ? "✅" : "❌"}</span>
            <div style={textColStyle}>
              <span style={labelStyle}>{item.label}</span>
              {item.detail && <span style={detailStyle}>{item.detail}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlainTextView({ text }: { text: string }) {
  const style: CSSProperties = {
    fontSize: "12px",
    fontFamily: "var(--font-mono)",
    color: "var(--text-primary)",
    lineHeight: 1.7,
    padding: "16px",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-glow)",
    borderRadius: "6px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  return <div style={style}>{text}</div>;
}

export function ConditionChecklist({ reason }: ConditionChecklistProps) {
  const titleStyle: CSSProperties = {
    fontSize: "10px",
    fontFamily: "var(--font-display)",
    color: "var(--text-secondary)",
    letterSpacing: "0.1em",
    marginBottom: "12px",
    textTransform: "uppercase",
  };

  const items = parseChecklistItems(reason);

  return (
    <section>
      <p style={titleStyle}>变动条件</p>
      {items !== null ? (
        <ChecklistView items={items} />
      ) : (
        <PlainTextView text={reason} />
      )}
    </section>
  );
}
