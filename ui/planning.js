const ACCENTS = ['#E8720C','#B8511F','#8A3A15'];
const MUTED = ['#5B7A99','#7C8CA3','#4E6580','#8B98AC'];

let tasks = [];
let nextId = 1;

// consistent color per task: top3(critical)는 강조색, 나머지는 muted색을 순서대로 배정
function colorForTask(t){
  if(t.critical){
    const i = tasks.filter(x=>x.critical).indexOf(t);
    return ACCENTS[i % ACCENTS.length];
  }
  const i = tasks.filter(x=>!x.critical).indexOf(t);
  return MUTED[i % MUTED.length];
}

const wakeInput = document.getElementById('wakeTime');
const bedInput = document.getElementById('bedTime');
const taskForm = document.getElementById('taskForm');
const taskInput = document.getElementById('taskInput');
const taskListEl = document.getElementById('taskList');
const limitMsg = document.getElementById('limitMsg');
const allocationListEl = document.getElementById('allocationList');
const timeWarn = document.getElementById('timeWarn');

function getWindow(){
  const wakeMin = timeToMin(wakeInput.value || '07:00');
  let bedMin = timeToMin(bedInput.value || '23:00');
  // 취침 시각이 기상 시각보다 이르거나 같으면(예: 기상 07:00, 취침 03:00) 자정을 넘긴 다음날 새벽으로 보고 하루를 연장한다.
  if(bedMin <= wakeMin) bedMin += 1440;
  return { wakeMin, bedMin, awakeMinutes: bedMin - wakeMin };
}

function addTask(text){
  tasks.push({ id: nextId++, text, critical:false, locked:false });
}

function criticalCount(){
  return tasks.filter(t=>t.critical).length;
}

taskForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const v = taskInput.value.trim();
  if(!v) return;
  addTask(v);
  taskInput.value = '';
  render();
});

function renderTaskList(){
  taskListEl.innerHTML = '';
  if(tasks.length===0){
    taskListEl.innerHTML = '<li class="empty">아직 기록된 일이 없어요. 오늘 할 일을 적어보세요.</li>';
    return;
  }
  tasks.forEach(t=>{
    const li = document.createElement('li');
    li.className = 'task-item' + (t.critical ? ' critical' : '');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = t.critical;
    cb.title = 'Top3로 표시 (일정 배분에는 모든 항목이 포함됩니다)';
    cb.addEventListener('change', ()=>{
      if(cb.checked && criticalCount()>=3){
        cb.checked = false;
        limitMsg.classList.add('show');
        setTimeout(()=>limitMsg.classList.remove('show'), 2200);
        return;
      }
      t.critical = cb.checked;
      render();
    });

    const span = document.createElement('span');
    span.className = 'txt';
    span.textContent = (t.critical ? '★ ' : '') + t.text;

    const del = document.createElement('button');
    del.className = 'del';
    del.type = 'button';
    del.textContent = '✕';
    del.addEventListener('click', ()=>{
      tasks = tasks.filter(x=>x.id!==t.id);
      render();
    });

    li.append(cb, span, del);
    taskListEl.appendChild(li);
  });
}

// 새로 추가한 일정은 시간을 자동으로 배정하지 않고 빈 칸으로 둔다.
// (자동 15분 배정은 하루 앞쪽에 일정이 뭉치기 쉽고, "일단 채워져 있으니 괜찮겠지" 하고
//  완료를 눌러버리기 쉬워서, 사용자가 직접 시간을 정하도록 명확히 요구하는 쪽으로 바꿈)

// "미루기" 기능을 만들 때 이 함수를 통해서만 시간을 미세요.
// locked === true인 일정은 절대 밀리지 않습니다.
function shiftTaskTime(t, deltaMinutes){
  if(t.locked) return false;
  t.startMin += deltaMinutes;
  t.endMin += deltaMinutes;
  return true;
}

