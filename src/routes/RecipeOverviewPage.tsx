import { useParams } from "react-router";

function RecipeOverviewPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div>
      <h1>RecipeOverviewPage</h1>
      <p>id: {id}</p>
    </div>
  );
}

export default RecipeOverviewPage;
