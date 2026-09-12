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
};

export default nextConfig;
