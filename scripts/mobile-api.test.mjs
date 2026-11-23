import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMobileApi } from './mobile-api.mjs';

const ready = async (_url, options) => options.method === 'OPTIONS'
  ? new Response(null, { status: 200, headers: {
    'Access-Control-Allow-Origin': options.headers.Origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  } })
  : new Response('{"detail":"Authentication credentials were not provided."}', { status: 401, headers: { 'Content-Type': 'application/json' } });

test('accepts an updated API with authentication and CORS for both native origins', async () => {
  const paths = [];
  await checkMobileApi('https://api.school.test/api/', async (url, options) => {
    paths.push(url.pathname);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    return ready(url, options);
  });
  assert.equal(paths.length, 5);
  assert.ok(paths.every((path) => path.startsWith('/api/')));
});

test('rejects a site fallback that returns HTML instead of the new API endpoints', async () => {
  await assert.rejects(checkMobileApi('https://api.school.test/api/', async (url, options) =>
    options.method === 'OPTIONS' ? ready(url, options) : new Response('<html>Site</html>', { headers: { 'Content-Type': 'text/html' } })), /backend publicado não está pronto/);
});

test('rejects an API that omits either native CORS origin', async () => {
  await assert.rejects(checkMobileApi('https://api.school.test/api/', async (url, options) =>
    options.headers.Origin === 'capacitor://localhost' ? new Response(null, { status: 200 }) : ready(url, options)), /CORS não está pronto para capacitor/);
});

test('rejects missing Authorization permission even if the origin is allowed', async () => {
  await assert.rejects(checkMobileApi('https://api.school.test/api/', async (url, options) => {
    const response = await ready(url, options);
    if (options.method === 'OPTIONS') response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    return response;
  }), /CORS não está pronto/);
});
