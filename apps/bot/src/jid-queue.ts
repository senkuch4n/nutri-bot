// HU-012 (D14): los mensajes de un mismo contacto se procesan de a uno, en orden.

const tails = new Map<string, Promise<unknown>>();

/**
 * Corre `task` después de las tareas anteriores del MISMO jid (FIFO). Distintos jids corren en
 * paralelo. Un error de una tarea se propaga a SU llamador pero no corta la cadena. Cuando la
 * cola de un jid queda vacía, se borra del Map (no crece sin límite).
 */
export function runSerialByJid<T>(jid: string, task: () => Promise<T>): Promise<T> {
  const prev = tails.get(jid) ?? Promise.resolve();
  const result = prev.then(task, task);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  tails.set(jid, tail);
  void tail.then(() => {
    if (tails.get(jid) === tail) tails.delete(jid);
  });
  return result;
}

/** SOLO tests: cantidad de jids con cola viva. */
export function __queueSizeForTests(): number {
  return tails.size;
}
