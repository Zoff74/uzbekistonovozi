import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverActions: {
            bodySizeLimit: '150mb', // Увеличиваем лимит, чтобы Server Actions пропускали видео
        },
        optimizeCss: true,
        optimizePackageImports: [
            'lucide-react', 
            'date-fns', 
            'lodash', 
            '@radix-ui/react-slot',
            'clsx',
            'tailwind-merge'
        ],
    },
    compiler: {
        removeConsole: process.env.NODE_ENV === 'production',
    },
    reactStrictMode: false,
    staticPageGenerationTimeout: 600,
    compress: true,
    images: {
        dangerouslyAllowSVG: true,
        qualities: [60, 65, 75],
        formats: ['image/avif', 'image/webp'],
        remotePatterns: [
            { protocol: 'https', hostname: 'placehold.co' },
            { protocol: 'https', hostname: 'ik.imagekit.io' },
        ],
    },
    async headers() {
        return [
            {
                source: '/img/(.*)',
                headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
            },
            {
                source: '/fonts/(.*)',
                headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
            },
            {
                source: '/((?!_next/static|_next/image|img|fonts).*)',
                headers: [
                    { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
                    { 
                        key: 'Content-Security-Policy', 
                        value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data: https://ik.imagekit.io; img-src 'self' data: blob: https://ik.imagekit.io; media-src 'self' https: http: data: blob:; connect-src 'self' ws: wss: http: https:; frame-ancestors 'self';"
                    },
                    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
                    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
                    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                ],
            },
        ];
    },
    async rewrites() {
        return [
            {
                source: '/socket.io/:path*',
                destination: '/socket.io/:path*',
            },
        ];
    },
    webpack: (config, { isServer }) => {
        // Жестко фиксируем алиас @ на папку src для Webpack
        config.resolve.alias = {
            ...config.resolve.alias,
            '@': path.resolve(__dirname, 'src'),
        };

        config.watchOptions = {
            aggregateTimeout: 300,
            ignored: [
                '**/node_modules/**',
                '**/scripts/**',
                '**/generate_structure.js',
                '**/README.txt',
                '**/README.md',
                '**/registrations.log',
                '**/structure.txt',
                '**/Пожелания бизнесменов.txt'
            ],
        };

        if (!isServer && config.optimization && config.optimization.splitChunks) {
            config.optimization.splitChunks.cacheGroups = {
                ...config.optimization.splitChunks.cacheGroups,
                styles: {
                    name: 'styles',
                    test: /\.(css|scss)$/,
                    chunks: 'all',
                    enforce: true,
                },
            };
        }

        if (!isServer) {
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                'fs/promises': false,
                net: false,
                tls: false,
                child_process: false,
            };
        }
        return config;
    },
};

export default nextConfig;