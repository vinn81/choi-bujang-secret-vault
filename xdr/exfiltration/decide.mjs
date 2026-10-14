// xdr/exfiltration/patterns.json 의 패턴을 그대로 옮겨 둡니다. 두 곳을 함께 고칩니다.
// 심판은 인터넷 없이 이 파일 하나만 불러오므로 import·파일 읽기·외부 호출을 쓰지 않습니다.
const PATTERNS = Object.freeze({
  bulk: {
    name: '처음 보는 목적지로 대용량 전송',
    condition: '평소 목적지(자료실·수업 자료 주소)가 아닌 처음 보는 바깥 목적지(data.dstip)로 큰 전송(data.bytes 수십 MB 이상)이나 많은 파일(data.files 수십 건 이상)이 짧은 시간에 나가거나, 평소에 쓰지 않던 포트로 자료가 연속 전송된다.',
    evidence: 'MITRE ATT&CK T1048: 공격자는 기존 명령 통로와 다른 프로토콜·포트로 자료를 바깥 목적지에 내보내 유출한다.',
  },
  c2: {
    name: '명령 통로로 같은 목적지에 반복 전송',
    condition: '명령 통로(원격 조종 연결)로 큰 파일이 나가거나, 같은 바깥 목적지로 대용량 전송이 여러 번(data.count 5회 이상) 반복된다. 큰 파일이 아닌 짧은 이름 몇 건은 이 패턴만으로 단정하지 않는다.',
    evidence: 'MITRE ATT&CK T1041: 공격자는 이미 열어 둔 명령 통로(C2)를 그대로 써서 훔친 자료를 평소 통신에 섞어 내보낸다.',
  },
  archive: {
    name: '업무 시간 밖 압축 파일 반출',
    condition: '압축 파일이 업무(수업) 시간 밖에, 또는 여러 개가 연속으로 처음 보는 바깥 주소로 나간다. 압축만 하고 바깥 전송이 없거나 수업 시간의 백업처럼 보이는 한 건은 해당하지 않는다.',
    evidence: 'MITRE ATT&CK T1048: 공격자는 명령 통로가 아닌 다른 경로로 자료 묶음을 처음 보는 바깥 목적지에 내보내며, 정상 업무 흐름과 다른 시각·형태의 반출이 그 흔적이 된다.',
  },
});

const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

// 숫자 기준: 패턴 조건의 "수십 MB 이상", "수십 건 이상", "5회 이상"
const LARGE_BYTES = 50 * 1000 * 1000;
const MANY_FILES = 50;
const MANY_REPEATS = 5;

// 설명 문장의 신호입니다.
const TEXT = {
  unfamiliar: /처음\s*보는|외부\s*주소|두\s*곳/u,
  unusualPort: /평소에\s*쓰지\s*않던\s*포트/u,
  offHours: /(?:수업|업무)\s*시간\s*밖/u,
  archive: /압축\s*파일/u,
  c2: /명령\s*통로/u,
  consecutive: /연속|반복/u,
  wholeStore: /자료실\s*전체/u,
};
// 신호를 누그러뜨리는 사정(애매한 시도)입니다. "한 번에"는 대량 반출 표현이라 제외합니다.
const SOFTENING = /아직\s*없|실패|아닙니다|한\s*번(?!에)|\d+\s*건(?:이|을)?\s*(?:있|나갔|입니다)|백업처럼|일부만|평소\s*목적지|수업\s*자료\s*주소/u;
// 전송과 관련된 낱말(신호가 약해도 알릴 대상)
const RELATED = /전송|나갔|압축|명령\s*통로|목적지|주소/u;

const number = value => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};
const clamp = value => Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;

function answer(confidence, reason) {
  const value = clamp(confidence);
  const action = value >= BLOCK_AT ? 'block' : value >= ALERT_AT ? 'alert' : 'record';
  return { action, confidence: value, reason };
}

function patternFor(signals, mitre) {
  if (signals.includes('c2') || signals.includes('repeated')) return PATTERNS.c2;
  if (signals.includes('archive') && (signals.includes('offHours') || signals.includes('consecutive'))) return PATTERNS.archive;
  if (signals.length > 0) return PATTERNS.bulk;
  return mitre.includes('T1041') ? PATTERNS.c2 : PATTERNS.bulk;
}

export function decide(alert) {
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const level = Number.isFinite(alert?.rule?.level) ? alert.rule.level : 0;
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const bytes = number(alert?.data?.bytes);
  const files = number(alert?.data?.files);
  const count = number(alert?.data?.count);

  const large = bytes >= LARGE_BYTES;
  const signals = Object.entries(TEXT).filter(([, pattern]) => pattern.test(description)).map(([name]) => name);
  if (files >= MANY_FILES) signals.push('manyFiles');
  if (count >= MANY_REPEATS) signals.push('repeated');
  const softened = SOFTENING.test(description);
  const pattern = patternFor(signals, mitre);

  // 1) 큰 전송에 다른 뚜렷한 신호가 하나 이상 겹치고 누그러뜨리는 사정이 없으면 목적지 차단 후보입니다.
  if (large && signals.length >= 1 && !softened) {
    const confidence = 0.86 + 0.03 * (signals.length - 1) + (level >= 12 ? 0.02 : 0);
    return answer(Math.min(confidence, 0.98), pattern.name);
  }

  // 2) 수준이 낮고 큰 전송·뚜렷한 신호가 없으면 정상 이벤트입니다.
  if (level <= 3 && !large && !signals.some(name => name !== 'unfamiliar')) {
    return answer(0.05, '해당 패턴 없음');
  }

  // 3) 전송 관련 흔적은 있지만 신호가 약하거나 정상 사유가 함께 있으면 알립니다.
  if (large || signals.length > 0 || (mitre.length > 0 && RELATED.test(description))) {
    const confidence = 0.6 + 0.04 * Math.min(signals.length, 3) + (large ? 0.1 : 0);
    return answer(Math.min(confidence, 0.84), `${pattern.name} — 신호가 약하거나 정상 사유가 함께 있음`);
  }

  return answer(0.05, '해당 패턴 없음');
}
