import { useTranslation } from "react-i18next";

function RecipeDetailPage() {
  const { t } = useTranslation();
  return <h1>{t("recipeDetail.heading")}</h1>;
}

export default RecipeDetailPage;
