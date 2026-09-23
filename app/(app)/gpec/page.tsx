import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { isGpecAdmin, projectGpecEvaluation, computeGpecCompletionStats } from "@/lib/gpec";
import {
  getGpecPersonneByEmployeId,
  listGpecPersonnesManagedBy,
  listGpecCompetencesForEmploiType,
  listGpecCompetenceSocles,
  listGpecEvaluationsForPersonne,
  listGpecEvaluationsForPersonnes,
  listGpecCampagnes,
  listGpecFamilles,
  listGpecEmploiTypes,
  listGpecPersonnes,
  listGpecEvaluationsForCampagne,
  CACHE_ENABLED,
  type GpecCampagne,
} from "@/lib/db";
import { PageHeader } from "@/components/KpiCard";
import { GpecMesCompetences } from "@/components/GpecMesCompetences";
import { GpecEquipe } from "@/components/GpecEquipe";
import { GpecAdmin } from "@/components/GpecAdmin";

/** Campagne à afficher par défaut : la campagne ouverte s'il y en a une,
 * sinon la plus récente (listGpecCampagnes trie déjà par created_at DESC) —
 * pour toujours avoir quelque chose à montrer même hors période de saisie. */
function currentCampagne(campagnes: GpecCampagne[]): GpecCampagne | null {
  return campagnes.find((c) => c.statut === "ouverte") ?? campagnes[0] ?? null;
}

async function PersoSection({ tenantId, employeId }: { tenantId: number; employeId: number }) {
  const personne = await getGpecPersonneByEmployeId(tenantId, employeId);
  if (!personne) {
    return (
      <div className="rounded-[14px] border border-v/10 bg-white p-8 text-center text-xs text-gm">
        Aucune fiche GPEC n&apos;est encore rattachée à votre compte — contactez les RH.
      </div>
    );
  }
  if (!personne.emploiTypeId) {
    return (
      <div className="rounded-[14px] border border-v/10 bg-white p-8 text-center text-xs text-gm">
        Aucun emploi-type ne vous est encore rattaché — contactez les RH.
      </div>
    );
  }

  const [competences, socles, campagnes] = await Promise.all([
    listGpecCompetencesForEmploiType(tenantId, personne.emploiTypeId),
    listGpecCompetenceSocles(tenantId),
    listGpecCampagnes(tenantId),
  ]);
  const socleById = new Map(socles.map((s) => [s.id, s]));
  const campagne = currentCampagne(campagnes);
  const evaluations = campagne
    ? (await listGpecEvaluationsForPersonne(tenantId, personne.id)).filter((e) => e.campagneId === campagne.id)
    : [];
  const evalByCompetence = new Map(evaluations.map((e) => [e.competenceId, e]));

  const rows = competences.map((c) => {
    const evaluation = evalByCompetence.get(c.id);
    const projected = evaluation && campagne ? projectGpecEvaluation(evaluation, campagne.statut, "collaborateur") : null;
    const socle = c.competenceSocleId ? socleById.get(c.competenceSocleId) ?? null : null;
    return {
      evaluationId: evaluation?.id ?? null,
      competenceId: c.id,
      categorie: c.categorie,
      libelle: c.libelle,
      niveauRequis: c.niveauRequis,
      socleDef: socle
        ? ([socle.defNiveau1, socle.defNiveau2, socle.defNiveau3, socle.defNiveau4] as [string, string, string, string])
        : null,
      niveauAuto: projected?.niveauAuto ?? null,
      niveauManager: projected?.niveauManager ?? null,
      niveauRetenu: projected?.niveauRetenu ?? null,
      ecart: projected?.ecart ?? null,
      alerte: projected?.alerte ?? false,
    };
  });

  return (
    <GpecMesCompetences
      personne={{ nom: personne.nom, prenoms: personne.prenoms, fonctionContrat: personne.fonctionContrat }}
      campagne={campagne ? { id: campagne.id, nom: campagne.nom, statut: campagne.statut } : null}
      rows={rows}
    />
  );
}

async function EquipeSection({ tenantId, managerPersonneId }: { tenantId: number; managerPersonneId: string }) {
  const [managed, campagnes] = await Promise.all([
    listGpecPersonnesManagedBy(tenantId, managerPersonneId),
    listGpecCampagnes(tenantId),
  ]);
  const campagne = currentCampagne(campagnes);

  if (!campagne || managed.length === 0) {
    return (
      <GpecEquipe
        campagne={campagne ? { id: campagne.id, nom: campagne.nom, statut: campagne.statut } : null}
        personnes={managed.map((p) => ({ id: p.id, nom: p.nom, prenoms: p.prenoms }))}
        rows={[]}
      />
    );
  }

  const emploiTypeIds = Array.from(new Set(managed.map((p) => p.emploiTypeId).filter((id): id is string => !!id)));
  const [competencesByEmploiType, socles, evaluations] = await Promise.all([
    Promise.all(emploiTypeIds.map((id) => listGpecCompetencesForEmploiType(tenantId, id))),
    listGpecCompetenceSocles(tenantId),
    listGpecEvaluationsForPersonnes(tenantId, campagne.id, managed.map((p) => p.id)),
  ]);
  const competencesByEmploiTypeId = new Map(emploiTypeIds.map((id, i) => [id, competencesByEmploiType[i]]));
  const socleById = new Map(socles.map((s) => [s.id, s]));
  const evalByPersonneCompetence = new Map(evaluations.map((e) => [`${e.personneId}:${e.competenceId}`, e]));

  const rows = managed.flatMap((p) => {
    const competences = p.emploiTypeId ? competencesByEmploiTypeId.get(p.emploiTypeId) ?? [] : [];
    return competences.map((c) => {
      const evaluation = evalByPersonneCompetence.get(`${p.id}:${c.id}`);
      const projected = evaluation ? projectGpecEvaluation(evaluation, campagne.statut, "manager") : null;
      const socle = c.competenceSocleId ? socleById.get(c.competenceSocleId) ?? null : null;
      return {
        evaluationId: evaluation?.id ?? null,
        personneId: p.id,
        personneNom: p.nom,
        personnePrenoms: p.prenoms,
        competenceId: c.id,
        categorie: c.categorie,
        libelle: c.libelle,
        niveauRequis: c.niveauRequis,
        socleDef: socle
          ? ([socle.defNiveau1, socle.defNiveau2, socle.defNiveau3, socle.defNiveau4] as [string, string, string, string])
          : null,
        niveauAuto: projected?.niveauAuto ?? null,
        niveauManager: projected?.niveauManager ?? null,
        niveauRetenu: projected?.niveauRetenu ?? null,
        ecart: projected?.ecart ?? null,
        alerte: projected?.alerte ?? false,
      };
    });
  });

  return (
    <GpecEquipe
      campagne={{ id: campagne.id, nom: campagne.nom, statut: campagne.statut }}
      personnes={managed.map((p) => ({ id: p.id, nom: p.nom, prenoms: p.prenoms }))}
      rows={rows}
    />
  );
}

