# DrivePro

DrivePro est une application web responsive, pensée d'abord pour le téléphone. Elle permet aux chauffeurs VTC, TVDE, taxi et moto-taxi ainsi qu'aux livreurs de connaître leur **véritable bénéfice net** par jour, par heure et par kilomètre, une fois déduites les commissions et toutes les dépenses.

> Le nom, le logo et les couleurs se changent dans `VITE_APP_NAME`, `public/favicon.svg` et le bloc `@theme` de `src/index.css`.

## État d'avancement

| Domaine | État |
|---|---|
| Moteur financier (bénéfice, ratios, projection, provision fiscale, comparateur) | ✅ fait, 33 tests unitaires |
| **Gestion de flotte** : invitations par lien, consentement du chauffeur révocable, tableau de bord consolidé, rentabilité des véhicules, export CSV | ✅ testée de bout en bout |
| **Notifications** : centre de notifications, résumés hebdomadaires et mensuels, rappel quotidien en push (fonction Edge + service worker) | ✅ testées de bout en bout (hors livraison par les services push réels) |
| **Administration** : statistiques agrégées, utilisateurs (admin, suspension, plan), référentiels, prix indicatifs sourcés, traductions, journal d'audit | ✅ testée de bout en bout |
| Saisie de la journée (plusieurs plateformes, brut/net, bonus et pourboires, énergie estimée ou réelle) | ✅ |
| Véhicules (voiture, moto, électrique), plateformes, dépenses, charges fixes mensuelles | ✅ |
| Tableau de bord, historique filtrable, calendrier, statistiques (7 j, 30 j, mois, 12 mois) | ✅ |
| Comparateur plateformes et véhicules, objectifs, provision fiscale | ✅ |
| Rapports : jour, semaine, mois, année, période libre, export CSV (Excel), PDF par impression | ✅ |
| 6 langues (fr, en, es, pt, de, it), parité des clés vérifiée par test | ✅ |
| Devises EUR, XOF, XAF, GNF et autres ; formats locaux ; fuseaux horaires | ✅ |
| Authentification Supabase (e-mail et mot de passe, réinitialisation) | ✅ côté code, à brancher sur votre projet |
| Schéma PostgreSQL et RLS (chauffeur, flotte avec consentement, admin) | ✅ validé par `npm run test:db` |
| Justificatifs photo (stockage privé Supabase) | ✅ en mode compte uniquement |
| Export RGPD (JSON) et suppression de compte | ✅ |
| Notifications par e-mail | ⏳ non développées |
| Paiement et abonnements | ⏳ non intégrés : rien n'est bloqué, aucun faux paiement |
| Connexion Google, Apple ou téléphone ; mode hors ligne (PWA) | ⏳ prévus, non annoncés comme disponibles |
| Export .xlsx natif | ⏳ le CSV avec BOM et séparateur `;` s'ouvre directement dans Excel |

DrivePro **n'est connecté ni à Uber, ni à Bolt, ni à Yango** : c'est le chauffeur qui saisit ses montants. Aucun tarif de carburant, taux de commission ou taux d'imposition officiel n'est pré-rempli.

## Trois modes d'utilisation

1. **Compte connecté (Supabase)** : le mode de production, avec données en base, RLS et justificatifs.
2. **Sans compte** : tout est stocké dans le navigateur (`localStorage`), sans sauvegarde en ligne. Un bandeau le rappelle en permanence.
3. **Démonstration** : des données fictives rangées dans un espace séparé, avec un bandeau « Données de démonstration ». Elles ne se mélangent jamais aux vraies données.

Sans les variables Supabase, l'application démarre avec les modes 2 et 3 seulement.

## Démarrage

```bash
npm install
cp .env.example .env.local   # facultatif : renseigner l'URL et la clé anon Supabase
npm run dev                  # http://localhost:5173
npm test                     # moteur financier + traductions
npm run test:db              # migrations SQL + règles RLS (PostgreSQL embarqué), 60 vérifications
npm run build
```

## Tests de bout en bout

