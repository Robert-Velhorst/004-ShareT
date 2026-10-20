const http = require('http');

const port = Number(process.env.PORT || 5005);
const host = process.env.HOST || '127.0.0.1';

const request = http.request({
  hostname: host,
  port,
  path: '/ready',
  method: 'GET',
  timeout: 5000
}, response => {
  let body = '';
  response.on('data', chunk => { body += chunk; });
  response.on('end', () => {
    try {
      const readiness = JSON.parse(body);
      const database = readiness.database?.status || 'unknown';
      console.log(`ShareT readiness: ${readiness.status}`);
      console.log(`Database: ${database}`);
      console.log(`Public HTTPS: ${readiness.runtime?.capabilities?.publicHttps ? 'configured' : 'not configured'}`);
      for (const warning of readiness.runtime?.warnings || []) console.warn(`Warning: ${warning}`);
      if (response.statusCode === 200 && readiness.status === 'ready') process.exit(0);
      process.exit(1);
    } catch {
      console.error(`Invalid readiness response from http://${host}:${port}/ready`);
      process.exit(1);
    }
  });
});

request.on('error', error => {
  console.error(`ShareT readiness check failed: ${error.message}`);
  process.exit(1);
});

request.on('timeout', () => {
  console.error('ShareT readiness check timed out');
  request.destroy();
  process.exit(1);
});

request.end();
