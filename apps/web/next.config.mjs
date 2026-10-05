/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@react-pdf/renderer"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_TARGET || "http://localhost:3001"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;