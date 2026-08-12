import { notFound } from "next/navigation";
import { loadProperty } from "../../../../lib/seed";

export const dynamic = "force-dynamic";

export default async function PropertyPage({ params }: { params: { file: string } }) {
  const property = await loadProperty(params.file);
  if (!property) notFound();
  return <main>{property.name}</main>;
}
