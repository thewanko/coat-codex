import { useParams } from "react-router";

function RecipeSetupPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div>
      <h1>RecipeSetupPage</h1>
      <p>id: {id}</p>
    </div>
  );
}

export default RecipeSetupPage;
