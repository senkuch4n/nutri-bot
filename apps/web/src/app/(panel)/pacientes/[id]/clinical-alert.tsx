export function ClinicalAlert({ background }: { background: string }) {
  return (
    <div className="flex items-start gap-3 border-2 border-amber-400 bg-amber-50 px-4 py-3">
      <span aria-hidden className="mt-0.5 text-lg">
        ⚠️
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-amber-800">
          Antecedentes a tener en cuenta
        </p>
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-amber-900">{background}</p>
      </div>
    </div>
  );
}
