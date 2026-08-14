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
  const valid = bedMin > wakeMin;
  if(!valid) bedMin = wakeMin + 60; // fallback so UI never breaks
  return { wakeMin, bedMin, valid, awakeMinutes: bedMin - wakeMin };
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

function assignDefaultSlots(list, wakeMin, bedMin){
  const unassigned = list.filter(t=>t.startMin === undefined || t.endMin === undefined);
  if(unassigned.length === 0) return;

  // 취침시간에 고정된 항목(예: 기본 시드 일정)은 체이닝 기준에서 제외
  const chainBase = list.filter(t=>
    t.startMin !== undefined && t.endMin !== undefined && !t.anchorToBedtime
  );

  // 새로 추가되는 일정은 항상 15분짜리로, 기상 시각부터 순서대로 이어붙임
  let cursor = chainBase.length > 0
    ? Math.max(wakeMin, ...chainBase.map(t=>t.endMin))
    : wakeMin;

  unassigned.forEach(t=>{
    t.startMin = cursor;
    t.endMin = cursor + 15;
    cursor = t.endMin;
  });
}

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

  assignDefaultSlots(tasks, wakeMin, bedMin);

  tasks.forEach(t=>{
    const row = document.createElement('div');
    row.className = 'alloc-row' + (t.locked ? ' locked' : '');

    const dot = document.createElement('span');
    dot.className = 'alloc-dot';
    dot.style.background = colorForTask(t);

    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.className = 'lock-btn' + (t.locked ? ' locked' : '');
    lockBtn.title = t.locked
      ? '고정 해제하기'
      : '이 시간 고정하기 (나중에 "미루기" 기능에도 영향받지 않아요)';
    lockBtn.textContent = t.locked ? '🔒' : '🔓';
    lockBtn.addEventListener('click', ()=>{
      t.locked = !t.locked;
      render();
    });

    const name = document.createElement('span');
    name.className = 'alloc-name';
    name.textContent = (t.critical ? '★ ' : '') + t.text;

    const wrap = document.createElement('div');
    wrap.className = 'alloc-time-wrap';

    const startInput = document.createElement('input');
    startInput.type = 'text';
    startInput.className = 'clock-input';
    startInput.placeholder = 'HH:MM';
    startInput.inputMode = 'numeric';
    startInput.maxLength = 5;
    startInput.value = minToClock(t.startMin);
    startInput.disabled = !!t.locked;
    startInput.addEventListener('input', ()=>{
      t.startMin = timeToMin(startInput.value);
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
    endInput.value = minToClock(t.endMin);
    endInput.disabled = !!t.locked;
    endInput.addEventListener('input', ()=>{
      t.endMin = timeToMin(endInput.value);
      render();
    });
    normalizeClockInput(endInput);

    const dur = document.createElement('span');
    dur.className = 'alloc-dur';
    const duration = t.endMin - t.startMin;
    dur.textContent = duration > 0 ? minToHM(duration) : '⚠ 시간 오류';
    if(duration <= 0) dur.classList.add('bad');

    wrap.append(startInput, dash, endInput, dur);
    row.append(dot, lockBtn, name, wrap);
    allocationListEl.appendChild(row);
  });

  const readout = document.getElementById('allocationReadout');
  const issues = [];

  tasks.forEach(t=>{
    if(t.endMin <= t.startMin){
      issues.push(`"${t.text}"의 종료 시각이 시작 시각보다 빨라요`);
    } else if(t.startMin < wakeMin || t.endMin > bedMin){
      issues.push(`"${t.text}"이 깨어있는 시간(${minToClock(wakeMin)}~${minToClock(bedMin)}) 밖에 있어요`);
    }
  });

  const validSorted = tasks
    .filter(t=>t.endMin > t.startMin)
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

  if(issues.length > 0){
    readout.className = 'readout danger';
    readout.textContent = '⚠ ' + issues.join(' · ');
  } else {
    readout.className = 'readout';
    readout.textContent = `${tasks.length}개 일정 배치 완료: ${minToHM(coverage)} 사용 · 여유 ${minToHM(remaining)} 남음`;
  }
}

function renderReadout(){
  const { wakeMin, bedMin, valid, awakeMinutes } = getWindow();
  timeWarn.style.display = valid ? 'none' : 'block';
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
  const pct = (m)=> (m/DAY*100);

  function addSeg(top, height, color, warn, locked){
    if(height<=0) return;
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.style.top = pct(top)+'%';
    seg.style.height = pct(height)+'%';
    seg.style.background = color;
    if(warn) seg.style.boxShadow = 'inset 0 0 0 2px var(--danger)';
    if(locked) seg.style.outline = '2px dashed rgba(255,255,255,.7)';
    timelineEl.appendChild(seg);
  }

  addSeg(0, wakeMin, 'var(--sleep)');
  addSeg(bedMin, DAY-bedMin, 'var(--sleep)');

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

  for(let h=0; h<=24; h+=3){
    const tick = document.createElement('div');
    tick.className = 'tick';
    tick.style.top = pct(h*60)+'%';
    timelineEl.appendChild(tick);
    const lab = document.createElement('div');
    lab.className = 'tick-label';
    lab.style.top = pct(h*60)+'%';
    lab.textContent = String(h).padStart(2,'0');
    timelineEl.appendChild(lab);
  }

  const now = new Date();
  const nowMin = now.getHours()*60 + now.getMinutes();
  const nowLine = document.createElement('div');
  nowLine.className = 'now-line';
  nowLine.style.top = pct(nowMin)+'%';
  timelineEl.appendChild(nowLine);

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

// 완료 버튼: 지금 데이터를 저장하고 schedule.html로 실제 페이지 이동
const completeBtn = document.getElementById('completeBtn');
completeBtn.addEventListener('click', ()=>{
  savePlannerState(wakeInput.value, bedInput.value, tasks);
  window.location.href = 'schedule.html';
});

// ---- 초기 로딩: 저장된 데이터가 있으면 복원, 없으면 기본값으로 시작 ----
(function init(){
  const saved = loadPlannerState();
  if(saved && saved.tasks.length > 0){
    tasks = saved.tasks;
    nextId = Math.max(0, ...tasks.map(t=>t.id)) + 1;
    wakeInput.value = saved.wake || '07:00';
    bedInput.value = saved.bed || '23:00';
  } else {
    addTask('다음날 일정 정리');
    const seed = tasks[tasks.length - 1];
    const { bedMin } = getWindow();
    seed.startMin = bedMin - 30;
    seed.endMin = bedMin;
    seed.anchorToBedtime = true;
  }
  render();
})();
