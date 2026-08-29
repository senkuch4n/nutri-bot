import "server-only";
export { getProfessional } from "@nutri-bot/db/domain";

import type { getProfessional as _g } from "@nutri-bot/db/domain";
export type Professional = Awaited<ReturnType<typeof _g>>;
