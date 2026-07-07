import { useTranslation } from "react-i18next";

function FeedPage() {
  const { t } = useTranslation();
  return <h1>{t("feed.heading")}</h1>;
}

export default FeedPage;
