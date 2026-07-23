# 협업 캐릭터 모션 (회의실 집결) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대시보드 씬에서 부모 세션이 활성 서브에이전트를 가지면 그 클러스터가 회의실로 걸어가 회의하고, 끝나면 책상으로 돌아오는 모션을 추가한다.

**Architecture:** `#floor`의 innerHTML 통째 교체 렌더를 **id 기준 지속 슬롯 렌더**로 바꾼다. 각 아바타는 transform transition을 가진 영속 wrapper(`.slot`)에 담고, wrapper의 위치(`--x/--y`)만 상태에 따라 갱신하면 CSS transition이 이동을 트윈한다. wrapper 내부 HTML은 매 폴링 새로 채워도 위치는 유지된다.

**Tech Stack:** 단일 파일 `monitor.html` (Vanilla JS + CSS, 빌드 없음). 검증은 Docker로 뜬 로컬 서버(`http://127.0.0.1:9191/monitor.html`) + 브라우저/Playwright 스크린샷 + 합성 `activity.jsonl`.

## Global Constraints

- 파일 단일 수정: `monitor.html`. 데이터 파이프라인/서버/승인 API/Docker 무변경.
- 애니메이트 속성은 `transform`/`opacity`만 (width/height/top/left/margin 등 금지).
- `prefers-reduced-motion: reduce`에서 이동/키프레임을 끄고 위치는 즉시 스냅.
- 커밋 메시지 형식: `feat: ...` / `refactor: ...` (conventional commits).
- 검증 폭: 320 / 768 / 1024 / 1440 에서 겹침·오버플로 없음.
- 게이트(GateGuard)로 인해 Bash/Edit 전에 요구 사실을 먼저 제시해야 함.

---

## 사전 준비: 합성 로그로 회의 상태 재현

구현 검증 내내 쓰는 고정 픽스처. 실제 `activity.jsonl`은 훅이 계속 덮으므로, 검증은 브라우저 콘솔에서 `deriveView`에 주입해 강제 렌더한다.

```js
// 회의 상태(부모+활성 서브 2)와 일반 데스크 2를 섞은 합성 뷰
const now = Date.now(), iso = t => new Date(t).toISOString();
window.__SEED_MEETING = [
  {ts:iso(now-1000), session:"S-lead",  event:"PreToolUse", tool:"Task", summary:"코드리뷰 착수", project:"A004", kind:"main"},
  {ts:iso(now-800),  session:"C-rev",   event:"SubagentStart", agentType:"ecc:code-reviewer", parent:"S-lead", project:"A004", kind:"subagent"},
  {ts:iso(now-500),  session:"C-sec",   event:"PostToolUse", tool:"Grep", agentType:"ecc:security-reviewer", parent:"S-lead", project:"A004", kind:"subagent"},
  {ts:iso(now-1200), session:"S-solo",  event:"PostToolUse", tool:"Edit", summary:"카드 스타일 수정", project:"A001", kind:"main"},
  {ts:iso(now-3000), session:"S-idle2", event:"Stop", summary:"완료", project:"A002", kind:"main"},
];
render(deriveView(window.__SEED_MEETING, Date.now()));
```

---

### Task 1: 회의실 구역 + 좌표 컨테이너 전환 (CSS)

`#floor`를 flex 흐름에서 **좌표 배치 컨테이너**로 바꾸고, 씬 안에 회의실 존(러그+원형 테이블)을 추가한다. 이 태스크만으로는 아직 아바타가 좌표로 움직이지 않지만(다음 태스크), 회의실이 씬에 보이고 floor가 relative 컨테이너가 된다.

**Files:**
- Modify: `monitor.html` — `.floor` 규칙 (line 88-89), `#scene` 마크업 (line 279-291), MOTION 섹션 하단 (line 219 이후)

**Interfaces:**
- Produces: CSS 클래스 `.slot`(영속 wrapper), `.room-zone`(회의실 SVG 컨테이너), CSS 변수 `--x`,`--y`. 이후 태스크의 JS가 `.slot`을 생성하고 `--x/--y`를 설정한다.

- [ ] **Step 1: `.floor`를 좌표 컨테이너로 교체**

`monitor.html` line 88-89의 `.floor` 규칙을 아래로 교체:

