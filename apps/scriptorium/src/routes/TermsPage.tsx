import { useTranslation } from "react-i18next";

function TermsPage() {
  const { t } = useTranslation();
  return <h1>{t("terms.heading")}</h1>;
}

export default TermsPage;
