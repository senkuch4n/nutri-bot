import { Card, PageHeader } from "@/components/ui";
import { AssistantChat } from "./assistant-chat";

export default function AsistentePage() {
  return (
    <div>
      <PageHeader
        title="Asistente"
        description="Consultas rápidas sobre tu agenda, tus pacientes o la facturación, con IA."
      />
      <Card>
        <AssistantChat />
      </Card>
    </div>
  );
}
