import { CSSProperties, ReactNode, useState, KeyboardEvent } from "react";

interface NeonCardProps {
  children: ReactNode;
  glowColor?: string;
  onClick?: () => void;
  style?: CSSProperties;
  ariaLabel?: string;
}

export function NeonCard({ children, glowColor = "#2a2a5a", onClick, style, ariaLabel }: NeonCardProps) {
  const [hovered, setHovered] = useState(false);

  const baseStyle: CSSProperties = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-glow)",
    borderRadius: "8px",
    padding: "1rem",
    transition: "transform 0.2s, box-shadow 0.2s",
    cursor: onClick ? "pointer" : "default",
    transform: hovered ? "translateY(-2px)" : "translateY(0)",
    boxShadow: hovered ? `0 0 12px ${glowColor}` : "none",
    ...style,
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (onClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      style={baseStyle}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={ariaLabel}
      onKeyDown={onClick ? handleKeyDown : undefined}
    >
      {children}
    </div>
  );
}
