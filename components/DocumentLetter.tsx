import type { Employe, Enterprise } from "@/lib/data";
import { fmtDate } from "@/lib/format";

function civilite(genre: string): string {
  if (genre === "F") return "Madame";
  if (genre === "M") return "Monsieur";
  return "";
}

function today(): string {
  return new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function Letterhead({ enterprise }: { enterprise: Enterprise }) {
  return (
    <div className="mb-10 flex items-start justify-between border-b border-nb/10 pb-6">
      <div>
        {enterprise.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={enterprise.logoUrl} alt={enterprise.nom} className="mb-2 max-h-16 max-w-[180px] object-contain" />
        )}
        <div className="text-sm font-semibold text-nb">{enterprise.nom}</div>
        {enterprise.adresse && <div className="text-xs text-gm">{enterprise.adresse}</div>}
        {enterprise.rccm && <div className="text-xs text-gm">RCCM : {enterprise.rccm}</div>}
        {enterprise.taxpayerAccountNumber && (
          <div className="text-xs text-gm">N° contribuable : {enterprise.taxpayerAccountNumber}</div>
        )}
      </div>
    </div>
  );
}

function Signature({ enterprise }: { enterprise: Enterprise }) {
  return (
    <div className="mt-14 text-right text-sm text-nb">
      <div>Fait à Abidjan, le {today()}</div>
      <div className="mt-1 font-semibold">Pour {enterprise.nom}</div>
      <div>La Direction des Ressources Humaines</div>
    </div>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 text-justify text-[13px] leading-7 text-nb">{children}</div>;
}

/** Renders a printable HR letter — text varies by document type, letterhead
 * (logo/RCCM/address) varies by entité using live Neos enterprise data. No
 * pre-made file is stored; this is generated fresh from current Neos data
 * each time, then printed/saved as PDF by whoever requested it. */
export function DocumentLetter({
  typeDocument,
  employe,
  enterprise,
}: {
  typeDocument: string;
  employe: Employe;
  enterprise: Enterprise;
}) {
  const civ = civilite(employe.genre);
  const nomComplet = `${civ ? civ + " " : ""}${employe.fullname}`;

  if (typeDocument === "Attestation de travail") {
    return (
      <>
        <Letterhead enterprise={enterprise} />
        <div className="mb-8 text-center text-base font-bold uppercase tracking-wide text-nb">
          Attestation de travail
        </div>
        <Body>
          <p>
            Je soussigné(e), représentant {enterprise.nom}
            {enterprise.rccm ? `, RCCM ${enterprise.rccm}` : ""}
            {enterprise.adresse ? `, sise à ${enterprise.adresse}` : ""},
          </p>
          <p>
            Atteste que {nomComplet} est employé(e) au sein de notre société en qualité de{" "}
            <strong>{employe.fonction}</strong>
            {employe.dateEntree ? ` depuis le ${fmtDate(employe.dateEntree)}` : ""}, sous contrat{" "}
            {employe.contratType}.
          </p>
          <p>
            La présente attestation est délivrée à l&apos;intéressé(e) pour servir et valoir ce que
            de droit.
          </p>
        </Body>
        <Signature enterprise={enterprise} />
      </>
    );
  }

  if (typeDocument === "Certificat de travail") {
    return (
      <>
        <Letterhead enterprise={enterprise} />
        <div className="mb-8 text-center text-base font-bold uppercase tracking-wide text-nb">
          Certificat de travail
        </div>
        <Body>
          <p>
            Je soussigné(e), représentant {enterprise.nom}
            {enterprise.rccm ? `, RCCM ${enterprise.rccm}` : ""},
          </p>
          <p>
            Certifie que {nomComplet} a été employé(e) au sein de notre société
            {employe.dateEntree ? ` du ${fmtDate(employe.dateEntree)} à ce jour` : ""}, en qualité de{" "}
            <strong>{employe.fonction}</strong>.
          </p>
          <p>Ce certificat est établi pour servir et valoir ce que de droit.</p>
        </Body>
        <Signature enterprise={enterprise} />
      </>
    );
  }

  if (typeDocument === "Certificat/attestation de consultance") {
    return (
      <>
        <Letterhead enterprise={enterprise} />
        <div className="mb-8 text-center text-base font-bold uppercase tracking-wide text-nb">
          Attestation de consultance
        </div>
        <Body>
          <p>
            Je soussigné(e), représentant {enterprise.nom}
            {enterprise.rccm ? `, RCCM ${enterprise.rccm}` : ""}
            {enterprise.adresse ? `, sise à ${enterprise.adresse}` : ""},
          </p>
          <p>
            Atteste que {nomComplet} intervient auprès de notre structure en qualité de Consultant(e)
            — <strong>{employe.fonction}</strong> — dans le cadre d&apos;un contrat de consultance
            {employe.dateEntree ? ` depuis le ${fmtDate(employe.dateEntree)}` : ""}.
          </p>
          <p>
            La présente attestation est délivrée à l&apos;intéressé(e) pour servir et valoir ce que
            de droit.
          </p>
        </Body>
        <Signature enterprise={enterprise} />
      </>
    );
  }

  return (
    <>
      <Letterhead enterprise={enterprise} />
      <div className="mb-6 rounded-lg border border-wn/30 bg-[#FFF8EC] px-4 py-3 text-xs text-[#7A4A00] print:hidden">
        Aucun modèle prédéfini pour « {typeDocument} » — informations de référence ci-dessous, à
        rédiger manuellement.
      </div>
      <Body>
        <p>
          <strong>Collaborateur :</strong> {nomComplet}
        </p>
        <p>
          <strong>Fonction :</strong> {employe.fonction}
        </p>
        <p>
          <strong>Entité :</strong> {enterprise.nom}
        </p>
        {employe.dateEntree && (
          <p>
            <strong>Date d&apos;entrée :</strong> {fmtDate(employe.dateEntree)}
          </p>
        )}
      </Body>
    </>
  );
}
