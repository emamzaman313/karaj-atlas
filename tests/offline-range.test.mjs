import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const archiveUrl = 'https://atlas.example/karaj-atlas/data/karaj.pmtiles';
const archiveBytes = Uint8Array.from([80, 77, 84, 105, 108, 101, 115, 3, 4, 5, 6, 7]);

function createWorker(cachedBytes = archiveBytes) {
  const listeners = new Map();
  const calls = [];
  const cache = {
    async match(key) {
      calls.push(['match', String(key)]);
      return String(key) === archiveUrl && cachedBytes
        ? new Response(cachedBytes, { headers: { 'Content-Type': 'application/octet-stream' } })
        : undefined;
    },
  };
  const context = {
    self: {
      location: { origin: new URL(archiveUrl).origin },
      addEventListener: (name, handler) => listeners.set(name, handler),
    },
    caches: { open: async () => cache },
    Response,
    Headers,
    URL,
    fetch: async request => {
      calls.push(['fetch', request.headers.get('range')]);
      return new Response('network');
    },
  };
  return readFile(new URL('../public/sw.js', import.meta.url), 'utf8').then(source => {
    vm.runInNewContext(source, context);
    return { listeners, calls };
  });
}

async function dispatchFetch(worker, request) {
  let response;
  worker.listeners.get('fetch')({ request, respondWith: promise => { response = Promise.resolve(promise); } });
  return response;
}

test('serves exact byte ranges from a saved PMTiles archive', async () => {
  const worker = await createWorker();
  const response = await dispatchFetch(worker, new Request(archiveUrl, { headers: { Range: 'bytes=2-6' } }));
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), 'bytes 2-6/12');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [...archiveBytes.slice(2, 7)]);
  assert.equal(worker.calls.some(([kind]) => kind === 'fetch'), false);
});

test('falls through to the network when the offline archive is not saved', async () => {
  const worker = await createWorker(null);
  const response = await dispatchFetch(worker, new Request(archiveUrl, { headers: { Range: 'bytes=0-3' } }));
  assert.equal(await response.text(), 'network');
  assert.equal(worker.calls.at(-1)[0], 'fetch');
});

test('rejects an invalid byte range against a saved archive', async () => {
  const worker = await createWorker();
  const response = await dispatchFetch(worker, new Request(archiveUrl, { headers: { Range: 'bytes=99-100' } }));
  assert.equal(response.status, 416);
  assert.equal(response.headers.get('Content-Range'), 'bytes */12');
});
