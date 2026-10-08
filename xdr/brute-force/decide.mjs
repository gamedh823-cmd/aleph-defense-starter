// 제작 3: decide(alert) 하나를 내보냅니다. 반환은 { action: 'block' | 'alert' | 'record', confidence, reason } 입니다.
// 확신도 0.85 이상은 block, 0.5 이상은 alert, 그 아래는 record 입니다.
// 명확한 공격은 패턴만으로 block 하고, 애매한 경보만 Jev에게 확신도를 묻습니다. Jev가 응답하지 않으면 alert 입니다.
import { askJev } from './jev.mjs';
import { decideWith } from './judge.mjs';

export async function decide(alert) {
  return decideWith(alert, askJev);
}
