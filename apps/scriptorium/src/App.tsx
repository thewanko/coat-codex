import { Navigate, Route, Routes } from "react-router";
import AppShell from "./components/AppShell.tsx";
import FeedPage from "./routes/FeedPage.tsx";
import RecipeDetailPage from "./routes/RecipeDetailPage.tsx";
import PostGuidePage from "./routes/PostGuidePage.tsx";
import TermsPage from "./routes/TermsPage.tsx";
import ContentPolicyPage from "./routes/ContentPolicyPage.tsx";
import AdminPage from "./routes/AdminPage.tsx";

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<FeedPage />} />
        <Route path="/r/:id" element={<RecipeDetailPage />} />
        <Route path="/post-guide" element={<PostGuidePage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/content-policy" element={<ContentPolicyPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default App;