Ils pilotent un vrai navigateur contre un vrai backend Supabase local : 37 vérifications au total.

```bash
npx supabase start            # Docker requis ; applique les migrations
npx supabase db reset         # base vierge avant chaque série
npm run dev                   # dans un autre terminal (avec .env.local pointant sur le Supabase local)
npm run e2e:fleet             # gestionnaire + 2 chauffeurs : invitations, consentement, totaux de flotte
npm run e2e:admin             # console d'administration, notifications, pagination > 1 000 lignes
npm run e2e:push              # fonction Edge de rappel : VAPID, chiffrement, 410, anti-doublon (Deno requis)
npm run e2e:sw                # le service worker affiche la notification push
```

`e2e:admin` et `e2e:push` réutilisent les comptes créés par `e2e:fleet` : lancez-les dans cet ordre. Variables utiles : `APP_URL`, `DATABASE_URL`, `CHROMIUM_PATH`, `DENO_BIN`.

## Mise en place de Supabase

1. Créez un projet sur supabase.com.
2. Appliquez les migrations de `supabase/migrations/` dans l'ordre, soit avec `supabase db push`, soit en les collant dans l'éditeur SQL.
3. Dans Authentication › URL Configuration, ajoutez `https://votre-domaine/update-password` et `https://votre-domaine/onboarding` aux URL de redirection.
4. Copiez **uniquement** l'URL du projet et la clé `anon` dans `.env.local`. La clé `service_role` ne doit **jamais** se trouver dans le frontend.
5. Premier administrateur : exécutez côté serveur `insert into platform_admins (user_id) values ('<uuid>');`. Les suivants se nomment depuis Administration › Utilisateurs.
6. Notifications push (facultatif) : voir [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md).

## Déploiement

Le frontend est statique (`dist/`) : Vercel, Netlify, Cloudflare Pages ou tout hébergeur statique convient. Configurez la réécriture SPA (toutes les routes vers `index.html`) et les deux variables `VITE_SUPABASE_*`. Le backend, c'est Supabase.

## Architecture

```
src/
  domain/types.ts          modèle métier (montants en unités mineures)
  lib/finance/engine.ts    moteur financier pur et testé  → docs/FINANCE.md
  lib/money.ts, dates.ts   devises, arrondis, saisie "1 234,56", fuseaux horaires
  lib/alerts.ts            alertes calculées à partir des seules données du chauffeur
  config/catalog.ts        pays, devises, plateformes suggérées, catégories (ajouter un pays = 1 entrée)
  data/                    Repository (Supabase | local | démo) et état de l'application
  locales/*.json           1 fichier par langue, sans aucun texte en dur dans les composants
  pages/, components/      interface (React, Tailwind, Recharts)
supabase/migrations/       schéma, RLS, RPC transactionnelles, données de référence
supabase/tests/rls.mjs     tests de sécurité de la base
```

