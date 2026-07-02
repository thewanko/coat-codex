import { useParams } from "react-router";

interface PartEditorPageProps {
  isBaseMode?: boolean;
}

function PartEditorPage({ isBaseMode = false }: PartEditorPageProps) {
  const { id, partId } = useParams<{ id: string; partId?: string }>();

  return (
    <div>
      <h1>{isBaseMode ? "PartEditor (base mode)" : "PartEditor"}</h1>
      <p>id: {id}</p>
      {!isBaseMode && <p>partId: {partId}</p>}
    </div>
  );
}

export default PartEditorPage;
