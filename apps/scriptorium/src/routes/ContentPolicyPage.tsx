import { useTranslation } from "react-i18next";

function ContentPolicyPage() {
  const { t } = useTranslation();
  return <h1>{t("contentPolicy.heading")}</h1>;
}

export default ContentPolicyPage;
