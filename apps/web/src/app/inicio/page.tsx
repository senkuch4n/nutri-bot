import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginScreen } from "@/components/login-screen";

export const dynamic = "force-dynamic";

export default async function InicioPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return <LoginScreen />;
}