Choix techniques : React 18, TypeScript strict, Vite, Tailwind 4, Recharts, i18next, Zod (formulaires d'authentification), supabase-js, Vitest.

### Ajouter un pays ou une langue

- **Pays** : une entrée dans `COUNTRIES` (`src/config/catalog.ts`), une ligne `countries.XX` dans chaque fichier de langue, et la ligne de données de référence dans la migration.
- **Langue** : `src/locales/xx.json`, à enregistrer dans `src/i18n.ts` et `LANGUAGES`. Le test `locales.test.ts` vérifie que toutes les clés sont présentes.

## Base de données (résumé)

`auth.users` joue le rôle de `users`. Les tables principales sont `user_profiles`, `vehicles`, `user_platforms`, `work_sessions`, `platform_earnings`, `expenses` et `monthly_fixed_costs`. S'y ajoutent les objectifs et les estimations fiscales (`financial_goals`, `tax_estimates`), les notifications et les exports (`notifications`, `report_exports`), le journal `audit_logs`, les flottes (`organizations`, `organization_members`) et les abonnements (`subscription_plans`, `subscriptions`). Les référentiels sont `countries`, `cities`, `currencies`, `transport_platforms`, `platform_countries`, `expense_categories`, `fuel_prices`, `energy_prices` et `translations_overrides`. La vue `vehicle_costs` complète l'ensemble.

- Chaque ligne utilisateur porte un `user_id` et une politique RLS `user_id = auth.uid()`.
- Un gestionnaire de flotte a un accès **en lecture seule**, et seulement aux chauffeurs de sa flotte qui ont donné leur accord (`shares_data`). Ce consentement ne peut être modifié que par le chauffeur lui-même.
- Les abonnements ne peuvent pas être écrits depuis le client : ils sont réservés à un webhook de paiement vérifié côté serveur.
- L'administrateur n'accède qu'à des statistiques agrégées (`admin_stats()`), jamais aux finances d'un chauffeur.
- `save_work_session()` enregistre une journée et ses revenus en une seule transaction. `delete_my_account()` efface toutes les données (RGPD).
- Les taux indicatifs (`platform_countries`, `fuel_prices`, `energy_prices`) doivent obligatoirement porter une source et une date.

## Gestion de flotte

1. Un gestionnaire crée sa flotte (Flotte › Créer), puis invite un chauffeur **par e-mail**. Il obtient un lien personnel, valable 14 jours et utilisable une seule fois, à transmettre par SMS, WhatsApp ou e-mail.
2. Le chauffeur ouvre le lien. S'il n'a pas de compte, il s'inscrit et configure son profil, puis revient automatiquement sur l'invitation. Il ne peut rejoindre qu'avec l'adresse invitée.
3. Le partage des données est une **case distincte, décochée par défaut**, révocable à tout moment depuis Flotte › Flottes dont je fais partie. Sans ce consentement, le gestionnaire ne voit que le nom et l'e-mail.
4. Le tableau de bord additionne uniquement les chauffeurs consentants **dans la devise de la flotte**. Les autres devises sont affichées à part, sans conversion. Chaque chauffeur est calculé avec ses propres réglages.

Ces règles sont imposées par la base (RLS et fonctions `invite_preview`, `accept_invite`, `org_roster`), pas seulement par l'interface. Un gestionnaire ne peut ni consentir à la place d'un chauffeur, ni rétrograder le propriétaire. L'accès reste en lecture seule.

## Administration

L'onglet n'apparaît que pour les comptes présents dans `platform_admins`, et chaque fonction vérifie ce rôle côté serveur.

- **Vue d'ensemble** : comptes, actifs sur 7 et 30 jours, journées saisies, répartition par pays, langue et plan, flottes. Uniquement des agrégats.
- **Utilisateurs** : recherche, nomination ou retrait d'un administrateur, suspension (la personne ne peut plus se connecter, ses données sont conservées), attribution manuelle d'un plan. Aucune donnée financière n'y figure.
- **Référentiels** : pays, devises, villes, plateformes, plateformes par pays, catégories de dépenses, prix des carburants et de l'électricité, plans, paramètres généraux. Les prix et taux indicatifs exigent une source et une date (contrainte en base). Le chauffeur les voit comme une suggestion qu'il applique d'un clic, jamais automatiquement.
- **Traductions** : remplacer un texte de l'interface ou nommer un nouveau pays ou une nouvelle catégorie, sans redéployer.
- **Journal** : chaque modification de référentiel et chaque action sensible (suspension, rôle, plan, adhésion) est horodatée avec son auteur.

## Limites connues

- La politique de confidentialité est un brouillon, à faire valider juridiquement.
- Aucune limitation de débit n'est implémentée dans l'application : on s'appuie sur celle de Supabase Auth (les erreurs 429 sont gérées).
- Le mode sans compte n'a pas de synchronisation. La file hors ligne et la résolution des conflits restent à faire.
- Flotte, administration et push n'existent qu'avec un compte connecté. Le mode sans compte et la démo l'indiquent.
- La livraison des notifications par les services push des navigateurs (FCM, Apple, Mozilla) n'a pas pu être testée ici : elle exige un déploiement HTTPS.
- Pas encore de notifications par e-mail.