async function AdminSection({ tenantId }: { tenantId: number }) {
  const [familles, emploiTypes, personnes, campagnes] = await Promise.all([
    listGpecFamilles(tenantId),
    listGpecEmploiTypes(tenantId),
    listGpecPersonnes(tenantId),
    listGpecCampagnes(tenantId),
  ]);
  const campagnesWithStats = await Promise.all(
    campagnes.map(async (c) => ({
      campagne: c,
      stats: computeGpecCompletionStats(await listGpecEvaluationsForCampagne(tenantId, c.id)),
    }))
  );

  return (
    <GpecAdmin
      familleCount={familles.length}
      emploiTypes={emploiTypes.map((e) => ({ id: e.id, nom: e.nom }))}
      personnes={personnes.map((p) => ({
        id: p.id,
        nom: p.nom,
        prenoms: p.prenoms,
        matricule: p.matricule,
        entite: p.entite,
        emploiTypeId: p.emploiTypeId,
        managerId: p.managerId,
        actif: p.actif,
      }))}
      campagnes={campagnesWithStats.map(({ campagne, stats }) => ({
        id: campagne.id,
        nom: campagne.nom,
        dateDebut: campagne.dateDebut,
        dateFin: campagne.dateFin,
        statut: campagne.statut,
        stats,
      }))}
    />
  );
}

export default async function GpecPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const session = await getSession();
  if (!session) return null;

  const rh = isRH(session);

  if (!CACHE_ENABLED) {
    return (
      <>
        <PageHeader title="GPEC" subtitle="Gestion Prévisionnelle des Emplois et des Compétences" hasSearchBarAbove={rh} />
        <div className="p-6">
          <div className="rounded-[14px] border border-v/10 bg-white p-8 text-center">
            <div className="mb-1 text-sm font-semibold text-nb">Base de données non configurée</div>
            <p className="mx-auto max-w-md text-xs text-gm">
              Le module GPEC a besoin d&apos;une base Postgres (Neon) — ajoutez{" "}
              <code>DATABASE_URL</code> dans les variables d&apos;environnement du projet.
            </p>
          </div>
        </div>
      </>
    );
  }

  const admin = isGpecAdmin(session.roles);
  const personne = await getGpecPersonneByEmployeId(session.tenantId, session.userId);
  const managed = personne ? await listGpecPersonnesManagedBy(session.tenantId, personne.id) : [];
  const isManager = managed.length > 0;

  const { vue: vueParam } = await searchParams;
  const vue: "admin" | "equipe" | "perso" =
    vueParam === "admin" && admin
      ? "admin"
      : vueParam === "equipe" && isManager
        ? "equipe"
        : vueParam === "perso"
          ? "perso"
          : admin
            ? "admin"
            : isManager
              ? "equipe"
              : "perso";

  const tabs: { key: "admin" | "equipe" | "perso"; label: string }[] = [];
  if (admin) tabs.push({ key: "admin", label: "Administration" });
  if (isManager) tabs.push({ key: "equipe", label: "Mon équipe" });
  tabs.push({ key: "perso", label: "Mes compétences" });

  return (
    <>
      <PageHeader title="GPEC" subtitle="Gestion Prévisionnelle des Emplois et des Compétences" hasSearchBarAbove={rh} />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        {tabs.length > 1 && (
          <div className="mb-5 flex gap-2">
            {tabs.map((t) => (
              <a
                key={t.key}
                href={`/gpec?vue=${t.key}`}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  vue === t.key ? "bg-v text-white" : "border border-v/20 text-nb hover:bg-gl"
                }`}
              >
                {t.label}
              </a>
            ))}
          </div>
        )}

        {vue === "admin" && admin && <AdminSection tenantId={session.tenantId} />}
        {vue === "equipe" && isManager && personne && (
          <EquipeSection tenantId={session.tenantId} managerPersonneId={personne.id} />
        )}
        {vue === "perso" && <PersoSection tenantId={session.tenantId} employeId={session.userId} />}
      </div>
    </>
  );
}
