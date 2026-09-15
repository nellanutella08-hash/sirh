import type { Enterprise } from "@/lib/data";
import type { EntiteLegalInfo } from "@/lib/db";
import { documentTypeColors } from "@/components/Badge";

function today(): string {
  return new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
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
 * flex column DocumentLetterPreview renders into, never mixed into the body
 * text. */
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

/** Renders a printable HR letter — text varies by document type, letterhead
 * (logo/RCCM/address) varies by entité using live Neos enterprise data, and
 * the opening legal-identity paragraph varies by entité using the
 * RH-maintained "Entités juridiques" data. `title`/`paragraphs` are handed
 * in rather than derived here, so the same component serves the live,
 * editable generation flow (components/DocumentLetter.tsx) and the
 * read-only "aperçu des modèles" review page. When `editing`, each
 * paragraph gets an inline textarea (screen-only) alongside a print-only
 * `<p>` so a print/PDF triggered mid-edit still reflects the current text. */
export function DocumentLetterPreview({
  typeDocument,
  enterprise,
  legal,
  mode = "numerique",
  title,
  paragraphs,
  editing,
  onParagraphChange,
  onRemoveParagraph,
  onAddParagraph,
}: {
  typeDocument: string;
  enterprise: Enterprise;
  legal: EntiteLegalInfo | null;
  mode?: SignatureMode;
  title: string;
  paragraphs: string[];
  editing?: boolean;
  onParagraphChange?: (index: number, value: string) => void;
  onRemoveParagraph?: (index: number) => void;
  onAddParagraph?: () => void;
}) {
  return (
    <div className="flex min-h-[267mm] flex-col">
      <Letterhead enterprise={enterprise} />
      <DocumentTitle type={typeDocument}>{title}</DocumentTitle>
      <div className="space-y-3 text-justify text-[13px] leading-7 text-nb">
        {paragraphs.map((p, i) => (
          <div key={i}>
            {editing && (
              <div className="mb-1 flex items-start gap-2 print:hidden">
                <textarea
                  value={p}
                  onChange={(e) => onParagraphChange?.(i, e.target.value)}
                  rows={Math.max(2, Math.ceil(p.length / 90))}
                  className="w-full resize-y rounded-lg border border-v/15 bg-bg px-3 py-2 text-[13px] leading-6 text-nb outline-none focus:border-v"
                />
                <button
                  type="button"
                  onClick={() => onRemoveParagraph?.(i)}
                  className="mt-1 shrink-0 text-[11px] text-er hover:underline"
                >
                  Retirer
                </button>
              </div>
            )}
            <p className={editing ? "hidden print:block" : undefined}>{p}</p>
          </div>
        ))}
        {editing && (
          <button
            type="button"
            onClick={onAddParagraph}
            className="text-xs font-medium text-v hover:underline print:hidden"
          >
            + Ajouter un paragraphe
          </button>
        )}
      </div>
      <Signature enterprise={enterprise} legal={legal} mode={mode} />
      <PageFooter enterprise={enterprise} legal={legal} />
    </div>
  );
}