```css
  .floor{position:relative; z-index:2; width:100%; min-height:300px; height:44vh; max-height:520px}
  /* 영속 슬롯: 위치만 transform transition으로 트윈. 내부 HTML은 매 폴링 교체됨. */
  .slot{position:absolute; left:0; top:0; will-change:transform;
    transform:translate(var(--x,0), var(--y,0));
    transition:transform .95s cubic-bezier(.22,1,.36,1)}
  .slot.moving .desk-cluster{animation:walkBob .5s var(--ease) infinite}
```

- [ ] **Step 2: 회의실 존 마크업 추가**

`monitor.html` line 289 `<div class="floor" id="floor"></div>` **바로 앞**에 회의실 SVG 존을 삽입:

```html
      <svg class="room-zone" id="room-zone" viewBox="0 0 300 200" preserveAspectRatio="none" aria-hidden="true">
        <ellipse class="rug" cx="150" cy="120" rx="120" ry="60"/>
        <ellipse class="mtable" cx="150" cy="118" rx="64" ry="30"/>
        <ellipse class="mtable-top" cx="150" cy="110" rx="64" ry="30"/>
        <g class="mtable-icon" transform="translate(150 108)">
          <rect x="-9" y="-11" width="18" height="22" rx="2" class="doc"/>
          <line x1="-5" y1="-5" x2="5" y2="-5"/><line x1="-5" y1="0" x2="5" y2="0"/><line x1="-5" y1="5" x2="2" y2="5"/>
        </g>
      </svg>
      <div class="room-label" id="room-label" hidden>회의 중</div>
```

- [ ] **Step 3: 회의실 존 스타일 추가**

`monitor.html` MOTION 섹션 시작(line 205 `/* ═══ MOTION ═══ */`) **바로 앞**에 삽입:

```css
  /* ═══════ 회의실 존 ═══════ */
  .room-zone{position:absolute; pointer-events:none; z-index:1; opacity:.9;
    transition:opacity var(--dur-slow) var(--ease)}
  .room-zone .rug{fill:oklch(30% 0.04 275 / .55); stroke:var(--line); stroke-width:1}
  .room-zone .mtable{fill:oklch(26% 0.05 262)}
  .room-zone .mtable-top{fill:oklch(34% 0.05 262); stroke:var(--line); stroke-width:1}
  .room-zone .mtable-icon .doc{fill:oklch(88% 0.03 250 / .9)}
  .room-zone .mtable-icon line{stroke:oklch(40% 0.06 262); stroke-width:1.2; stroke-linecap:round}
  .room-label{position:absolute; z-index:2; font:700 10px/1 var(--mono); letter-spacing:.16em;
    text-transform:uppercase; color:var(--st-thinking); pointer-events:none;
    background:color-mix(in oklch, var(--st-thinking) 14%, transparent);
    border:1px solid var(--st-thinking); border-radius:99px; padding:4px 9px;
    transform:translate(-50%,-50%)}
  /* 회의 인원 없을 때 회의실은 은은히 죽임 */
  .room-zone.dim{opacity:.4}
```

- [ ] **Step 4: 걷기 bob 키프레임 추가**

`monitor.html` line 219 `@keyframes bang{...}` **다음 줄**에 삽입:

```css
  @keyframes walkBob{0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px) rotate(-1deg)}}
```

- [ ] **Step 5: 시각 확인**

Docker 서버가 떠 있는지 확인 후 브라우저로 `http://127.0.0.1:9191/monitor.html` 접속. 회의실 러그+테이블이 씬 안에 보이는지 확인(아바타는 아직 예전 위치). 콘솔 에러 없어야 함.

- [ ] **Step 6: 커밋**

```bash
git add monitor.html
git commit -m "feat: add meeting-room zone and coordinate floor container"
```

---

### Task 2: 지속 슬롯 렌더러 (innerHTML 교체 → id 재조정)

`render()`의 `floor.innerHTML = ...` 방식을 영속 `.slot` wrapper 재조정으로 교체한다. 이 태스크 후 아바타는 `.slot`에 담겨 transform으로 배치되며, 폴링해도 슬롯이 리셋되지 않는다. (아직 회의 이동은 없음 — 전부 데스크 위치.)

