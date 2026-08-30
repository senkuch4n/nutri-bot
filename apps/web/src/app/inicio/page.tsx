import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { CornerTriangle, Eyebrow, GoogleG, Wordmark } from "@/components/brand";

export const dynamic = "force-dynamic";

const features = [
  {
    title: "Reservas por WhatsApp, 24/7",
    body: "El paciente escribe “turno”, ve los horarios libres y reserva sin que muevas un dedo.",
    icon: ChatIcon,
  },
  {
    title: "Cancelaciones autogestionadas",
    body: "Cancela desde el mismo chat. El horario se libera al instante y a vos te llega el aviso.",
    icon: XCircleIcon,
  },
  {
    title: "Precios siempre a mano",
    body: "El bot responde con tus servicios y precios actualizados. Los editás desde el panel.",
    icon: TagIcon,
  },
  {
    title: "Tu calendario, ordenado",
    body: "Todos los turnos en una vista semanal. Cargá turnos manuales y marcá asistencias.",
    icon: CalendarIcon,
  },
  {
    title: "Recordatorios automáticos",
    body: "Cada paciente recibe el recordatorio antes del turno. Menos ausencias, sin trabajo extra.",
    icon: BellIcon,
  },
  {
    title: "Google Calendar sincronizado",
    body: "Los turnos confirmados aparecen en tu Google Calendar de una sola vía.",
    icon: SyncIcon,
  },
];

export default async function InicioPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="min-h-screen bg-mint">
      {/* Barra superior */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Wordmark />
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="press border-2 border-ink px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink transition-colors hover:bg-ink hover:text-white">
            Entrar
          </button>
        </form>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Decoración geométrica */}
        <div
          className="pointer-events-none absolute -right-24 -top-28 hidden h-[26rem] w-[26rem] rounded-full bg-leaf-bright md:block"
          aria-hidden
        />
        <svg
          className="pointer-events-none absolute bottom-0 right-0 hidden h-56 w-56 md:block"
          viewBox="0 0 100 100"
          aria-hidden
        >
          <path d="M100 100 V16 L16 100 Z" fill="#5aa832" />
        </svg>
        <div
          className="pointer-events-none absolute right-[22%] top-40 hidden h-40 w-40 rounded-full border-2 border-leaf-deep/40 lg:block"
          aria-hidden
        />

        <div className="relative z-10 mx-auto max-w-5xl px-6 pb-20 pt-16 sm:pt-24">
          <div className="max-w-2xl">
            <div className="reveal">
              <Eyebrow>Turnos por WhatsApp, sin planillas</Eyebrow>
            </div>
            <h1
              className="reveal font-display mt-6 text-5xl font-bold leading-[0.98] text-ink sm:text-6xl"
              style={{ animationDelay: "70ms" }}
            >
              El consultorio
              <br />
              que se agenda solo.
            </h1>
            <p
              className="reveal mt-7 max-w-lg text-lg leading-relaxed text-ink-soft"
              style={{ animationDelay: "140ms" }}
            >
              NutriBot atiende los mensajes de tus pacientes por WhatsApp y te deja el panel para lo
              importante: acompañarlos.
            </p>
            <div
              className="reveal mt-9 flex flex-wrap items-center gap-4"
              style={{ animationDelay: "210ms" }}
            >
              <form
                action={async () => {
                  "use server";
                  await signIn("google", { redirectTo: "/" });
                }}
              >
                <button className="press flex items-center gap-3 border-2 border-ink bg-white px-6 py-4 text-sm font-semibold uppercase tracking-[0.08em] text-ink transition-colors hover:border-leaf hover:bg-leaf-tint">
                  <GoogleG />
                  Entrar con Google
                </button>
              </form>
              <span className="text-xs text-ink-faint">Solo para cuentas autorizadas.</span>
            </div>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="border-y border-line bg-paper">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <Eyebrow>Cómo funciona</Eyebrow>
          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <Step
              n="01"
              title="Tus pacientes, por WhatsApp"
              body="Escriben una palabra clave y el bot los guía: ven horarios, servicios y precios, y reservan o cancelan solos. Reciben confirmación y recordatorio automáticos. El bot ignora todo lo demás, así que tu número sigue siendo tuyo."
            />
            <Step
              n="02"
              title="Vos, desde el panel"
              body="Calendario con todos los turnos, servicios y precios editables, disponibilidad semanal visual, cola de avisos y sincronización con Google Calendar. Entrás con tu cuenta de Google."
            />
          </div>
        </div>
      </section>

      {/* Qué incluye */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <Eyebrow>Todo lo que hace</Eyebrow>
        <h2 className="font-display mt-4 text-3xl font-bold tracking-tight text-ink">
          Menos ida y vuelta, más pacientes atendidos.
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <article
              key={f.title}
              className="flex h-full flex-col border border-line bg-paper p-5 transition-colors hover:border-leaf"
            >
              <f.icon />
              <h3 className="font-display mt-4 text-base font-bold text-ink">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="relative overflow-hidden border-t border-line bg-paper">
        <CornerTriangle />
        <div className="relative z-10 mx-auto max-w-5xl px-6 py-16 text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            ¿Lista para dejar de agendar a mano?
          </h2>
          <form
            className="mt-8 inline-block"
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <button className="press flex items-center gap-3 border-2 border-ink bg-ink px-7 py-4 text-sm font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-transparent hover:text-ink">
              <GoogleG />
              Entrar con Google
            </button>
          </form>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-6 py-10 text-center text-xs text-ink-faint">
        NutriBot · gestión de turnos para nutricionistas
      </footer>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="border-l-2 border-leaf pl-5">
      <span className="font-display text-sm font-bold text-leaf-deep">{n}</span>
      <h3 className="font-display mt-1 text-xl font-bold text-ink">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">{body}</p>
    </div>
  );
}

/* --- Iconos (línea, sin dependencias) --- */

function iconClass() {
  return "h-7 w-7 text-leaf-deep";
}
function ChatIcon() {
  return (
    <svg className={iconClass()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l.9-5.4A8 8 0 1 1 21 12Z" strokeLinejoin="round" />
    </svg>
  );
}
function XCircleIcon() {
  return (
    <svg className={iconClass()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" strokeLinecap="round" />
    </svg>
  );
}
function TagIcon() {
  return (
    <svg className={iconClass()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 4h8l8 8-8 8-8-8V4Z" strokeLinejoin="round" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg className={iconClass()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="5" width="18" height="16" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg className={iconClass()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2ZM10 20a2 2 0 0 0 4 0" strokeLinejoin="round" />
    </svg>
  );
}
function SyncIcon() {
  return (
    <svg className={iconClass()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 12a8 8 0 0 1 13.7-5.7L20 8M20 4v4h-4M20 12a8 8 0 0 1-13.7 5.7L4 16M4 20v-4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
