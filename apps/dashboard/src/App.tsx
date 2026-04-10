import { BrowserRouter, Routes, Route } from "react-router";
import { Layout } from "./components/layout/Layout";
import { LeaderboardPage } from "./routes/LeaderboardPage";

function PlaceholderPage({ name }: { name: string }) {
  return <div style={{ color: "var(--text-secondary)" }}>{name} - Coming Soon</div>;
}

export function App() {
  return (
    <BrowserRouter basename="/dashboard">
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<LeaderboardPage />} />
          <Route path="m/:memberId" element={<PlaceholderPage name="Member Detail" />} />
          <Route path="m/:memberId/promotion/:windowCode" element={<PlaceholderPage name="Promotion Replay" />} />
          <Route path="status" element={<PlaceholderPage name="System Status" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
