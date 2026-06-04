module.exports = {
    apps: [
        {
            name: 'metaverse2d',
            script: 'apps/http/dist/index.js',
            cwd: '/opt/metaverse2d/meta',
            instances: 1,
            max_memory_restart: '800M',
            env_production: {
                NODE_ENV: 'production',
                PORT: '3000',
                DATABASE_URL: 'postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/metaverse?sslmode=require',
                CORS_ORIGIN: 'https://your-app.pages.dev,https://your-custom-domain.com',
                BETTER_AUTH_URL: 'https://api.your-domain.com',
                BETTER_AUTH_SECRET: 'change-this-to-a-random-secret-min-32-chars',
            },
        },
    ],
};
