import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../public/${path}`, import.meta.url), 'utf8');
const html = read('index.html');
const manifest = JSON.parse(read('manifest.webmanifest'));

test('설치형 웹앱 설정(manifest)이 화면에 연결되어 있고 필요한 항목이 있다', () => {
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/u);
  assert.match(html, /<meta name="theme-color"/u);
  for (const key of ['name', 'short_name', 'start_url', 'display', 'icons', 'theme_color', 'background_color']) assert.ok(manifest[key], key);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.ok(manifest.icons.every(icon => icon.src.startsWith('/') && icon.type));
  assert.match(read('icon.svg'), /<svg/u);
});

test('설치 표시만으로 기기가 확인됐다고 쓰지 않고, 승인은 서버가 정한다고 안내한다', () => {
  assert.match(html, /설치했다는 표시만으로 기기가 확인되지는 않습니다/u);
  assert.match(html, /기기 승인은 서버가 정하고, 승인 전에는 자료가 표시되지 않습니다/u);
  assert.match(html, /오프라인입니다/u);
  assert.match(manifest.description, /확인되지는 않습니다/u);
});

test('승인 전에는 자료 영역이 숨겨져 있고 자료 요청은 승인된 뒤에만 보낸다', () => {
  assert.match(html, /<section id="vault" hidden>/u);
  assert.match(html, /\$\('vault'\)\.hidden = state !== 'approved'/u);
  assert.match(html, /if \(state === 'approved'\) load\(\);/u);
  // load()를 부르는 곳: 승인 확인 뒤, 메모 수정·삭제·추가 뒤(모두 승인된 화면 안)뿐이다.
  const loads = html.match(/\bload\(\)/gu).length;
  assert.equal(loads, 5); // 정의 1 + 승인 1 + 수정·삭제·추가 3
});

test('기기 키·토큰을 브라우저 저장 공간에 넣지 않는다', () => {
  for (const word of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'caches.']) {
    assert.equal(html.includes(word), false, word);
  }
  assert.equal(/sb_(?:publishable|secret)_|eyJ[A-Za-z0-9_-]{12,}\.eyJ/u.test(html), false);
});
