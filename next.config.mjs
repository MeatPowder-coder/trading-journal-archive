/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@trading-journal/journal-data', '@trading-journal/journal-ui'],
  eslint: {
    ignoreDuringBuilds: true,
  },
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
