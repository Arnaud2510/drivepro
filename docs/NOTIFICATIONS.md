# Notifications

## Ce qui existe

| Canal | Contenu | Disponible |
|---|---|---|
| Tableau de bord | alertes en cours (objectif, dépense inhabituelle, entretien, échéances, baisse horaire) | tous les modes |
| Centre de notifications (`/app/notifications`, cloche) | alertes + résumé **hebdomadaire** (semaine précédente) + résumé **mensuel** (mois précédent), état lu / non lu | tous les modes (stockage navigateur sans compte, table `notifications` avec compte) |
| Push (téléphone, application fermée) | rappel quotidien « journée non saisie », à l'heure locale choisie par le chauffeur | compte connecté + configuration ci-dessous |
| E-mail | — | non développé |

Les alertes reposent uniquement sur les données du chauffeur (`src/lib/alerts.ts`). Chacune porte une clé stable, par exemple `weeklySummary:2026-10-05`. L'index unique `(user_id, dedupe_key)` empêche qu'une notification soit enregistrée deux fois. Le rappel « saisir ma journée » est **transitoire** : il décrit l'état courant et n'est pas stocké.

Le chauffeur choisit les types d'alertes dans Profil › Alertes, et l'heure du rappel dans Notifications.

## Activer le push

1. Générez une paire de clés VAPID (une seule fois) :
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Frontend : `VITE_VAPID_PUBLIC_KEY=<clé publique>` (dans `.env.local` ou dans les variables de l'hébergeur).
3. Déployez la fonction Edge et ses secrets :
   ```bash
   supabase functions deploy daily-reminders --no-verify-jwt
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:contact@votre-domaine CRON_SECRET=$(openssl rand -hex 24)
   ```
   `--no-verify-jwt` est voulu : la fonction n'accepte que l'en-tête `Authorization: Bearer <CRON_SECRET>`.
4. Planifiez un appel **toutes les heures** (SQL Editor, extensions `pg_cron` et `pg_net` activées) :
   ```sql
   select cron.schedule('drivepro-daily-reminders', '0 * * * *', $$
     select net.http_post(
       url := 'https://<projet>.supabase.co/functions/v1/daily-reminders',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
     );
   $$);
   ```

À chaque passage, la fonction :
- sélectionne les chauffeurs qui ont au moins un appareil enregistré et le rappel actif ;
- envoie le rappel si l'heure choisie est tombée dans la dernière heure, **dans leur fuseau horaire** ;
- n'envoie rien si la journée du jour est déjà saisie, ni deux fois le même jour (clé `push:dailyReminder:<date locale>`) ;
- supprime les appareils désabonnés (réponse 404 ou 410 du service push).

La logique d'horaire est dans `supabase/functions/_shared/reminders.ts` et testée par Vitest.

## Ce qui a été vérifié

- Tests unitaires : horaires dans plusieurs fuseaux, fenêtre d'une heure, préférence désactivée, fuseau inconnu, langues.
- Test de bout en bout de la fonction Edge, exécutée avec Deno sur une pile Supabase locale. Un faux service push reçoit la requête signée VAPID ; le message déchiffré (aes128gcm) contient bien le texte localisé. Sont aussi vérifiés : la suppression d'un appareil expiré (410), l'absence de second envoi le même jour, l'absence d'envoi quand la journée est saisie, et le refus d'un appel sans le secret.
- **Non vérifié ici :** la livraison réelle par les services push des navigateurs (FCM, Mozilla, Apple), qui exige un déploiement en HTTPS.
