import { PERMISSIONS_EXCEPTIONNELLES } from "@/lib/format";

/** Reference table shown when "Permission exceptionnelle" is selected as
 * motif — Art. 25 de la Convention collective interprofessionnelle. */
export function PermissionsExceptionnellesInfo() {
  return (
    <div className="rounded-lg border border-v/15 bg-gl p-2.5 text-[11px]">
      <div className="mb-1.5 font-semibold text-gd">Cas pris en compte (jours autorisés)</div>
      <ul className="flex flex-col gap-0.5">
        {PERMISSIONS_EXCEPTIONNELLES.map((p) => (
          <li key={p.cas} className="flex items-center justify-between gap-2">
            <span className="text-nb">{p.cas}</span>
            <span className="font-mono font-semibold text-v">{p.jours} j</span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 text-gm">
        Non déductibles des congés annuels, aucune retenue de salaire.
      </div>
    </div>
  );
}
