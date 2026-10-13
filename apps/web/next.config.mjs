/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  transpilePackages: ["@nutri-bot/core", "@nutri-bot/db"],
  serverExternalPackages: ["@prisma/client", ".prisma/client", "googleapis", "google-auth-library", "sharp"],
  experimental: {
    // Logo, foto de receta (5 MB + payload, HU-018a) y PDFs.
    serverActions: { bodySizeLimit: "6mb" },
    // HU-017c-3 (R3): el "Segment Explorer" de las devtools de Next 15.5 (solo `next dev`) mete nodos
    // propios alrededor de cada layout y, en una parte de las recargas, el árbol del cliente no
    // coincide con el del servidor en la hidratación: los `useId` de todo el panel salen distintos
    // (AppSidebar `aside id`/`aria-controls`, pestañas de Radix…) y React avisa "A tree hydrated but
    // some attributes…". Con la herramienta apagada los ids coinciden siempre. No afecta producción
    // (`next build`/`next start` no la usan). Detalle en progress/impl_HU-017c.md (017c-3).
    devtoolSegmentExplorer: false,
  },
  // Mismo alias en `next dev --turbopack`, así desarrollo y producción resuelven igual.
  turbopack: { resolveAlias: { "motion/react": "framer-motion" } },
  webpack(config) {
    // HU-017a (peso): `motion/react` 14 hace `const motion = fm.motion` a nivel de módulo, lo que mete
    // en el bundle inicial el componente `motion` completo con TODAS las features (drag, layout,
    // proyección), aunque solo usemos `m` + LazyMotion con `domMax` en diferido. `motion/react`
    // re-exporta exactamente `framer-motion` (misma versión exacta, declarada en package.json para no
    // depender del hoisting de npm), así que en el build
    // de producción se resuelve directo a él: el código sigue importando de "motion/react".
    // Medición en progress/impl_HU-017a.md ("Ronda 2"): sin esto `/` sumaba +58 KB gz.
    config.resolve.alias = { ...config.resolve.alias, "motion/react$": "framer-motion" };
    return config;
  },
};

export default nextConfig;
