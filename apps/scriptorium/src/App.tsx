import { Navigate, Route, Routes } from "react-router";
import { PhotoSourceProvider } from "@coat-codex/recipe-ui";
import AppShell from "./components/AppShell.tsx";
import FeedPage from "./routes/FeedPage.tsx";
import RecipeDetailPage from "./routes/RecipeDetailPage.tsx";
import PostGuidePage from "./routes/PostGuidePage.tsx";
import TermsPage from "./routes/TermsPage.tsx";
import ContentPolicyPage from "./routes/ContentPolicyPage.tsx";
import PrivacyPage from "./routes/PrivacyPage.tsx";
import AdminPage from "./routes/AdminPage.tsx";

// scriptoriumの公開形式（PublishedRecipe）には工程写真・チップ写真が存在しないため、
// resolvePhotoUrlは常にnullを返す（技術計画v1 §5.2）。プレースホルダ/hex表示へ縮退する。
async function resolveNoPhoto(): Promise<string | null> {
  return null;
}

function App() {
  return (
    <PhotoSourceProvider resolvePhotoUrl={resolveNoPhoto}>
      <AppShell>
        <Routes>
          <Route path="/" element={<FeedPage />} />
          <Route path="/r/:id" element={<RecipeDetailPage />} />
          <Route path="/post-guide" element={<PostGuidePage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/content-policy" element={<ContentPolicyPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </PhotoSourceProvider>
  );
}

export default App;
