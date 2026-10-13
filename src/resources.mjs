// 8단계: 자료실 자원을 구역별 자원 ID로 나눈 표입니다.
// 경로는 엔진이 넘기는 route 모양(`GET /notes/:id`)으로 적고, 자료 API는 앞의 /api만 뺀 같은 모양을 씁니다.
// 표에 없는 동작·경로는 자원 ID가 없으므로(null) 어느 구역으로도 취급하지 않습니다.
export const RESOURCES = Object.freeze({
  'notes.own': Object.freeze({
    description: '로그인한 사용자 본인의 메모',
    routes: Object.freeze([
      'GET /notes',
      'POST /notes',
      'GET /notes/:id',
      'PUT /notes/:id',
      'DELETE /notes/:id',
    ]),
  }),
  'notices.instructor': Object.freeze({
    description: '강사 공지(자료와 API 경로는 아직 없음)',
    routes: Object.freeze(['GET /notices', 'GET /notices/:id', 'PUT /notices/:id']),
  }),
});

const ROUTE_TO_RESOURCE = new Map(Object.entries(RESOURCES)
  .flatMap(([resourceId, { routes }]) => routes.map(route => [route, resourceId])));

export function resourceIdForRoute(route) {
  return typeof route === 'string' ? ROUTE_TO_RESOURCE.get(route) ?? null : null;
}

// 자료 API(`/api/notes/:id`)의 동작과 경로 모양을 받아 같은 표에서 자원 ID를 찾습니다.
export function resourceIdForApi(method, apiRoute) {
  if (typeof method !== 'string' || typeof apiRoute !== 'string' || !apiRoute.startsWith('/api/')) return null;
  return resourceIdForRoute(`${method} ${apiRoute.slice('/api'.length)}`);
}
