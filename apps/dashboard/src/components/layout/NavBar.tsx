import { Link } from "react-router";
import { CSSProperties } from "react";

export function NavBar() {
  const navStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.75rem 1.5rem",
    borderBottom: "1px solid var(--border-glow)",
    fontFamily: "var(--font-display)",
    fontSize: "0.75rem",
    position: "sticky",
    top: 0,
    background: "var(--bg-base)",
    zIndex: 100,
  };

  const logoStyle: CSSProperties = {
    color: "var(--accent)",
    textDecoration: "none",
    fontSize: "0.65rem",
  };

  const linksStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  };

  const statusLinkStyle: CSSProperties = {
    color: "var(--text-secondary)",
    textDecoration: "none",
    fontSize: "0.55rem",
    letterSpacing: "0.05em",
  };

  const versionStyle: CSSProperties = {
    color: "var(--text-secondary)",
    fontSize: "0.55rem",
  };

  return (
    <nav style={navStyle} aria-label="主导航">
      <Link to="/" style={logoStyle} aria-label="返回排行榜首页">
        HBU AI奇点玩家
      </Link>
      <div style={linksStyle}>
        <Link to="/status" style={statusLinkStyle} className="nav-version">
          STATUS
        </Link>
        <span style={versionStyle} className="nav-version">v1.0</span>
      </div>
    </nav>
  );
}
