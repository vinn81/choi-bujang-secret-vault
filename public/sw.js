// 11단계: 설치형 웹앱의 오프라인 안내만 맡는 서비스 워커입니다.
// 화면 이동이 네트워크에서 실패했을 때만 오프라인 안내를 보여 줍니다.
// /api/ 요청과 메모 응답, 로그인 정보는 가로채거나 저장하지 않습니다.
const CACHE = 'vault-offline-v1';
const OFFLINE_ASSETS = ['/offline.html', '/icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(OFFLINE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  if (new URL(request.url).pathname.startsWith('/api/')) return;
  event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
});
