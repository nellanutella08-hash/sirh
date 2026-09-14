import type { Employe, Enterprise } from "@/lib/data";
import type { EntiteLegalInfo, DocumentRequest } from "@/lib/db";
import { fmtDate, fmtFCFA } from "@/lib/format";
import { documentTypeColors } from "@/components/Badge";

function civilite(genre: string): string {
  if (genre === "F") return "Madame";
  if (genre === "M") return "Monsieur";
  return "";
}

function today(): string {
  return new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function fmtNombre(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n);
}

/** Static brand logos bundled with the app (extracted from the real Word
 * templates) — used only as a fallback when Neos itself has no logo
 * uploaded for the entité (enterprise.logoUrl). */
function staticLogoFor(nom: string): string | null {
  if (/SWANTECH|SWAN TECH/i.test(nom)) return "/logos/swantech.jpeg";
  if (/SYNERTECH/i.test(nom)) return "/logos/synertech.png";
  if (/SYNELIA/i.test(nom)) return "/logos/synelia.png";
  return null;
}

/** Scanned company cachets (rubber stamps), one per entité — used for the
 * "numérique" signing mode so a letter can be finalized without printing,
 * stamping and scanning it by hand. Matched by entité name the same way as
 * staticLogoFor; an entité with no known cachet just gets none. */
function staticCachetFor(nom: string): string | null {
  if (/SWANPRO/i.test(nom)) return "/cachets/swanpro.png";
  if (/SWANTECH|SWAN TECH/i.test(nom)) return "/cachets/swantech.png";
  if (/SYNERTECH/i.test(nom)) return "/cachets/synertech.png";
  if (/K-?S[\s-]?SERVICES?/i.test(nom)) return "/cachets/ks-services.png";
  if (/BURKINA/i.test(nom)) return "/cachets/synelia-burkina.png";
  if (/SYNELIA/i.test(nom)) return "/cachets/synelia-group-afrique.png";
  return null;
}

const DEFAULT_SIGNATURE_IMG = "/signatures/rh-default.png";

/** Logo only, top of the page — the legal identity block (capital, RCCM,
 * adresse...) lives in the body's opening paragraph and the pied de page
 * below, matching the real templates rather than repeating it up here. */
function Letterhead({ enterprise }: { enterprise: Enterprise }) {
  const logo = enterprise.logoUrl || staticLogoFor(enterprise.nom);
  if (!logo) return null;
  return (
    <div className="mb-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} alt={enterprise.nom} className="max-h-14 max-w-[160px] object-contain" />
    </div>
  );
}

export type SignatureMode = "numerique" | "papier";

function Signature({
  enterprise,
  legal,
  mode,
}: {
  enterprise: Enterprise;
  legal: EntiteLegalInfo | null;
  mode: SignatureMode;
}) {
  const cachet = mode === "numerique" ? staticCachetFor(enterprise.nom) : null;

  return (
    <div className="mt-14 text-right text-sm text-nb">
      <div>Fait à {legal?.villeSignature || "Abidjan"}, le {today()}</div>
      <div className="mt-10 font-semibold">{legal?.signataireTitre || "Ressources Humaines"}</div>
      {mode === "numerique" ? (
        <div className="relative ml-auto mt-2 h-44 w-[300px]">
          {cachet && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cachet}
              alt="Cachet"
              className="absolute left-0 top-1/2 z-0 h-44 w-44 -translate-y-1/2 -rotate-6 object-contain opacity-90"
            />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={DEFAULT_SIGNATURE_IMG}
            alt="Signature"
            className="absolute right-0 top-1/2 z-10 h-28 w-[220px] -translate-y-1/2 object-contain"
          />
        </div>
      ) : (
        <div className="mt-2 h-16" />
      )}
    </div>
  );
}

/** The real templates' page footer (capital, siège, RCCM, compte bancaire,
 * site web) — pinned to the bottom of the printed page via mt-auto on the
 * flex column DocumentLetter renders into, never mixed into the body text. */
function PageFooter({ enterprise, legal }: { enterprise: Enterprise; legal: EntiteLegalInfo | null }) {
  const text =
    legal?.piedDePage ||
    [enterprise.nom, enterprise.adresse, enterprise.rccm ? `RCCM : ${enterprise.rccm}` : null]
      .filter(Boolean)
      .join(" — ");
  if (!text) return null;
  return (
    <div className="mt-auto border-t border-nb/10 pt-3 text-center text-[10px] leading-snug text-gm">
      {text}
    </div>
  );
}

/** The document type name, framed in the same brand colors used for the
 * DocumentTypeBadge pills throughout the app (request forms, tables) — so a
 * printed/PDF letter is instantly recognizable by type, not just plain
 * uppercase text. print-color-adjust keeps the color when saved/printed. */
