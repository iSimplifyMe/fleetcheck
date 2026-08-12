import { redirect } from "next/navigation";
import { isLocked } from "../../../lib/seed";

export default async function SettingsPage() {
  if (await isLocked()) redirect("/portfolio");
  return <main>Settings</main>;
}
