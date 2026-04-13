import { CSSProperties, useState } from "react";
import { Link } from "react-router";
import { LevelPill } from "../ui/LevelPill";
import { getLevelConfig } from "../../lib/levels";

interface MemberHeroProps {
  memberName: string;
  currentLevel: number;
  cumulativeAq: number;
  avatarUrl?: string;
}

export function MemberHero({ memberName, currentLevel, cumulativeAq, avatarUrl }: MemberHeroProps) {
  const config = getLevelConfig(currentLevel);
  const [avatarError, setAvatarError] = useState(false);

  const containerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "24px 0",
  };

  const backLinkStyle: CSSProperties = {
    fontFamily: "var(--font-display)",
    fontSize: "10px",
    color: "var(--text-secondary)",
    textDecoration: "none",
    letterSpacing: "0.05em",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  };

  const nameRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  };

  const avatarSize = 80;
  const showImage = avatarUrl && !avatarError;

  const avatarContainerStyle: CSSProperties = {
    width: avatarSize,
    height: avatarSize,
    minWidth: avatarSize,
    borderRadius: "50%",
    border: `3px solid ${config.color}`,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: showImage ? "transparent" : "var(--bg-elevated)",
    boxShadow: `0 0 12px ${config.color}66, 0 0 24px ${config.color}33`,
  };

  const avatarImgStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  };

  const avatarFallbackStyle: CSSProperties = {
    fontFamily: "var(--font-display)",
    fontSize: "30px",
    fontWeight: "bold",
    color: config.color,
    lineHeight: 1,
    userSelect: "none",
  };

  const nameStyle: CSSProperties = {
    fontFamily: "var(--font-display)",
    fontSize: "clamp(18px, 3.5vw, 28px)",
    color: "var(--text-primary)",
    letterSpacing: "0.04em",
    lineHeight: 1.4,
    wordBreak: "break-all",
  };

  const metaRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
  };

  const pillWrapStyle: CSSProperties = {
    transform: "scale(1.4)",
    transformOrigin: "left center",
  };

  const aqLabelStyle: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    color: "var(--text-secondary)",
    letterSpacing: "0.08em",
  };

  const aqValueStyle: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "clamp(34px, 6vw, 52px)",
    color: config.color,
    letterSpacing: "0.02em",
    textShadow: `0 0 16px ${config.color}, 0 0 32px ${config.color}66`,
    lineHeight: 1,
  };

  const aqBlockStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    marginLeft: "auto",
    alignItems: "flex-end",
  };

  return (
    <div style={containerStyle}>
      <Link to="/dashboard" style={backLinkStyle}>
        ← LEADERBOARD
      </Link>
      <div style={nameRowStyle}>
        <div style={avatarContainerStyle}>
          {showImage ? (
            <img
              src={avatarUrl}
              alt={memberName}
              style={avatarImgStyle}
              onError={() => setAvatarError(true)}
            />
          ) : (
            <span style={avatarFallbackStyle}>
              {memberName.charAt(0)}
            </span>
          )}
        </div>
        <h1 style={nameStyle}>{memberName}</h1>
      </div>
      <div style={metaRowStyle}>
        <span style={pillWrapStyle}>
          <LevelPill level={currentLevel} />
        </span>
        <div style={aqBlockStyle}>
          <span style={aqLabelStyle}>CUMULATIVE AQ</span>
          <span style={aqValueStyle}>{cumulativeAq.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}
