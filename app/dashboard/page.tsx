import { auth } from "@/lib/auth";
import DashboardClient from "./client";

export default async function DashboardPage() {
  const session = await auth();
  const user = session?.user
    ? {
        id: session.user.id!,
        email: session.user.email!,
        name: session.user.name,
      }
    : null;

  return <DashboardClient user={user} />;
}
