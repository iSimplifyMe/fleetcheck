import { loadPortfolio } from "../../../lib/seed";

export default async function PortfolioPage() {
  const rows = await loadPortfolio();
  return <main>{rows.length} properties</main>;
}
