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
