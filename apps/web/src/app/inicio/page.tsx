import { AccessGateScreen } from "@/components/access-gate-screen";

export const dynamic = "force-dynamic";

export default async function InicioPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const { error } = await searchParams;
  return <AccessGateScreen signInError={error} />;
}
