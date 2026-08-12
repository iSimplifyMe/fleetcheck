import { allAnalytics, loadAnalytics } from "../../../lib/analytics";

export function generateStaticParams() {
  return allAnalytics().map((id) => ({ id }));
}

export default async function ReportPage() {
  const report = await loadAnalytics("latest");
  return <main>{report.title}</main>;
}