function renderAllocation(){
  const { wakeMin, bedMin } = getWindow();
  allocationListEl.innerHTML = '';

  if(tasks.length===0){
    allocationListEl.innerHTML = '<p class="empty">Phase 02에서 할 일을 먼저 기록하세요.</p>';
    document.getElementById('allocationReadout').textContent = '';
    return;
  }

  // 새로 추가된 일정은 시간이 비어있는 채로 그대로 표시됨 (자동 배정 안 함)

  tasks.forEach(t=>{
    const row = document.createElement('div');
    row.className = 'alloc-row' + (t.locked ? ' locked' : '');

    const dot = document.createElement('span');
    dot.className = 'alloc-dot';
    dot.style.background = colorForTask(t);

    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.className = 'lock-btn' + (t.locked ? ' locked' : '');
    if(t.routineLocked){
      lockBtn.disabled = true;
      lockBtn.title = '루틴에서 "미루기 금지"로 설정된 일정이라 여기서는 바꿀 수 없어요. (루틴 설정 페이지에서 변경하세요)';
    } else {
      lockBtn.title = t.locked
        ? '고정 해제하기'
        : '이 시간 고정하기 (나중에 "미루기" 기능에도 영향받지 않아요)';
    }
    lockBtn.textContent = t.locked ? '🔒' : '🔓';
    lockBtn.addEventListener('click', ()=>{
      if(t.routineLocked) return; // 루틴에서 정해진 잠금은 여기서 못 바꿈
      t.locked = !t.locked;
      render();
    });

    const name = document.createElement('span');
    name.className = 'alloc-name';
    name.textContent = (t.critical ? '★ ' : '') + t.text;

    const wrap = document.createElement('div');
    wrap.className = 'alloc-time-wrap';

    const hasStart = t.startMin !== undefined;
    const hasEnd = t.endMin !== undefined;

    const startInput = document.createElement('input');
    startInput.type = 'text';
    startInput.className = 'clock-input';
    startInput.placeholder = 'HH:MM';
    startInput.inputMode = 'numeric';
    startInput.maxLength = 5;
    startInput.value = hasStart ? minToClock(t.startMin) : '';
    startInput.disabled = !!t.locked;
    startInput.addEventListener('change', ()=>{
      t.startMin = normalizeToWindow(timeToMin(startInput.value), wakeMin);
      render();
    });
    normalizeClockInput(startInput);

    const dash = document.createElement('span');
    dash.className = 'alloc-dash';
    dash.textContent = '~';

    const endInput = document.createElement('input');
    endInput.type = 'text';
    endInput.className = 'clock-input';
    endInput.placeholder = 'HH:MM';
    endInput.inputMode = 'numeric';
    endInput.maxLength = 5;
    endInput.value = hasEnd ? minToClock(t.endMin) : '';
    endInput.disabled = !!t.locked;
    endInput.addEventListener('change', ()=>{
      t.endMin = normalizeToWindow(timeToMin(endInput.value), wakeMin);
      render();
    });
    normalizeClockInput(endInput);

    const dur = document.createElement('span');
    dur.className = 'alloc-dur';
    if(!hasStart || !hasEnd){
      dur.textContent = '시간을 정해주세요';
      dur.classList.add('bad');
    } else {
      const duration = t.endMin - t.startMin;
      dur.textContent = duration > 0 ? minToHM(duration) : '⚠ 시간 오류';
      if(duration <= 0) dur.classList.add('bad');
    }

    wrap.append(startInput, dash, endInput, dur);
    row.append(dot, lockBtn, name, wrap);
    allocationListEl.appendChild(row);
  });

  const readout = document.getElementById('allocationReadout');
  const issues = [];

  const crossDayIssue = getCrossDayIssue(wakeMin);
  if(crossDayIssue) issues.push(crossDayIssue);

  tasks.forEach(t=>{
    if(t.startMin === undefined || t.endMin === undefined){
      issues.push(`"${t.text}"의 시간을 아직 정하지 않았어요`);
    } else if(t.endMin <= t.startMin){
      issues.push(`"${t.text}"의 종료 시각이 시작 시각보다 빨라요`);
    } else if(t.startMin < wakeMin || t.endMin > bedMin){
      issues.push(`"${t.text}"이 깨어있는 시간(${minToClock(wakeMin)}~${minToClock(bedMin)}) 밖에 있어요`);
    }
  });

  const validSorted = tasks
    .filter(t=>t.startMin !== undefined && t.endMin !== undefined && t.endMin > t.startMin)
    .sort((a,b)=>a.startMin - b.startMin);
  for(let i=0; i<validSorted.length-1; i++){
    if(validSorted[i].endMin > validSorted[i+1].startMin){
      issues.push(`"${validSorted[i].text}"과 "${validSorted[i+1].text}"의 시간이 겹쳐요`);
    }
  }

  const merged = mergeIntervals(validSorted.map(t=>[
    Math.max(wakeMin, t.startMin), Math.min(bedMin, t.endMin)
  ]));
  const coverage = merged.reduce((s,[a,b])=>s+(b-a),0);
  const awakeMinutes = bedMin - wakeMin;
  const remaining = Math.max(0, awakeMinutes - coverage);

    const top3Ready = criticalCount() === 3;

    if(issues.length > 0){
      readout.className = 'readout danger';
      readout.textContent = '⚠ ' + issues.join(' · ');
      completeBtn.disabled = true;
    } else if(!top3Ready){
      readout.className = 'readout danger';
      readout.textContent = `⚠ Top3를 3개 선택해야 완료할 수 있어요 (지금 ${criticalCount()}개 선택됨)`;
      completeBtn.disabled = true;
    } else {
      readout.className = 'readout';
      readout.textContent = `${tasks.length}개 일정 배치 완료: ${minToHM(coverage)} 사용 · 여유 ${minToHM(remaining)} 남음`;
      completeBtn.disabled = false;
    }
  }
