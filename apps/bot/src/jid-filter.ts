/**
 * Chats de WhatsApp que el bot no atiende: grupos, estados, listas de difusión y canales
 * (`@newsletter`, ids `120363…`). Sus mensajes no son de pacientes y no deben crear un `Patient`.
 */
export function isIgnoredJid(jid: string): boolean {
  if (!jid) return true;
  return (
    jid.endsWith("@g.us") ||
    jid.endsWith("@broadcast") ||
    jid.endsWith("@newsletter")
  );
}
