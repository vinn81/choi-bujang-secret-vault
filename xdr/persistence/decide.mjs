// xdr/persistence/patterns.json 의 패턴을 그대로 옮겨 둡니다. 두 곳을 함께 고칩니다.
// 심판은 인터넷 없이 이 파일 하나만 불러오므로 import·파일 읽기·외부 호출을 쓰지 않습니다.
const PATTERNS = Object.freeze({
  service: {
    name: '서명 없는 새 서비스 등록',
    condition: '평소 목록에 없는 서비스가 새로 등록되거나 기존 서비스의 실행 파일이 바뀌었고, 그 실행 파일에 서명이 없으며 임시 폴더(AppData\\Local\\Temp 등) 같은 사용자 쓰기 위치를 가리킨다. 다시 켜도 실행되도록 등록되거나 같은 출발 주소에서 반복되면 더 뚜렷하다.',
    evidence: 'MITRE ATT&CK T1543: 공격자는 다시 켤 때마다 악성 코드가 실행되도록 시스템 프로세스(윈도 서비스 등)를 새로 만들거나 기존 서비스의 실행 파일을 바꿔 지속성을 얻는다.',
  },
  task: {
    name: '낯선 예약 작업',
    condition: '평소 목록에 없는 예약 작업이 새로 생겼고, 그 작업이 임시 폴더의 실행 파일을 가리키거나 이름이 임의 문자열이거나 평소 시간(수업 시간) 밖에 실행된다.',
    evidence: 'MITRE ATT&CK T1053: 공격자는 예약 작업으로 악성 코드를 처음 또는 반복해서 실행하게 만들어 지속성을 얻는다.',
  },
});

const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

// 어떤 패턴의 경보인지: 설명의 낱말을 우선하고, 없으면 MITRE 번호를 봅니다.
const SERVICE_WORD = /서비스/u;
const TASK_WORD = /예약\s*작업/u;

// 패턴 조건의 뚜렷한 신호입니다.
const STRONG = {
  unsigned: /서명\s*(?:이|은|도)?\s*없/u,
  userWritable: /임시\s*폴더/u,
  unfamiliar: /처음\s*보는|평소\s*목록에\s*없|새\s*서비스|서비스\s*등록(?!은\s*없)|등록됐/u,
  survivesReboot: /다시\s*켜도\s*남/u,
  randomName: /임의\s*문자열/u,
  offHours: /수업\s*시간\s*밖/u,
  executableChanged: /실행\s*파일이\s*바뀌/u,
  repeated: /연속|반복|\d+\s*건입니다/u,
  pairedAutostart: /시작\s*(?:프로그램|폴더)[^.]*(?:예약\s*작업|서비스)|(?:예약\s*작업|서비스)[^.]*시작\s*(?:프로그램|폴더)/u,
};
const TEMP_PATH = /\\AppData\\Local\\Temp\\|\\Temp\\/iu;

// 신호를 누그러뜨리는 사정(애매한 시도)입니다.
const SOFTENING = /수업\s*(?:중|시간입니다|도구|과제)|서명은\s*(?:아직\s*모|확인되지\s*않)|등록은\s*없|실행된\s*기록은\s*없|설명만|같은\s*파일로\s*다시|^C:\\lab\\/u;
const LAB_PATH = /^C:\\lab\\/iu;

// 정상 이벤트 표식입니다.
const NORMAL = /서명된|평소\s*(?:시각|저장소)|기존\s*(?:수업|예약)|읽기만|로그인했|로그아웃했|화면이\s*열렸/u;
// 지속성과 관련된 낱말(신호가 약해도 알릴 대상)
const RELATED = /서비스|예약\s*작업|시작\s*(?:폴더|항목|프로그램)|실행\s*파일|임시\s*폴더/u;

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

export function decide(alert) {
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const level = Number.isFinite(alert?.rule?.level) ? alert.rule.level : 0;
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const path = typeof alert?.data?.path === 'string' ? alert.data.path : '';
  const count = repeatCount(alert?.data);

  const kind = TASK_WORD.test(description) ? 'task'
    : SERVICE_WORD.test(description) ? 'service'
      : null;
  const fallbackKind = kind ?? (mitre.includes('T1053') ? 'task' : 'service');

  const signals = Object.entries(STRONG).filter(([, pattern]) => pattern.test(description)).map(([name]) => name);
  if (!signals.includes('userWritable') && TEMP_PATH.test(path)) signals.push('userWritable');
  if (!signals.includes('repeated') && count >= 2) signals.push('repeated');
  const softened = SOFTENING.test(description) || LAB_PATH.test(path);
  const normal = NORMAL.test(description);

  // 1) 서비스·예약 작업 경보가 뚜렷한 신호 둘 이상과 맞고 누그러뜨리는 사정이 없으면 차단 후보입니다.
  if (kind && signals.length >= 2 && !softened && !normal) {
    const confidence = 0.86 + 0.03 * (signals.length - 2) + (level >= 12 ? 0.02 : 0);
    return answer(Math.min(confidence, 0.98), PATTERNS[kind].name);
  }

  // 2) 정상 표식이 있고 뚜렷한 신호가 없으면 정상 이벤트입니다.
  if (normal && signals.length === 0) {
    return answer(0.05, '해당 패턴 없음');
  }

  // 3) 지속성 관련 흔적은 있지만 신호가 약하거나 정상 사유가 함께 있으면 알립니다.
  if (RELATED.test(description) || signals.length > 0 || (level >= 9 && mitre.length > 0)) {
    const confidence = 0.6 + 0.04 * Math.min(signals.length, 3) + (count >= 2 ? 0.04 : 0);
    return answer(Math.min(confidence, 0.8), `${PATTERNS[fallbackKind].name} — 신호가 약하거나 정상 사유가 함께 있음`);
  }

  return answer(0.05, '해당 패턴 없음');
}
