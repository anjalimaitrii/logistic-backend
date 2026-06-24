module.exports = {
  apps: [
    {
      name: 'fleet-backend-dev',
      script: 'dist/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env_development: {
        NODE_ENV: 'development',
        PORT: 6008,
      },
    },
  ],
};