function DocumentTitle({ type, children }: { type: string; children: React.ReactNode }) {
  const { bg, fg } = documentTypeColors(type);
  return (
    <div className="mb-8 flex justify-center">
      <div
        className="inline-block rounded-lg border-2 px-6 py-2 text-center text-base font-bold uppercase tracking-wide [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
        style={{ background: bg, color: fg, borderColor: fg }}
      >
        {children}
      </div>
    </div>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 text-justify text-[13px] leading-7 text-nb">{children}</div>;
}

/** The shared opening identity paragraph every letter starts with — "Nous
 * soussignés, <raison sociale>, <forme juridique> au capital de X (Y) FCFA,
 * ayant son siège social à ..., immatriculée ..., représentée par ...". Text
 * verified against the real Word templates per entité (see the "Entités
 * juridiques" admin page) rather than invented — an entité with nothing
 * filled in yet falls back to whatever Neos itself has (name/RCCM/adresse). */
function IdentiteParagraph({ enterprise, legal }: { enterprise: Enterprise; legal: EntiteLegalInfo | null }) {
  if (!legal) {
    return (
      <p>
        Nous soussignés, {enterprise.nom}
        {enterprise.rccm ? `, RCCM ${enterprise.rccm}` : ""}
        {enterprise.adresse ? `, sise à ${enterprise.adresse}` : ""},
      </p>
    );
  }

  const habilite = legal.representantCivilite === "Madame" ? "habilitée" : "habilité";

  return (
    <p>
      Nous soussignés, {legal.raisonSociale}
      {legal.formeJuridique ? `, ${legal.formeJuridique}` : ""}
      {legal.capitalFcfa != null
        ? ` au capital de ${legal.capitalLettres ?? fmtNombre(legal.capitalFcfa)} (${fmtNombre(legal.capitalFcfa)}) francs CFA`
        : ""}
      , ayant son siège social à {legal.siege}, immatriculée au Registre du Commerce et du Crédit Mobilier
      sous le numéro {legal.rccm}, Compte Contribuable numéro {legal.compteContribuable} — Téléphone :{" "}
      {legal.telephone}, représentée par {legal.representantCivilite} {legal.representantNom},{" "}
      {legal.representantTitre}, dûment {habilite} aux fins des présentes,
    </p>
  );
}

/** Renders a printable HR letter — text varies by document type, letterhead
 * (logo/RCCM/address) varies by entité using live Neos enterprise data, and
 * the opening legal-identity paragraph varies by entité using the
 * RH-maintained "Entités juridiques" data (see IdentiteParagraph above). No
 * pre-made file is stored; this is generated fresh each time, then
 * printed/saved as PDF by RH. */
export function DocumentLetter({
  typeDocument,
  employe,
  enterprise,
  legal,
  request,
  mode = "numerique",
}: {
  typeDocument: string;
  employe: Employe;
  enterprise: Enterprise;
  legal: EntiteLegalInfo | null;
  request?: DocumentRequest;
  mode?: SignatureMode;
}) {
  return (
    <div className="flex min-h-[267mm] flex-col">
      <Letterhead enterprise={enterprise} />
      <LetterContent
        typeDocument={typeDocument}
        employe={employe}
        enterprise={enterprise}
        legal={legal}
        request={request}
        mode={mode}
      />
      <PageFooter enterprise={enterprise} legal={legal} />
    </div>
  );
}

function LetterContent({
  typeDocument,
  employe,
  enterprise,
  legal,
  request,
  mode,
}: {
  typeDocument: string;
  employe: Employe;
  enterprise: Enterprise;
  legal: EntiteLegalInfo | null;
  request?: DocumentRequest;
  mode: SignatureMode;
}) {
  const civ = civilite(employe.genre);
  const nomComplet = `${civ ? civ + " " : ""}${employe.fullname}`;
  const raisonSociale = legal?.raisonSociale || enterprise.nom;

  if (typeDocument === "Attestation de travail") {
    return (
      <>
        <DocumentTitle type={typeDocument}>Attestation de travail</DocumentTitle>
        <Body>
          <IdentiteParagraph enterprise={enterprise} legal={legal} />
          <p>
            Attestons par la présente que {nomComplet}
            {employe.contractNumber ? ` (Matricule : ${employe.contractNumber})` : ""} est employé(e) au
            sein de notre société{employe.dateEntree ? ` depuis le ${fmtDate(employe.dateEntree)}` : ""}
            , en qualité de <strong>{employe.fonction}</strong>.
          </p>
          <p>
            En foi de quoi, la présente attestation lui est délivrée pour servir et faire valoir ce que
            de droit.
          </p>
        </Body>
        <Signature enterprise={enterprise} legal={legal} mode={mode} />
      </>
    );
  }

  if (typeDocument === "Attestation de prise en charge") {
    return (
      <>
        <DocumentTitle type={typeDocument}>Attestation de prise en charge</DocumentTitle>
        <Body>
          <IdentiteParagraph enterprise={enterprise} legal={legal} />
          <p>
            Nous engageons par la présente à subvenir à tous les besoins (nourriture, entretien, frais
            de transport, frais d&apos;hospitalisation ou de soins médicaux et divers) de {nomComplet},
            {employe.dateNaissance ? ` né(e) le ${fmtDate(employe.dateNaissance)}` : ""}
            {request?.lieuNaissance ? ` à ${request.lieuNaissance}` : ""}, pendant toute la durée de son
            séjour {request?.destination ? `à ${request.destination} ` : ""}
            {request?.dateDebut ? `du ${fmtDate(request.dateDebut)} ` : ""}
            {request?.dateFin ? `au ${fmtDate(request.dateFin)} ` : ""}
            sans avoir recours aux aides publiques, attestant pour ce faire avoir les ressources
            suffisantes.
          </p>
        </Body>
        <Signature enterprise={enterprise} legal={legal} mode={mode} />
      </>
    );
  }

  if (typeDocument === "Ordre de mission") {
    return (
      <>
        <DocumentTitle type={typeDocument}>Ordre de mission</DocumentTitle>
        <Body>
          <IdentiteParagraph enterprise={enterprise} legal={legal} />
          <p>
            Autorisons par la présente {nomComplet}, <strong>{employe.fonction}</strong>, à effectuer une
            mission de travail {request?.destination ? `à ${request.destination}` : ""}.
          </p>
          <p>Date de départ : {fmtDate(request?.dateDebut ?? null)}</p>
          <p>Date de retour : {fmtDate(request?.dateFin ?? null)}</p>
          <p>Objet : {request?.objet || "—"}</p>
          <p>Les frais de cette mission sont totalement pris en charge par {raisonSociale}.</p>
          <p>
            En foi de quoi, la présente est délivrée à l&apos;intéressé(e) pour servir et faire valoir
            ce que de droit.
          </p>
        </Body>
        <Signature enterprise={enterprise} legal={legal} mode={mode} />
      </>
    );
  }

  if (typeDocument === "Certificat de travail") {
    return (
      <>
        <DocumentTitle type={typeDocument}>Certificat de travail</DocumentTitle>
        <Body>
          <IdentiteParagraph enterprise={enterprise} legal={legal} />
          <p>
            Certifions que {nomComplet} a été employé(e) au sein de notre société
            {employe.dateEntree ? ` du ${fmtDate(employe.dateEntree)} à ce jour` : ""}, en qualité de{" "}
            <strong>{employe.fonction}</strong>.
          </p>
          <p>Ce certificat est établi pour servir et faire valoir ce que de droit.</p>
        </Body>
        <Signature enterprise={enterprise} legal={legal} mode={mode} />
      </>
    );
  }

  if (typeDocument === "Certificat/attestation de consultance") {
    return (
      <>
        <DocumentTitle type={typeDocument}>Attestation de consultance</DocumentTitle>
        <Body>
          <IdentiteParagraph enterprise={enterprise} legal={legal} />
          <p>
            Attestons par la présente que {nomComplet}
            {employe.contractNumber ? ` (Matricule : ${employe.contractNumber})` : ""} est titulaire
            d&apos;un contrat de consultance au sein de notre société
            {employe.dateEntree ? ` depuis le ${fmtDate(employe.dateEntree)}` : ""}, en qualité de{" "}
            <strong>{employe.fonction}</strong>.
          </p>
          <p>
            En foi de quoi, la présente attestation lui est délivrée pour servir et faire valoir ce que
            de droit.
          </p>
        </Body>
        <Signature enterprise={enterprise} legal={legal} mode={mode} />
      </>
    );
  }

  if (typeDocument === "Attestation de versement d'honoraires") {
    const montant = request?.montantHonoraires ?? employe.salNet;
    return (
      <>
        <DocumentTitle type={typeDocument}>Attestation de versement d&apos;honoraires</DocumentTitle>
        <Body>
          <IdentiteParagraph enterprise={enterprise} legal={legal} />
          <p>
            Attestons par la présente que {nomComplet}
            {employe.contractNumber ? ` (Matricule : ${employe.contractNumber})` : ""}, titulaire
            d&apos;un contrat de consultance
            {request?.dateSignatureContrat ? ` signé le ${fmtDate(request.dateSignatureContrat)}` : ""},
            effectuant{employe.dateEntree ? ` depuis le ${fmtDate(employe.dateEntree)}` : ""} une mission
            de prestation pour notre compte, perçoit des honoraires mensuels d&apos;un montant net de{" "}
            {fmtFCFA(montant)}, versés par virement bancaire à la fin de chaque mois.
          </p>
          <p>
            En foi de quoi, la présente attestation lui est délivrée pour servir et faire valoir ce que
            de droit.
          </p>
        </Body>
        <Signature enterprise={enterprise} legal={legal} mode={mode} />
      </>
    );
  }

  return (
    <>
      <DocumentTitle type={typeDocument}>{typeDocument}</DocumentTitle>
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