function renderReadout(){
  const { wakeMin, bedMin, awakeMinutes } = getWindow();
  const crossDayIssue = getCrossDayIssue(wakeMin);
  timeWarn.textContent = crossDayIssue || '';
  timeWarn.style.display = crossDayIssue ? 'block' : 'none';
  document.getElementById('awakeReadout').textContent =
    `가용시간(깨어있는 시간): ${minToHM(awakeMinutes)}  (${minToClock(wakeMin)} ~ ${minToClock(bedMin)})`;
}

function renderTimeline(){
  const { wakeMin, bedMin } = getWindow();
  const scheduled = tasks.filter(t=>t.endMin > t.startMin);
  const timelineEl = document.getElementById('timeline');
  const legendEl = document.getElementById('legend');
  timelineEl.innerHTML = '';
  legendEl.innerHTML = '';

  const DAY = 1440;
  // 막대를 자정(00:00) 기준이 아니라 "기상 시각부터 24시간" 기준으로 그린다.
  // 이렇게 하면 취침 시각이 자정을 넘기더라도(예: 03:00) 막대 밖으로 밀려서 잘리는 일이 없다.
  const pct = (m) => ((m - wakeMin) / DAY * 100);

  function addSeg(top, height, color, warn, locked){
    if(height<=0) return;
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.style.top = pct(top)+'%';
    seg.style.height = (height/DAY*100)+'%';
    seg.style.background = color;
    if(warn) seg.style.boxShadow = 'inset 0 0 0 2px var(--danger)';
    if(locked) seg.style.outline = '2px dashed rgba(255,255,255,.7)';
    timelineEl.appendChild(seg);
  }

  // 취침 시각부터 (기상 시각 + 24시간)까지가 수면 구간
  addSeg(bedMin, (wakeMin + DAY) - bedMin, 'var(--sleep)');

  const sorted = [...scheduled].sort((a,b)=>a.startMin-b.startMin);
  const overlapping = new Set();
  for(let i=0; i<sorted.length-1; i++){
    if(sorted[i].endMin > sorted[i+1].startMin){
      overlapping.add(sorted[i].id);
      overlapping.add(sorted[i+1].id);
    }
  }

  scheduled.forEach(t=>{
    const s = Math.max(wakeMin, t.startMin);
    const e = Math.min(bedMin, t.endMin);
    addSeg(s, e-s, colorForTask(t), overlapping.has(t.id), t.locked);
  });

  const merged = mergeIntervals(sorted.map(t=>[
    Math.max(wakeMin, t.startMin), Math.min(bedMin, t.endMin)
  ]));
  let cursor = wakeMin;
  merged.forEach(([s,e])=>{
    if(s > cursor) addSeg(cursor, s-cursor, 'var(--free)');
    cursor = Math.max(cursor, e);
  });
  if(cursor < bedMin) addSeg(cursor, bedMin-cursor, 'var(--free)');

  // 3시간 간격 눈금: 기상 시각부터 24시간 동안, 라벨은 실제 시계 시각(0~23시)으로 표시
  for(let k=0; k<=8; k++){
    const tickMin = wakeMin + k*180;
    const clockHour = Math.floor((((tickMin % 1440) + 1440) % 1440) / 60);
    const tick = document.createElement('div');
    tick.className = 'tick';
    tick.style.top = pct(tickMin)+'%';
    timelineEl.appendChild(tick);
    const lab = document.createElement('div');
    lab.className = 'tick-label';
    lab.style.top = pct(tickMin)+'%';
    lab.textContent = String(clockHour).padStart(2,'0');
    timelineEl.appendChild(lab);
  }

  const now = new Date();
  const nowMinRaw = now.getHours()*60 + now.getMinutes();
  const nowMin = normalizeToWindow(nowMinRaw, wakeMin);
  // 지금 시각이 이 막대가 나타내는 24시간(기상~기상+24h) 범위 안일 때만 표시
  if(nowMin >= wakeMin && nowMin <= wakeMin + DAY){
    const nowLine = document.createElement('div');
    nowLine.className = 'now-line';
    nowLine.style.top = pct(nowMin)+'%';
    timelineEl.appendChild(nowLine);
  }

  function legendItem(color, text){
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = color;
    li.append(dot, document.createTextNode(text));
    legendEl.appendChild(li);
  }
  const awakeMinutes = bedMin - wakeMin;
  const coverage = merged.reduce((s,[a,b])=>s+(b-a),0);
  legendItem('#9AB0C9', `수면 · ${minToHM(DAY-awakeMinutes)}`);
  scheduled.forEach(t=>{
    legendItem(colorForTask(t), `${t.locked ? '🔒 ' : ''}${t.critical ? '★ ' : ''}${t.text} · ${minToClock(t.startMin)}~${minToClock(t.endMin)}`);
  });
  legendItem('#D8DEE6', `여유 · ${minToHM(Math.max(0, awakeMinutes-coverage))}`);
}

