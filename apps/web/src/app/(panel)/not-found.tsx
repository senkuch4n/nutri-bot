import { SearchX } from "lucide-react";
import { StatusScreen } from "@/components/status-screen";
import { ButtonLink } from "@/components/ui";

/** Lo usan los `notFound()` de las páginas de detalle del panel, dentro del shell. */
export default function PanelNotFound() {
  return (
    <StatusScreen
      icon={SearchX}
      title="No encontramos esta página"
      description="Puede que el enlace esté mal o que lo que buscabas ya no exista."
      actions={<ButtonLink href="/">Volver al calendario</ButtonLink>}
    />
  );
}
