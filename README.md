# Synelia RH (SIRH)

Système d'Information des Ressources Humaines de **Synelia**, reconstruit en application Next.js à partir d'une maquette HTML/JS. L'application se connecte en direct à l'ERP interne de Synelia, **Neos** (`https://neos-back.synelia.tech`), pour afficher des données RH réelles (employés, contrats, masse salariale, démographie, etc.) — il n'y a pas de base de données applicative séparée pour les données métier.

## Stack technique

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS v4** — configuration en CSS via `@theme` dans `app/globals.css` (pas de `tailwind.config.js`)
- **bun** comme gestionnaire de paquets (`bun.lock` fait foi — ne pas utiliser npm/yarn/pnpm)
- `chart.js` / `react-chartjs-2` pour les graphiques

## Démarrage

```bash
bun install
bun run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000). L'app redirige automatiquement vers `/login` tant qu'aucune session n'est active.

Autres scripts :

```bash
bun run build   # build de production
bun run start   # sert le build de production
bun run lint    # eslint
```

## Variables d'environnement

Copier `.env.example` en `.env.local` et renseigner :

| Variable | Requis | Description |
|---|---|---|
| `NEOS_BASE_URL` | Oui | URL de base de l'API Neos, ex. `https://neos-back.synelia.tech` |
| `DATABASE_URL` | Non | Chaîne de connexion Postgres/Neon pour le cache serveur optionnel du dataset employés fusionné (voir plus bas) |

Aucun secret de compte de service Neos n'est nécessaire côté application : chaque utilisateur s'authentifie avec ses propres identifiants Synelia/Neos (voir Authentification).

## Authentification

- La page `/login` envoie email + mot de passe à la route interne `POST /api/auth/login`.
- Cette route appelle l'endpoint `POST /auth` de **Neos** (backend Symfony/API Platform multi-tenant) pour authentifier l'utilisateur — Neos est le fournisseur d'identité, il n'existe pas de base d'utilisateurs propre à l'application.
- En cas de succès, une session JSON (token JWT Neos + `tenantId` + infos utilisateur) est stockée dans un cookie **httpOnly** nommé `sirh_session`.
- `proxy.ts` (le fichier `middleware` a été renommé `proxy` dans Next.js 16) protège toutes les routes sauf `/login` et redirige les visiteurs non authentifiés.

## Couche de données (`lib/neos.ts`, `lib/data.ts`)

Le code serveur récupère `/api/users` et `/api/contracts` depuis Neos (avec l'en-tête `tenant-id` et un Bearer token requis), fusionne ces données par employé (les contrats sont rattachés par id utilisateur, en privilégiant le contrat actif), puis calcule :

- des **KPI** globaux ;
- des **alertes d'échéance de contrat** (`ok` / `attention` / `urgent` / `expiré` / `cdi`) ;
- la **démographie** (genre, tranches d'âge, nationalité, situation matrimoniale) ;
- la **masse salariale** agrégée par entité/société et par type de contrat.

Les appels à Neos sont mis en cache via `revalidate` de `fetch` (Next.js, 2 minutes) et dédupliqués par requête via `cache()` de React.

## Pages de l'application

Toutes les pages sont sous `app/(app)/`, avec une sidebar commune :

| Page | Route | Description |
|---|---|---|
| Dashboard | `/dashboard` | Vue d'ensemble, KPI |
| Personnel | `/personnel` | Annuaire employés (recherche/filtre/tri) + fiche détail par employé |
| Contrats & Alertes | `/contrats` | Suivi des échéances de contrat, par onglets |
| Masse Salariale | `/masse-salariale` | Analytique de la masse salariale |
| Démographie | `/demographie` | Démographie de l'effectif |
| Congés & Absences | `/conges` | Voir limitation importante ci-dessous |
| Rapports | `/rapports` | Export CSV des données Neos en direct + rapport RH mensuel imprimable |

### ⚠️ Limitation connue : module Congés & Absences

Neos **n'expose aucune ressource d'API pour les congés ou soldes de congés** (vérifié sur le catalogue de ressources du backend réel). Le module `/conges` est donc une **démo locale clairement identifiée comme telle dans l'UI** :

- les noms d'employés et leur entité proviennent bien de Neos en direct ;
- les **soldes de congés et les demandes sont stockés uniquement dans le `localStorage` du navigateur** — rien n'est synchronisé ni persisté côté serveur, et tout est perdu/réinitialisé si l'on change de navigateur ou vide le stockage local.

À garder en tête avant toute mise en production ou démonstration à des utilisateurs qui ne connaîtraient pas cette limite.

## Cache optionnel (Neon/Postgres)

Une couche de cache serveur optionnelle est en cours d'intégration (en parallèle, par une autre personne) pour stocker le dataset employés fusionné dans une base **Neon/Postgres**, via la variable `DATABASE_URL`, afin de réduire les appels répétés à Neos. Cette couche est **optionnelle** : l'application fonctionne normalement sans `DATABASE_URL` défini. Voir `DEPLOYMENT.md` pour la mise en place sur Vercel.

## Déploiement

Voir [`DEPLOYMENT.md`](./DEPLOYMENT.md).
