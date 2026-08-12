import { notFound } from "next/navigation";
import { loadProperty, allFiles } from "../../../../lib/seed";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return allFiles().map((file) => ({ file }));
}

export default async function PropertyPage({ params }: { params: { file: string } }) {
  const property = await loadProperty(params.file);
  if (!property) notFound();
  return <main>{property.name}</main>;
}
