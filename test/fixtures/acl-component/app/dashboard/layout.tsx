import { requireAuth } from "../../lib/auth-utils";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  return <section data-user={session.user.email}>{children}</section>;
}
