import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import DashboardClient from "./client";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <DashboardClient user={{ id: session.user.id!, email: session.user.email!, name: session.user.name }} />;
}
