import { Outlet } from "react-router";
import { NavBar } from "./NavBar";
import { CrtOverlay } from "./CrtOverlay";

export function Layout() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <NavBar />
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
        <Outlet />
      </main>
      <CrtOverlay />
    </div>
  );
}
