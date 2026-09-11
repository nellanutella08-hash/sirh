# Déploiement — Synelia RH

Cible de déploiement : **Vercel**, team `nellanutella08-3059`.

## Pré-requis

```bash
bun install
```

## Variables d'environnement

À définir dans Vercel (Project Settings → Environment Variables), pour les environnements **Production**, **Preview** et **Development** :

| Variable | Requis | Description |
|---|---|---|
| `NEOS_BASE_URL` | Oui | URL de base de l'API Neos, ex. `https://neos-back.synelia.tech` |
| `DATABASE_URL` | Non | Chaîne de connexion Neon/Postgres pour le cache serveur optionnel du dataset employés (voir « Cache optionnel Neon » ci-dessous) |

Aucun secret de compte de service Neos n'est requis pour le déploiement : les utilisateurs finaux se connectent avec leurs propres identifiants Neos/Synelia via `/login` — il n'y a pas d'inscription séparée, et l'application ne stocke pas d'identifiants applicatifs.

## Option A — CLI Vercel

```bash
npx vercel --prod
```

Suivre les invites pour lier le projet à la team `nellanutella08-3059`, puis renseigner les variables d'environnement ci-dessus (via le dashboard, ou `vercel env add`).

## Option B — Import Git (déploiements automatiques)

1. Sur le dashboard Vercel, **Add New → Project → Import Git Repository**.
2. Sélectionner le dépôt `nellanutella08-hash/sirh`.
3. Renseigner les variables d'environnement (`NEOS_BASE_URL`, et optionnellement `DATABASE_URL`).
4. Déployer. Chaque push sur `main` déclenche ensuite un déploiement automatique (et une preview par PR/branche).

## Cache optionnel Neon (`DATABASE_URL`)

L'application peut utiliser une base Neon/Postgres pour mettre en cache côté serveur le dataset employés fusionné (réduisant la charge répétée sur Neos). C'est **optionnel** — sans `DATABASE_URL`, l'application continue de fonctionner en interrogeant Neos directement.

Pour provisionner Neon sur Vercel, deux options :

1. **Coller une chaîne de connexion Neon existante** comme valeur de la variable d'environnement `DATABASE_URL`.
2. **Installer l'intégration Neon** depuis le dashboard Vercel : onglet **Storage → Create Database → Neon**.

⚠️ Cette étape de provisioning (option 2) nécessite un consentement OAuth/facturation interactif et ne peut donc **pas** être réalisée via un simple token API — elle doit être faite manuellement dans le dashboard par une personne ayant accès au projet Vercel.

## Résumé du flux d'authentification en production

- `/login` → `POST /api/auth/login` (interne) → `POST /auth` sur Neos.
- Succès : cookie httpOnly `sirh_session` (JWT Neos + `tenantId` + infos utilisateur).
- `proxy.ts` protège toutes les routes sauf `/login` (et `/api/auth/*`).
- Aucune configuration de compte de service Neos n'est nécessaire côté Vercel : c'est l'utilisateur final qui s'authentifie, à chaque connexion, avec ses propres identifiants.