function render(){
  renderReadout();
  renderTaskList();
  renderAllocation();
  renderTimeline();
}

wakeInput.addEventListener('input', render);
bedInput.addEventListener('input', render);
normalizeClockInput(wakeInput);
normalizeClockInput(bedInput);

// planTargetDate: 지금 화면에서 편집 중인 대상 날짜 ('오늘' 또는 '다음날' 중 선택)
// activeDate: 기상 시각 기준으로 판단한 "지금 활성화된 하루" (schedule.html과 동일한 기준)
// tomorrowDate: activeDate의 다음날
let planTargetDate = null;
let activeDate = null;
let tomorrowDate = null;
// 오늘(activeDate)의 취침 시각 (자정을 넘겼으면 1440+ 로 연장된 값). 다음날 계획을 검증할 때 씀.
let todayBedMinExtended = null;

// 다음날을 계획 중일 때: 오늘 취침 시각보다 일찍 일어나는 건 논리적으로 모순이므로 검증한다.
function getCrossDayIssue(wakeMin){
  if(planTargetDate === tomorrowDate && todayBedMinExtended != null){
    const requiredMin = todayBedMinExtended - 1440; // 다음날 자정 기준 최소 기상 시각
    if(wakeMin < requiredMin){
      return `오늘 취침 시각(${minToClock(todayBedMinExtended)}) 이후에 일어나야 해요. ${minToClock(requiredMin)} 이후로 설정해주세요.`;
    }
  }
  return null;
}

