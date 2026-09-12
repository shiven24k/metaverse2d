module.exports = {
    apps: [
        {
            name: 'metaverse2d',
            script: 'apps/http/dist/index.js',
            cwd: '/opt/metaverse2d/meta',
            instances: 1,
            max_memory_restart: '800M',
            // See apps/http/.env.example for descriptions of each variable.
            env_production: {
                NODE_ENV: 'production',
                PORT: '3000',
                DATABASE_URL: 'postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/metaverse?sslmode=require',
                CORS_ORIGIN: 'https://officeverse.shivenco.com,https://metaverse2d-frontend.pages.dev',
                BETTER_AUTH_URL: 'https://api.your-domain.com',
                BETTER_AUTH_SECRET: 'change-this-to-a-random-secret-min-32-chars',

                // Billing (Razorpay) — required for subscriptions
                RAZORPAY_KEY_ID: '',
                RAZORPAY_KEY_SECRET: '',
                RAZORPAY_WEBHOOK_SECRET: '',

                // Email — optional, no-op if empty
                RESEND_API_KEY: '',
                RESEND_FROM: 'Metaverse 2D <no-reply@metaverse2d.com>',

                // App URLs / currency
                APP_URL: 'https://your-domain.com',
                GEOIP_FALLBACK: 'false',

                // TURN — optional
                METERED_APP_NAME: '',
                METERED_API_KEY: '',

                // Cross-process member kick (required with standalone WS)
                INTERNAL_KICK_SECRET: '',
                INTERNAL_KICK_URL: 'http://127.0.0.1:4001/internal/kick',

                // Access-request signed links
                ACCESS_DECISION_SECRET: '',
            },
        },
    ],
};
