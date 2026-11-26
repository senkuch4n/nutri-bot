import { AuthCard } from "@/components/login-screen";
import { SubmitButton } from "@/components/submit-button";

const fieldClass = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-body";

export function OnboardingSignupForm({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const timeZones = Intl.supportedValuesOf("timeZone");

  return (
    <AuthCard>
      <h1 className="text-balance text-title-2">Configurá tu consultorio</h1>
      <form action={action} className="mt-6 space-y-4">
        <div>
          <label htmlFor="onboarding-clinic-name" className="text-body font-semibold">Nombre del consultorio</label>
          <input id="onboarding-clinic-name" name="name" autoComplete="organization" required className={fieldClass} />
        </div>
        <div>
          <label htmlFor="onboarding-professional-name" className="text-body font-semibold">Nombre profesional que querés mostrar</label>
          <input id="onboarding-professional-name" name="professionalName" autoComplete="name" required className={fieldClass} />
        </div>
        <div>
          <label htmlFor="onboarding-time-zone" className="text-body font-semibold">Zona horaria del consultorio</label>
          <select id="onboarding-time-zone" name="timeZone" defaultValue="" required className={fieldClass}>
            <option value="" disabled>Elegí una zona horaria</option>
            {timeZones.map((timeZone) => (
              <option key={timeZone} value={timeZone}>{timeZone.replaceAll("_", " ")}</option>
            ))}
          </select>
        </div>
        <SubmitButton size="lg" className="w-full" pendingLabel="Guardando…">Guardar y continuar</SubmitButton>
      </form>
    </AuthCard>
  );
}
