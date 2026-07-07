import { useTranslation } from "react-i18next";

function AdminPage() {
  const { t } = useTranslation();
  return <h1>{t("admin.heading")}</h1>;
}

export default AdminPage;
