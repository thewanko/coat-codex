import { useParams } from "react-router";

function PrintViewPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div>
      <h1>PrintViewPage</h1>
      <p>id: {id}</p>
    </div>
  );
}

export default PrintViewPage;
