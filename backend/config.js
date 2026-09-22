require('dotenv').config();

function envValue(key, defaultValue = '') {
  const value = process.env[key];
  return value === undefined || value === null || value === '' ? defaultValue : String(value).trim();
}

const allowedOrigins = envValue('CORS_ALLOWED_ORIGINS', '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

module.exports = {
  mongodb: {
    uri: envValue('MONGODB_URI', ''),
    db: envValue('MONGODB_DB', 'test_system_db'),
  },
  jwtSecret: envValue('JWT_SECRET', 'CHANGE_THIS_SECRET_FOR_PRODUCTION_2026'),
  jwtExpireSeconds: Number(envValue('JWT_EXPIRE_SECONDS', String(60 * 60 * 24 * 7))),
  uploadMaxMb: Number(envValue('UPLOAD_MAX_MB', '200')),
  uploadDbMaxMb: Number(envValue('UPLOAD_DB_MAX_MB', '10')),
  port: Number(envValue('PORT', '3000')),
  timezone: envValue('APP_TIMEZONE', 'Asia/Bangkok'),
  corsAllowAll: envValue('CORS_ALLOW_ALL', 'true') === 'true',
  corsAllowedOrigins: allowedOrigins,
  maps: {
    geocodingUrl: envValue('MAP_GEOCODING_URL', 'https://nominatim.openstreetmap.org'),
    routingUrl: envValue('MAP_ROUTING_URL', 'https://router.project-osrm.org'),
    userAgent: envValue('MAP_USER_AGENT', 'TestSystem/2026.1'),
    googleApiKey: envValue('GOOGLE_MAPS_API_KEY', ''),
  },
};
