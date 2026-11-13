import { AssistantChat } from "./assistant-chat";

export const dynamic = "force-dynamic";

/** Nombre de la variable que usa `lib/deepseek.ts`. Solo se muestra detrás de "Ver detalle técnico". */
const KEY_ENV_NAME = "API_KEY_IA_DEEPSEEK";

export default function AsistentePage() {
  // Solo un booleano y un texto llegan al cliente (nunca la clave).
  const available = Boolean(process.env[KEY_ENV_NAME]);
  return (
    <div className="mx-auto max-w-3xl">
      <AssistantChat available={available} keyEnvName={KEY_ENV_NAME} />
    </div>
  );
}