const planTodayBtn = document.getElementById('planTodayBtn');
const planTomorrowBtn = document.getElementById('planTomorrowBtn');
const planTargetHint = document.getElementById('planTargetHint');

function updateTargetButtonsUI(){
  const isToday = planTargetDate === activeDate;
  planTodayBtn.style.background = isToday ? 'var(--ink)' : '';
  planTodayBtn.style.color = isToday ? '#fff' : '';
  planTodayBtn.style.borderColor = isToday ? 'var(--ink)' : '';
  planTomorrowBtn.style.background = !isToday ? 'var(--ink)' : '';
  planTomorrowBtn.style.color = !isToday ? '#fff' : '';
  planTomorrowBtn.style.borderColor = !isToday ? 'var(--ink)' : '';
  planTargetHint.textContent = isToday
    ? `지금 "오늘(${planTargetDate})" 일정을 편집 중이에요.`
    : `지금 "다음날(${planTargetDate})" 일정을 편집 중이에요.`;
}

// 루틴 상태와 동기화 (꺼진 루틴 일정 제거, 켜진 루틴 새 항목 추가, top3/잠금 규칙 적용)
async function syncWithRoutines(){
  let routines = [];
  try{
    routines = await apiGet('/routines');
  } catch(e){
    // 루틴을 못 불러와도 플래너 자체는 계속 쓸 수 있어야 하니 조용히 넘어감
  }

  const activeItems = routines
    .filter(r => r.is_active)
    .flatMap(r => r.items.filter(it => it.is_active));
  const activeItemMap = new Map(activeItems.map(it => [it.routine_item_id, it]));

  // 루틴(또는 그 안의 항목)이 꺼져있으면, 거기서 온 일정은 자동으로 제거
  tasks = tasks.filter(t => !t.routineItemId || activeItemMap.has(t.routineItemId));

  // 계속 켜져 있어서 남아있는 루틴 일정은 top3를 건드리지 않고, 잠금만 루틴 설정에 맞춘다
  tasks.forEach(t => {
    if(!t.routineItemId) return;
    const it = activeItemMap.get(t.routineItemId);
    if(!it) return;
    t.locked = !!it.is_locked;
    t.routineLocked = !!it.is_locked;
  });

  // 켜져 있는 루틴 항목 중, 아직 목록에 없는 것만 새로 추가 (여기서만 top3 false로 시작)
  const existingRoutineItemIds = new Set(
    tasks.filter(t => t.routineItemId).map(t => t.routineItemId)
  );
  const { wakeMin } = getWindow();

  activeItems.forEach(it => {
    if(existingRoutineItemIds.has(it.routine_item_id)) return;
    const startMin = normalizeToWindow(it.preferred_time, wakeMin);
    tasks.push({
      id: nextId++,
      text: it.name,
      critical: false,
      locked: !!it.is_locked,
      routineLocked: !!it.is_locked,
      startMin: startMin,
      endMin: startMin + it.duration,
      routineItemId: it.routine_item_id
    });
  });

  // 기본 시드는 항상 유지하되, 이름이 같은 일정이 이미 있으면 중복 추가하지 않음.
  // 오늘을 계획 중이면 "오늘 일정 정리", 다음날을 계획 중이면 "다음날 일정 정리"로 이름이 다름.
  const seedName = (planTargetDate === activeDate) ? '오늘 일정 정리' : '다음날 일정 정리';
  const otherSeedName = (planTargetDate === activeDate) ? '다음날 일정 정리' : '오늘 일정 정리';
  tasks = tasks.filter(t => t.text !== otherSeedName); // 날짜를 넘나들며 남은 반대쪽 이름의 시드는 정리
  if(!tasks.some(t => t.text === seedName)){
    addTask(seedName);
    const seed = tasks[tasks.length - 1];
    const { bedMin } = getWindow();
    seed.startMin = bedMin - 30;
    seed.endMin = bedMin;
    seed.anchorToBedtime = true;
  }
}