**Files:**
- Modify: `monitor.html` — `render()` (line 498-510), RENDER 섹션에 헬퍼 추가

**Interfaces:**
- Consumes: 기존 `agentNode(a)` (문자열 마크업 반환), `$` 헬퍼.
- Produces: `Map` `SLOTS` (id→slot el), 함수 `renderFloor(agents)`, `placeSlot(a, pos, moving)`. Task 3이 `deskPos/seatPos`로 계산한 pos를 넘겨 호출한다. 이 태스크에서는 임시로 전 아바타를 세로 중앙 한 줄에 배치.

- [ ] **Step 1: 슬롯 재조정 렌더러 추가**

`monitor.html` line 496 `/* ═══ RENDER ═══ */` 다음, `let VIEW=null;` 위에 삽입:

```js
const SLOTS = new Map();               // agentId -> 영속 wrapper(.slot)
function placeSlot(a, pos, moving){
  let el = SLOTS.get(a.id);
  if(!el){
    el = document.createElement("div");
    el.className = "slot";
    $("#floor").appendChild(el);
    SLOTS.set(a.id, el);
  }
  el.innerHTML = agentNode(a);          // 내부는 매번 새로 (위치는 slot에 있으므로 유지)
  const w = el.offsetWidth || 150, h = el.offsetHeight || 170;
  el.style.setProperty("--x", (pos.x - w/2) + "px");
  el.style.setProperty("--y", (pos.y - h/2) + "px");
  el.classList.toggle("meeting", !!a.meeting);
  if(moving){
    el.classList.add("moving");
    clearTimeout(el._mt);
    el._mt = setTimeout(()=>el.classList.remove("moving"), 1000);
  }
}
function renderFloor(agents){
  const floor = $("#floor");
  const W = floor.clientWidth || 800, H = floor.clientHeight || 300;
  const seen = new Set();
  // 임시 배치: 전원 세로 중앙 한 줄(다음 태스크에서 deskPos/seatPos로 교체)
  agents.forEach((a,i)=>{
    seen.add(a.id);
    const x = (W/(agents.length+1))*(i+1), y = H*0.6;
    placeSlot(a, {x,y}, false);
  });
  for(const [id,el] of SLOTS){ if(!seen.has(id)){ clearTimeout(el._mt); el.remove(); SLOTS.delete(id); } }
}
```

- [ ] **Step 2: `render()`에서 floor 부분 교체**

`monitor.html` line 500-502 (아래) 를

```js
  const floor=$("#floor"), empty=$("#empty");
  if(v.agents.length){ empty.hidden=true; floor.innerHTML=v.agents.map(agentNode).join(""); }
  else { floor.innerHTML=""; empty.hidden=false; }
```

다음으로 교체:

```js
  const empty=$("#empty");
  if(v.agents.length){ empty.hidden=true; renderFloor(v.agents); }
  else { for(const [id,el] of SLOTS){ el.remove(); SLOTS.delete(id); } empty.hidden=false; }
```

- [ ] **Step 3: 시각 확인 (폴링 지속성)**

브라우저 새로고침 → 아바타가 한 줄로 배치되는지 확인. 브라우저 콘솔에서 위 "사전 준비" 시드를 두 번 실행 → 아바타가 깜빡임 없이 위치가 유지·재사용되는지 확인. DevTools Elements에서 `#floor > .slot` 노드가 재사용(추가 폭증 없음)되는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add monitor.html
git commit -m "refactor: persistent slot renderer for floor (id reconciliation)"
```

---

### Task 3: meeting 플래그 + 좌표 기하 + 이동 배선

부모의 활성 서브에이전트 유무로 `meeting` 플래그를 계산하고, 데스크/회의좌석 좌표를 실제로 계산해 이동시킨다. 리사이즈 시 재배치. 이 태스크 후 회의 조건에서 클러스터가 회의실로 걸어간다.

**Files:**
- Modify: `monitor.html` — `deriveView()` (line 468-471 부근), `renderFloor()` (Task 2에서 추가), 폴링/리사이즈 배선 (line 544-546 부근)

**Interfaces:**
- Consumes: `SLOTS`, `placeSlot`, agents 배열(각 `a.subs`, `a.status`).
- Produces: 함수 `computeLayout()`→`{W,H,wide,stage,room}`, `deskPos(i,n,L)`→`{x,y}`, `seatPos(k,m,L)`→`{x,y}`. agents 각 원소에 boolean `a.meeting`.

- [ ] **Step 1: `meeting` 플래그 계산**

`monitor.html` line 468-471 의 subs 부착 루프

```js
  for(const a of agents){
    a.subs=(childByParent.get(a.id)||[]).sort((x,y)=>y._t-x._t);
    subCount += a.subs.length;
  }
