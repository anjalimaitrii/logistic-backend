module.exports = {
  apps: [
    {
      name: 'fleet-backend',
      script: 'dist/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        PORT: 6006,
      },
    },
  ],
};
