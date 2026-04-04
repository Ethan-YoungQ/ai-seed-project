interface TopNavProps {
  mode: "public" | "operator";
}

export function TopNav({ mode }: TopNavProps) {
  return (
    <nav className="top-nav">
      <div className="top-nav__brand">
        <span className="top-nav__eyebrow">Pfizer HBU</span>
        <strong>AI Bootcamp Signals</strong>
      </div>
      <div className="top-nav__links">
        <a className={mode === "public" ? "top-nav__link top-nav__link--active" : "top-nav__link"} href="/">
          公共看板
        </a>
        <a
          className={mode === "operator" ? "top-nav__link top-nav__link--active" : "top-nav__link"}
          href="/operator"
        >
          运营后台
        </a>
      </div>
    </nav>
  );
}