```

를 다음으로 교체(플래그 한 줄 추가):

```js
  for(const a of agents){
    a.subs=(childByParent.get(a.id)||[]).sort((x,y)=>y._t-x._t);
    subCount += a.subs.length;
    a.meeting = a.subs.some(s=> s.status==="working" || s.status==="thinking");
  }
```

- [ ] **Step 2: 좌표 기하 함수 추가**

`monitor.html` Task 2에서 추가한 `SLOTS` 선언 **바로 아래**에 삽입:

```js
function computeLayout(){
  const floor=$("#floor"); const W=floor.clientWidth||800, H=floor.clientHeight||300;
  const wide = W>=860;
  const stage = wide ? {x0:W*0.02, x1:W*0.58, yc:H*0.62}
                     : {x0:W*0.02, x1:W*0.98, yc:H*0.26};
  const room  = wide ? {cx:W*0.80, cy:H*0.55, r:Math.min(W*0.14, H*0.32)}
                     : {cx:W*0.50, cy:H*0.76, r:Math.min(W*0.32, H*0.20)};
  return {W,H,wide,stage,room};
}
function deskPos(i,n,L){ const s=L.stage; const gap=(s.x1-s.x0)/Math.max(1,n);
  return {x:s.x0 + gap*(i+0.5), y:s.yc}; }
function seatPos(k,m,L){ const r=L.room; const a=-Math.PI/2 + k*(2*Math.PI/Math.max(1,m));
  return {x:r.cx + r.r*Math.cos(a), y:r.cy + r.r*Math.sin(a)}; }
```

- [ ] **Step 3: `renderFloor`를 실제 좌표로 교체**

Task 2에서 넣은 `renderFloor` 전체를 다음으로 교체:

```js
function renderFloor(agents){
  const L = computeLayout();
  const seen = new Set();
  const deskAgents = agents.filter(a=>!a.meeting);
  const meetAgents = agents.filter(a=>a.meeting);
  const place = (a, pos)=>{
    seen.add(a.id);
    const el = SLOTS.get(a.id);
    // 이전 목표와 비교해 이동 여부 판정(초기 등장은 이동 아님)
    let moving=false;
    if(el){ const px=el._px, py=el._py;
      if(px!=null && (Math.abs(px-pos.x)>6 || Math.abs(py-pos.y)>6)) moving=true; }
    placeSlot(a, pos, moving);
    const s=SLOTS.get(a.id); s._px=pos.x; s._py=pos.y;
  };
  deskAgents.forEach((a,i)=> place(a, deskPos(i, deskAgents.length, L)));
  meetAgents.forEach((a,k)=> place(a, seatPos(k, meetAgents.length, L)));
  for(const [id,el] of SLOTS){ if(!seen.has(id)){ clearTimeout(el._mt); el.remove(); SLOTS.delete(id); } }
  // 회의실 라벨/딤
  const label=$("#room-label"), zone=$("#room-zone");
  if(meetAgents.length){ zone.classList.remove("dim");
    label.hidden=false; label.style.left=L.room.cx+"px"; label.style.top=(L.room.cy - L.room.r - 14)+"px"; }
  else { zone.classList.add("dim"); label.hidden=true; }
}
```

- [ ] **Step 4: 리사이즈 재배치 배선**

`monitor.html` line 546 `setInterval(tick, 1000);` **다음 줄**에 삽입:

```js
let _rz; window.addEventListener("resize", ()=>{ clearTimeout(_rz);
  _rz=setTimeout(()=>{ if(VIEW) renderFloor(VIEW.agents); }, 150); });
