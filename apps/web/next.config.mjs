/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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