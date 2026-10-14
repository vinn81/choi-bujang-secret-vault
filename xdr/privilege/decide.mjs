// xdr/privilege/patterns.json 의 패턴을 그대로 옮겨 둡니다. 두 곳을 함께 고칩니다.
// 심판은 인터넷 없이 이 파일 하나만 불러오므로 import·파일 읽기·외부 호출을 쓰지 않습니다.
const PATTERNS = Object.freeze({
  group: {
    name: '평범한 계정의 관리자 그룹 추가',
    condition: '관리자가 아닌 평범한 계정이 원격·처음 보는 주소에서 관리자 그룹(administrators)에 추가되거나, 같은 주소에서 여러 계정이 한꺼번에 추가되거나, 빠졌다가 곧바로 다시 들어온다. 관리자 그룹이 아닌 수업·과제 그룹 추가는 해당하지 않는다.',
    evidence: 'MITRE ATT&CK T1078: 공격자는 손에 넣은 정상 계정을 악용해 권한 상승과 지속성을 얻으며, 평범한 로컬 계정에 관리자 권한을 붙이는 것은 그 대표적 형태다.',
  },
  command: {
    name: '처음 보는 관리자 명령 실행',
    condition: '방금 권한이 올라간 계정이나 평범한 계정의 세션이 관리자 권한으로 바뀌어 관리자 명령을 실행하거나, 다른 계정의 권한을 빌려 관리자 명령을 실행한다. 권한 상승 창이 취소됐거나 명령이 실패·없음으로 끝나면 이 패턴만으로 단정하지 않는다.',
    evidence: 'MITRE ATT&CK T1068: 공격자는 프로그램·운영체제의 약점을 악용해 권한을 높인 뒤 관리자 권한으로 명령을 실행한다.',
  },
  unusual: {
    name: '업무 시간 밖·처음 보는 주소의 권한 사용',
    condition: '관리자 권한 사용이나 관리자 그룹 변경이 수업(업무) 시간 밖에 일어나거나 그 계정이 처음 쓰는 주소에서 일어난다. 평소 주소·수업 시간의 한 번뿐인 사용은 해당하지 않는다.',
    evidence: 'MITRE ATT&CK T1078: 도용한 정상 계정의 활동은 정상처럼 보이므로, 평소와 다른 시각·접속 위치에서의 계정 사용이 탐지 단서가 된다.',
  },
});

const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

// 패턴 조건의 뚜렷한 신호입니다.
const STRONG = {
  adminGroup: /관리자\s*그룹에\s*(?:추가|들어)|다시\s*관리자로\s*들어/u,
  adminCommand: /관리자\s*명령(?:을|이)?[^.]*실행|권한\s*명령을\s*실행/u,
  elevatedSession: /방금\s*관리자가\s*된|관리자\s*권한으로\s*바뀌/u,
  borrowedAccount: /다른\s*계정의\s*권한/u,
  offHours: /(?:수업|업무)\s*시간\s*밖|업무처럼\s*보이지\s*않는\s*시각/u,
  unfamiliarAddress: /처음\s*보는\s*주소|처음\s*봅니다|원격\s*주소/u,
  ordinaryAccount: /평범한\s*계정/u,
  immediate: /곧바로|방금/u,
  manyAccounts: /계정\s*\d+\s*개/u,
  rejoined: /빠진\s*계정이[^.]*다시/u,
};
const ADMIN_GROUP_NAME = /^administrators$/iu;

// 신호를 누그러뜨리는 사정(애매한 시도)입니다.
const SOFTENING = /수업\s*(?:시간에|중)|취소|관리자\s*그룹은\s*아닙|평소\s*주소|한\s*번|변경은\s*없|명령은\s*없|실패|설명만/u;
// 정상 이벤트 표식입니다.
const NORMAL = /로그인했|로그아웃했|읽기만|비밀번호를\s*변경|자료실을\s*열|평소\s*예약\s*작업|자기\s*세션\s*정보/u;
// 권한·계정과 관련된 낱말(신호가 약해도 알릴 대상)
const RELATED = /관리자|권한|그룹|계정\s*종류/u;

const clamp = value => Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;

function answer(confidence, reason) {
  const value = clamp(confidence);
  const action = value >= BLOCK_AT ? 'block' : value >= ALERT_AT ? 'alert' : 'record';
  return { action, confidence: value, reason };
}

function repeatCount(data) {
  const count = Number.parseInt(data?.count, 10);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

function patternFor(signals, mitre) {
  if (signals.includes('adminGroup')) return PATTERNS.group;
  if (signals.includes('offHours') || (signals.includes('unfamiliarAddress') && !signals.includes('adminCommand'))) {
    return PATTERNS.unusual;
  }
  if (signals.length > 0) return PATTERNS.command;
  return mitre.includes('T1068') ? PATTERNS.command : PATTERNS.group;
}

export function decide(alert) {
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const level = Number.isFinite(alert?.rule?.level) ? alert.rule.level : 0;
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const group = typeof alert?.data?.group === 'string' ? alert.data.group : '';
  const count = repeatCount(alert?.data);

  const signals = Object.entries(STRONG).filter(([, pattern]) => pattern.test(description)).map(([name]) => name);
  if (!signals.includes('adminGroup') && ADMIN_GROUP_NAME.test(group)) signals.push('adminGroup');
  if (signals.includes('adminGroup') && count >= 2 && !signals.includes('manyAccounts')) signals.push('repeated');
  const softened = SOFTENING.test(description);
  const normal = NORMAL.test(description);
  const pattern = patternFor(signals, mitre);

  // 1) 뚜렷한 신호가 둘 이상이고 누그러뜨리는 사정이 없으면 세션 회수 후보입니다.
  if (signals.length >= 2 && !softened && !normal) {
    const confidence = 0.86 + 0.03 * (signals.length - 2) + (level >= 12 ? 0.02 : 0);
    return answer(Math.min(confidence, 0.98), pattern.name);
  }

  // 2) 정상 표식이 있거나 경보 기법·수준이 낮고 뚜렷한 신호가 없으면 정상 이벤트입니다.
  if (signals.length === 0 && (normal || (mitre.length === 0 && level <= 3))) {
    return answer(0.05, '해당 패턴 없음');
  }

  // 3) 권한 관련 흔적은 있지만 신호가 약하거나 정상 사유가 함께 있으면 알립니다.
  if (signals.length > 0 || (mitre.length > 0 && RELATED.test(description)) || (level >= 9 && mitre.length > 0)) {
    const confidence = 0.6 + 0.04 * Math.min(signals.length, 3);
    return answer(Math.min(confidence, 0.8), `${pattern.name} — 신호가 약하거나 정상 사유가 함께 있음`);
  }

  return answer(0.05, '해당 패턴 없음');
}