```

- [ ] **Step 5: 시각 확인 (회의 이동)**

브라우저 콘솔에서 "사전 준비" 시드 실행 → 부모 `S-lead`(+서브 2개 nested)가 회의실 원형 좌석으로 **걸어가고**, 데스크 세션(`S-solo`,`S-idle2`)은 무대에 남는지 확인. "회의 중" 라벨이 테이블 위에 뜨는지 확인. 이어서 활성 서브가 없는 시드(위 배열에서 subagent 2줄 제거)로 render → 클러스터가 데스크로 복귀하는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add monitor.html
git commit -m "feat: meeting flag + desk/seat geometry drives walk-to-meeting motion"
```

---

### Task 4: 모션 폴리시 + 접근성 + 반응형 검증

회의 중 미세 bob과 말풍선 "대화", reduced-motion 스냅, 그리고 4개 폭 회귀 확인.

**Files:**
- Modify: `monitor.html` — CSS(회의 상태 스타일, reduced-motion 블록)

**Interfaces:**
- Consumes: `.slot.meeting` (Task 2에서 토글), `.thought` (기존).

- [ ] **Step 1: 회의 중 모션 CSS 추가**

`monitor.html` Task 1에서 넣은 `.slot.moving ...` 규칙 **바로 아래**에 삽입:

```css
  /* 회의 중: 좌석에서 미세 bob + 말풍선 대화 */
  .slot.meeting .desk-cluster{animation:breathe 3.2s var(--ease) infinite}
  .slot.meeting .thought{opacity:1; transform:scale(1) translateY(0)}
  .slot.meeting .thought i{animation:dot 1.4s ease-in-out infinite}
  .slot.meeting:nth-child(2n) .thought i{animation-delay:.5s}
  .slot.meeting:nth-child(3n) .thought i{animation-delay:.9s}
```

- [ ] **Step 2: reduced-motion 블록 추가**

`monitor.html` MOTION 섹션(키프레임들) **다음**, `</style>` 이전에 삽입:

```css
  @media (prefers-reduced-motion: reduce){
    .slot{transition:none}
    .slot.moving .desk-cluster,
    .slot.meeting .desk-cluster,
    .slot.meeting .thought i{animation:none}
  }
```

- [ ] **Step 3: 시각 확인 — reduced-motion**

DevTools > Rendering > "Emulate CSS prefers-reduced-motion: reduce" 켜고, 시드 재실행 → 아바타가 활공 없이 즉시 회의좌석으로 스냅, 말풍선 점 애니메이션 정지 확인.

- [ ] **Step 4: 반응형 회귀 확인 (320/768/1024/1440)**

각 폭에서 회의 시드로 렌더 후 확인: 무대 아바타와 회의실이 겹치지 않음, 가로 스크롤 없음, 좁은 폭(320/768)에서 회의실이 무대 아래(narrow 레이아웃)로 내려감. Playwright 사용 시:

```
browser_resize(320,800) → browser_take_screenshot
browser_resize(768,900) → browser_take_screenshot
browser_resize(1024,800) → browser_take_screenshot
browser_resize(1440,900) → browser_take_screenshot
```

- [ ] **Step 5: 커밋**

```bash
git add monitor.html
git commit -m "feat: in-meeting bob + speech bubbles, reduced-motion snap"
```

---

## Self-Review

- **Spec coverage:** 지속 렌더러(§1)=Task 2 · 좌표 계층(§2)=Task 3 · 회의실 존(§3)=Task 1 · 상태 머신/meeting 플래그(§4)=Task 3 · 모션 디테일(§5)=Task 1/4 · 접근성(§6)=Task 4 · 반응형/검증=Task 3·4. 무변경 항목(데이터/서버/승인)은 어떤 태스크도 건드리지 않음. 갭 없음.
- **Placeholder scan:** 모든 코드 스텝에 실제 코드 포함, "TBD/적절히 처리" 없음. Task 2의 임시 배치는 Task 3에서 명시적으로 교체됨(플레이스홀더 아님, 점진 구현).
- **Type consistency:** `SLOTS`,`placeSlot(a,pos,moving)`,`renderFloor(agents)`,`computeLayout()`,`deskPos(i,n,L)`,`seatPos(k,m,L)` 이름/시그니처가 태스크 간 일치. `a.meeting` 불리언 일관.
