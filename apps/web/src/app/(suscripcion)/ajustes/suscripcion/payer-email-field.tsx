// HU-029b (G3 refutada → D8a): "Email de tu cuenta de Mercado Pago". MP exige payer_email y rechaza un email
// que no es de un usuario de MP; el error de la acción se muestra en el campo (además del toast).
import { SUBSCRIPTION_TEXT as T } from "@nutri-bot/core";
import { Field, Input } from "@/components/ui";

export function PayerEmailField({
  value,
  onChange,
  error,
  hint = T.payerEmailHelp,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <Field label={T.payerEmailLabel} hint={hint} error={error ?? undefined}>
      <Input
        type="email"
        name="payerEmail"
        required
        autoComplete="email"
        inputMode="email"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        disabled={disabled}
        className="max-w-md"
      />
    </Field>
  );
}
