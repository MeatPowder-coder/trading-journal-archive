/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/proxy/yahoo/:path*',
        destination: 'https://query1.finance.yahoo.com/:path*',
      },
    ];
  },
};

export default nextConfig;
