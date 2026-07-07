import { PhotoSourceProvider } from "@coat-codex/recipe-ui";
import { resolvePhotoUrl } from "./db/photoStore";
import AppRouter from "./router.tsx";

function App() {
  return (
    <PhotoSourceProvider resolvePhotoUrl={resolvePhotoUrl}>
      <AppRouter />
    </PhotoSourceProvider>
  );
}

export default App;
