import { Navigate, Route, Routes } from "react-router";
import HomePage from "./routes/HomePage.tsx";
import RecipeSetupPage from "./routes/RecipeSetupPage.tsx";
import RecipeOverviewPage from "./routes/RecipeOverviewPage.tsx";
import PartEditorPage from "./routes/PartEditorPage.tsx";
import PrintViewPage from "./routes/PrintViewPage.tsx";
import TermsPage from "./routes/TermsPage.tsx";

function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/recipe/:id/setup" element={<RecipeSetupPage />} />
      <Route path="/recipe/:id" element={<RecipeOverviewPage />} />
      {/* /part/base must be defined before /part/:partId (see 技術計画 v2.2 §3.1) */}
      <Route
        path="/recipe/:id/part/base"
        element={<PartEditorPage isBaseMode />}
      />
      <Route path="/recipe/:id/part/:partId" element={<PartEditorPage />} />
      <Route path="/recipe/:id/print" element={<PrintViewPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default AppRouter;
