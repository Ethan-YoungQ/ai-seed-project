import { BrowserRouter, Routes, Route } from "react-router";
import { Layout } from "./components/layout/Layout";
import { LeaderboardPage } from "./routes/LeaderboardPage";
import { MemberDetailPage } from "./routes/MemberDetailPage";
import { PromotionReplayPage } from "./routes/PromotionReplayPage";
import { StatusPage } from "./routes/StatusPage";

export function App() {
  return (
    <BrowserRouter basename="/dashboard">
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<LeaderboardPage />} />
          <Route path="m/:memberId" element={<MemberDetailPage />} />
          <Route path="m/:memberId/promotion/:windowCode" element={<PromotionReplayPage />} />
          <Route path="status" element={<StatusPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
