import { useTranslation } from "react-i18next";

function PostGuidePage() {
  const { t } = useTranslation();
  return <h1>{t("postGuide.heading")}</h1>;
}

export default PostGuidePage;
