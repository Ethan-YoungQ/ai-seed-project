import { CSSProperties, ReactNode, useState } from "react";

interface NeonCardProps {
  children: ReactNode;
  glowColor?: string;
  onClick?: () => void;
  style?: CSSProperties;
}

export function NeonCard({ children, glowColor = "#2a2a5a", onClick, style }: NeonCardProps) {
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

  return (
    <div
      style={baseStyle}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </div>
  );
}
