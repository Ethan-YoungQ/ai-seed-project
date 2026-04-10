import { Link } from "react-router";

export function NavBar() {
  return (
    <nav style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "1rem 2rem",
      borderBottom: "1px solid var(--border-glow)",
      fontFamily: "var(--font-display)",
      fontSize: "0.75rem",
    }}>
      <Link to="/" style={{ color: "var(--accent)", textDecoration: "none" }}>
        HBU AI 看板
      </Link>
      <span style={{ color: "var(--text-secondary)", fontSize: "0.6rem" }}>
        v1.0
      </span>
    </nav>
  );
}
