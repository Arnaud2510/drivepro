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

## Paiement (CinetPay) et commandes (Supabase)

Parcours : `/plans` → `/checkout?plan=…` → page de paiement hébergée CinetPay → `/commande/<id>`.

1. **Base de données** : appliquer `supabase/migrations/20261027000000_wifiafrik_orders.sql`
   (table `orders`, RLS activée sans politique : seule la clé `service_role` y accède).
2. **Variables d'environnement** (Vercel → Settings → Environment Variables) : voir `.env.example`.
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement).
   - `CINETPAY_ENV` = `sandbox` ou `production`.
   - `CINETPAY_<PAYS>_API_KEY` et `CINETPAY_<PAYS>_API_PASSWORD` : un compte marchand par pays
     (CI, SN, ML, BF, TG, BJ, NE, CM, TD, CG, CF, GA, GQ). Seuls les pays configurés sont proposés.
   - `SITE_URL` : URL publique (sinon le domaine de production Vercel).
3. **Notifications** : CinetPay appelle `POST /api/cinetpay/notify`. Une notification n'est jamais crue
   telle quelle : le `notify_token` est comparé à celui reçu à l'initialisation, puis le statut est
   relu auprès de l'API CinetPay (`GET /v1/payment/{merchant_transaction_id}`).

Tests : `npm test`.
