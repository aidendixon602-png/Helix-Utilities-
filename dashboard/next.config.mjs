/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['mongoose'],
  images: { remotePatterns: [{ protocol: 'https', hostname: 'cdn.discordapp.com' }] },
};

export default nextConfig;
