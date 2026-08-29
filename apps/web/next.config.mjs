/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  transpilePackages: ["@nutri-bot/core", "@nutri-bot/db"],
  serverExternalPackages: ["@prisma/client", ".prisma/client", "googleapis", "google-auth-library"],
};

export default nextConfig;
