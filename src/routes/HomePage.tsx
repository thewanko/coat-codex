import { useTranslation } from "react-i18next";

function HomePage() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t("app.title")}</h1>
    </div>
  );
}

export default HomePage;
