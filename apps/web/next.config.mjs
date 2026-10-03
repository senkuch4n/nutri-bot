/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  transpilePackages: ["@nutri-bot/core", "@nutri-bot/db"],
  serverExternalPackages: ["@prisma/client", ".prisma/client", "googleapis", "google-auth-library"],
  experimental: {
    // Logo del profesional (subida como Server Action) y PDFs de planes.
    serverActions: { bodySizeLimit: "3mb" },
  },
  // Mismo alias en `next dev --turbopack`, así desarrollo y producción resuelven igual.
  turbopack: { resolveAlias: { "motion/react": "framer-motion" } },
  webpack(config) {
    // HU-017a (peso): `motion/react` 14 hace `const motion = fm.motion` a nivel de módulo, lo que mete
    // en el bundle inicial el componente `motion` completo con TODAS las features (drag, layout,
    // proyección), aunque solo usemos `m` + LazyMotion con `domMax` en diferido. `motion/react`
    // re-exporta exactamente `framer-motion` (misma versión, la trae `motion`), así que en el build
    // de producción se resuelve directo a él: el código sigue importando de "motion/react".
    // Medición en progress/impl_HU-017a.md ("Ronda 2"): sin esto `/` sumaba +58 KB gz.
    config.resolve.alias = { ...config.resolve.alias, "motion/react$": "framer-motion" };
    return config;
  },
};

export default nextConfig;
