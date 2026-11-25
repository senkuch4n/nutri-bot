"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TEAM_TEXT as T, type MembershipRole } from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { GroupedList, GroupedListRow } from "@/components/grouped-list";
import { Badge, Button, SectionLabel } from "@/components/ui";
import { notify } from "@/lib/notify";
import { removeTeamMemberAction } from "./team-actions";

/** Solo datos planos desde el server component (T9a): la fecha ya formateada en la zona de la profesional. */
export type TeamMemberView = { userId: string; email: string; role: MembershipRole; sinceLabel: string; isSelf: boolean };

/**
 * HU-025 (9.2): Ajustes → Equipo, solo para la responsable. Lista agrupada con email, alta y rol; en las
 * demás filas, "Quitar acceso" con confirmación destructiva. La fila desaparece al confirmar (y el servidor
 * revalida /ajustes); si el servidor rechaza, vuelve. Alta e invitaciones quedan para HU-026 (por soporte).
 */
export function TeamSection({ members }: { members: TeamMemberView[] }) {
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const visible = members.filter((m) => !removed.has(m.userId));

  return (
    <div>
      <SectionLabel>{T.sectionLabel}</SectionLabel>
      <GroupedList footer={T.footer}>
        {visible.map((member) => (
          <GroupedListRow
            key={member.userId}
            label={<span className="block truncate" title={member.email} translate="no">{member.email}</span>}
            description={T.since(member.sinceLabel)}
            accessory={
              <span className="flex items-center gap-2">
                <Badge tone={member.role === "OWNER" ? "info" : "neutral"}>{T.roleLabel[member.role]}</Badge>
                {member.isSelf ? (
                  <Badge>{T.you}</Badge>
                ) : (
                  <RemoveMemberButton
                    member={member}
                    onRemoved={(id) => setRemoved((prev) => new Set(prev).add(id))}
                    onRestored={(id) =>
                      setRemoved((prev) => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                      })
                    }
                  />
                )}
              </span>
            }
          />
        ))}
      </GroupedList>
    </div>
  );
}

function RemoveMemberButton({
  member,
  onRemoved,
  onRestored,
}: {
  member: TeamMemberView;
  onRemoved: (userId: string) => void;
  onRestored: (userId: string) => void;
}) {
  const confirm = useConfirm();
  const router = useRouter();
  const [pending, start] = useTransition();

  async function handleClick() {
    if (pending) return;
    const ok = await confirm({
      title: T.confirmTitle(member.email),
      description: T.confirmBody,
      confirmLabel: T.remove,
      cancelLabel: T.cancel,
      destructive: true,
    });
    if (!ok) return;
    start(async () => {
      const data = new FormData();
      data.set("userId", member.userId);
      onRemoved(member.userId);
      try {
        const result = await removeTeamMemberAction(null, data);
        if (result.ok) {
          notify.saved(T.removed(member.email));
          return;
        }
        onRestored(member.userId);
        notify.error(result.error);
        if (result.reauth) router.replace("/inicio");
      } catch {
        onRestored(member.userId);
        notify.error(T.genericError);
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      loading={pending}
      onClick={handleClick}
      aria-label={`${T.remove}: ${member.email}`}
      className="min-h-11 text-destructive"
    >
      {T.remove}
    </Button>
  );
}
