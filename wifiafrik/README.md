# WifiAfrik

Page d'accueil mobile-first (Next.js 14 App Router, TypeScript strict, Tailwind CSS 3, Framer Motion, Lucide React).

```bash
cd wifiafrik
npm install
npm run dev        # http://localhost:3000
npm run build      # build de production (lint + types inclus)
```

Sur Vercel, définir **Root Directory = `wifiafrik`**.

`components/africa-geometry.ts` est généré à partir de Natural Earth 50m (domaine public, via `world-atlas`) : ne pas le modifier à la main.

## Paiement manuel par Mobile Money (mode par défaut)

Parcours : `/plans` → `/checkout?plan=…` (choix Orange Money, Wave, MTN ou Moov) → `/commande/<id>`
(numéro destinataire, montant exact, référence de commande) → le client clique « J'ai payé » et saisit
la référence reçue par SMS → l'administrateur vérifie la réception sur son téléphone et valide sur `/admin`.

1. **Base de données** : appliquer, dans l'ordre, les fichiers de `supabase/migrations/`.
2. **Variables d'environnement** (Vercel → Settings → Environment Variables) : voir `.env.example`.
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement).
   - `PAYMENT_ORANGE_MONEY_NUMBER`, `PAYMENT_WAVE_NUMBER`, `PAYMENT_MTN_MOMO_NUMBER`, `PAYMENT_MOOV_MONEY_NUMBER` :
     seuls les moyens renseignés sont proposés. `PAYMENT_HOLDER_NAME` : nom affiché au client.
   - `ADMIN_PASSWORD` : mot de passe de `/admin` (12 caractères minimum).

## Paiement en ligne CinetPay (`PAYMENT_MODE=cinetpay`)

Parcours : `/plans` → `/checkout?plan=…` → page de paiement hébergée CinetPay → `/commande/<id>`.

La table `orders` a la RLS activée sans politique : seule la clé `service_role` y accède.

1. **Variables d'environnement** (Vercel → Settings → Environment Variables) : voir `.env.example`.
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement).
   - `PAYMENT_MODE` = `cinetpay`.
   - `CINETPAY_ENV` = `sandbox` ou `production`.
   - `CINETPAY_<PAYS>_API_KEY` et `CINETPAY_<PAYS>_API_PASSWORD` : un compte marchand par pays
     (CI, SN, ML, BF, TG, BJ, NE, CM, TD, CG, CF, GA, GQ). Seuls les pays configurés sont proposés.
   - `SITE_URL` : URL publique (sinon le domaine de production Vercel).
2. **Notifications** : CinetPay appelle `POST /api/cinetpay/notify`. Une notification n'est jamais crue
   telle quelle : le `notify_token` est comparé à celui reçu à l'initialisation, puis le statut est
   relu auprès de l'API CinetPay (`GET /v1/payment/{merchant_transaction_id}`).

Tests : `npm test`.