// 특정 날짜의 계획을 불러와서 화면에 채운다 (오늘 ↔ 다음날 전환에도 재사용)
async function loadForDate(date){
  planTargetDate = date;
  updateTargetButtonsUI();

  let saved = null;
  try{
    saved = await loadPlannerState(date);
  } catch(e){
    alert('서버에서 데이터를 불러오지 못했어요: ' + e.message + '\n서버(npm start)가 켜져 있는지 확인해주세요.');
  }

  tasks = [];
  nextId = 1;
  wakeInput.value = '07:00';
  bedInput.value = '23:00';

  if(saved && saved.tasks.length > 0){
    tasks = saved.tasks;
    nextId = Math.max(0, ...tasks.map(t=>t.id)) + 1;
    wakeInput.value = saved.wake || '07:00';
    bedInput.value = saved.bed || '23:00';
  }

  await syncWithRoutines();
  render();
}

planTodayBtn.addEventListener('click', ()=>{
  if(planTargetDate !== activeDate) loadForDate(activeDate);
});
planTomorrowBtn.addEventListener('click', ()=>{
  if(planTargetDate !== tomorrowDate) loadForDate(tomorrowDate);
});

// 완료 버튼: 지금 편집 중인 날짜(오늘 또는 다음날)에 저장하고 schedule.html로 이동
const completeBtn = document.getElementById('completeBtn');
completeBtn.addEventListener('click', async ()=>{
  const originalText = completeBtn.textContent;
  completeBtn.disabled = true;
  completeBtn.textContent = '저장 중...';
  try{
    await savePlannerState(planTargetDate, wakeInput.value, bedInput.value, tasks);
    window.location.href = 'schedule.html';
  } catch(e){
    alert('저장에 실패했어요: ' + e.message + '\n서버(npm start)가 켜져 있는지 확인해주세요.');
    completeBtn.textContent = originalText;
    render();
  }
});

// ---- 초기 로딩 ----
// 기상 시각 기준으로 "활성 날짜(오늘)"를 계산하고, 그 다음날 날짜도 구한다.
// 오늘 계획이 아직 비어있으면 "오늘"부터 편집하게 하고, 이미 있으면 평소처럼 "다음날"부터 보여준다.
(async function init(){
  try{
    activeDate = await resolveActiveDate();
  } catch(e){
    activeDate = getTodayDate();
  }
  tomorrowDate = addDaysToDateStr(activeDate, 1);

  let todayHasPlan = false;
  try{
    const todaySaved = await loadPlannerState(activeDate);
    todayHasPlan = !!(todaySaved && todaySaved.tasks.length > 0);
  } catch(e){
    // 조회 실패하면 일단 다음날 계획으로 진행 (기존 동작과 동일)
  }

  // 오늘의 취침 시각을 미리 구해둔다 (다음날 계획에서 "오늘 취침 시각보다 일찍 기상" 검증에 사용)
  try{
    const todayDS = await apiGet(`/day-settings/${activeDate}`);
    if(todayDS && todayDS.wake_up_time != null && todayDS.sleep_time != null){
      const todayWake = todayDS.wake_up_time;
      let todayBed = todayDS.sleep_time;
      if(todayBed <= todayWake) todayBed += 1440;
      todayBedMinExtended = todayBed;
    }
  } catch(e){
    // 못 가져와도 검증 없이 진행
  }

  await loadForDate(todayHasPlan ? tomorrowDate : activeDate);
})();