# Deploiement Vercel - Eben Ezer Business

Ce document prepare le deploiement production de `ebenezerbusiness.com` sur Vercel, avec le domaine achete chez Namecheap.

## Etat du projet

- Framework: Next.js App Router
- Package manager: pnpm
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- PWA: `public/manifest.json`, `public/sw.js`, icones 192/512 et apple touch icon
- Google Sheets: lecture serveur uniquement via `/api/tracking/[code]`
- Donnees sensibles: aucune cle ne doit etre commitee

## Variables d'environnement Vercel

Configurer ces variables dans Vercel:

`Project Settings` -> `Environment Variables` -> environnements `Production`, `Preview` et `Development` si necessaire.

### Obligatoires

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
NEXTAUTH_URL="https://ebenezerbusiness.com"
NEXTAUTH_SECRET="generate-a-strong-secret"
GOOGLE_SHEETS_SPREADSHEET_ID="18yTYaFFU4p44WRyppQv6c8BlrE1ldUmirDDfyC0avHs"
GOOGLE_SHEETS_TRACKING_TABS="FIH,LSHI,KLZ"
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64="base64-encoded-service-account-json"
```

### Recommandation Google Sheets

Pour Vercel, utiliser `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`.

Depuis une machine locale, generer la valeur base64 avec:

```bash
base64 -i /path/to/service-account.json | tr -d '\n'
```

Coller ensuite la sortie complete dans Vercel comme valeur de `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`.

Ne pas utiliser `GOOGLE_APPLICATION_CREDENTIALS` en production Vercel, car cette variable pointe vers un fichier local qui n'existe pas sur Vercel.

### Base de donnees PostgreSQL

Le schema Prisma attend PostgreSQL via `DATABASE_URL`.

Options recommandees:

- Vercel Postgres / Neon
- Supabase PostgreSQL
- Railway PostgreSQL

Apres creation de la base, lancer les migrations Prisma depuis un environnement autorise:

```bash
pnpm prisma:generate
pnpm prisma migrate deploy
```

## Configuration Vercel

Le fichier `vercel.json` force:

- framework Next.js
- installation `pnpm install --frozen-lockfile`
- build `pnpm build`
- headers PWA pour `sw.js`, `manifest.json` et les icones

## Procedure de deploiement

1. Creer un repository GitHub, GitLab ou Bitbucket.
2. Pousser le projet:

```bash
git add .
git commit -m "Prepare production deployment"
git branch -M main
git remote add origin <URL_DU_REPOSITORY>
git push -u origin main
```

3. Dans Vercel, cliquer sur `Add New` -> `Project`.
4. Importer le repository.
5. Verifier les reglages:
   - Framework Preset: `Next.js`
   - Install Command: `pnpm install --frozen-lockfile`
   - Build Command: `pnpm build`
   - Output Directory: laisser vide
6. Ajouter toutes les variables d'environnement.
7. Lancer le premier deploy.
8. Verifier l'URL Vercel temporaire.
9. Tester:
   - `/`
   - `/contact`
   - `/tarifs`
   - `/suivi-de-colis`
   - `/manifest.json`
   - `/sw.js`

## Connexion du domaine Namecheap

### Dans Vercel

1. Ouvrir le projet Vercel.
2. Aller dans `Settings` -> `Domains`.
3. Ajouter `ebenezerbusiness.com`.
4. Accepter aussi l'ajout de `www.ebenezerbusiness.com` si Vercel le propose.
5. Choisir le domaine primaire:
   - recommande: `ebenezerbusiness.com`
   - rediriger `www.ebenezerbusiness.com` vers `ebenezerbusiness.com`

### Dans Namecheap

1. Se connecter a Namecheap.
2. Aller dans `Domain List`.
3. Cliquer sur `Manage` pour `ebenezerbusiness.com`.
4. Ouvrir l'onglet `Advanced DNS`.
5. Dans `Host Records`, supprimer les anciens records conflictuels pour `@` et `www`:
   - anciens `A Record`
   - anciens `CNAME`
   - anciens redirects URL
6. Ajouter les records indiques par Vercel.

Configuration habituelle:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| A Record | @ | valeur A indiquee par Vercel, souvent `76.76.21.21` | Automatic |
| CNAME Record | www | valeur CNAME exacte indiquee par Vercel | Automatic |

Important: le CNAME `www` peut etre unique selon le projet Vercel. Copier exactement la valeur affichee dans le dashboard Vercel.

7. Sauvegarder les records.
8. Retourner dans Vercel -> `Settings` -> `Domains`.
9. Attendre la validation DNS.

La propagation DNS peut prendre quelques minutes, parfois jusqu'a 24-48 heures selon les caches DNS.

## Verification apres propagation

Tester:

```bash
curl -I https://ebenezerbusiness.com
curl -I https://www.ebenezerbusiness.com
curl -I https://ebenezerbusiness.com/manifest.json
curl -I https://ebenezerbusiness.com/sw.js
```

Verifier aussi:

- certificat SSL actif dans Vercel
- redirection `www` correcte
- suivi colis Google Sheets en production
- installation PWA sur mobile

## Sources officielles

- Vercel - Adding & Configuring a Custom Domain: https://vercel.com/docs/domains/working-with-domains/add-a-domain
- Vercel - Working with DNS: https://vercel.com/docs/domains/working-with-dns
- Namecheap - A Record setup: https://www.namecheap.com/support/knowledgebase/article.aspx/319/2237/how-can-i-set-up-an-a-address-record-for-my-domain/
