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

  function timeToMin(t){
    const [h,m] = t.split(':').map(Number);
    return h*60+m;
  }
  function minToClock(m){
    m = ((m % 1440) + 1440) % 1440;
    const h = Math.floor(m/60).toString().padStart(2,'0');
    const mm = Math.floor(m%60).toString().padStart(2,'0');
    return `${h}:${mm}`;
  }
  function minToHM(m){
    const h = Math.floor(m/60);
    const mm = Math.round(m%60);
    if(h<=0) return `${mm}분`;
    return mm>0 ? `${h}시간 ${mm}분` : `${h}시간`;
  }

  function getWindow(){
    const wakeMin = timeToMin(wakeInput.value || '07:00');
    let bedMin = timeToMin(bedInput.value || '23:00');
    const valid = bedMin > wakeMin;
    if(!valid) bedMin = wakeMin + 60; // fallback so UI never breaks
    return { wakeMin, bedMin, valid, awakeMinutes: bedMin - wakeMin };
  }

  function addTask(text){
    tasks.push({ id: nextId++, text, critical:false, locked:false});
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
    // (첫 번째는 기상 시각+15분, 그 다음은 바로 전에 추가한 일정의 끝 시각+15분)
    let cursor = chainBase.length > 0
      ? Math.max(wakeMin, ...chainBase.map(t=>t.endMin))
      : wakeMin;

    unassigned.forEach(t=>{
      t.startMin = cursor;
      t.endMin = cursor + 15;
      cursor = t.endMin;
    });
  }

  function mergeIntervals(intervals){
    if(intervals.length===0) return [];
    const sorted = intervals.slice().sort((a,b)=>a[0]-b[0]);
    const merged = [sorted[0].slice()];
    for(let i=1;i<sorted.length;i++){
      const last = merged[merged.length-1];
      if(sorted[i][0] <= last[1]){
        last[1] = Math.max(last[1], sorted[i][1]);
      } else {
        merged.push(sorted[i].slice());
      }
    }
    return merged;
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
      startInput.type = 'time';
      startInput.value = minToClock(t.startMin);
      startInput.disabled = !!t.locked;
      startInput.addEventListener('input', ()=>{
        t.startMin = timeToMin(startInput.value);
        render();
      });

      const dash = document.createElement('span');
      dash.className = 'alloc-dash';
      dash.textContent = '~';

      const endInput = document.createElement('input');
      endInput.type = 'time';
      endInput.value = minToClock(t.endMin);
      endInput.disabled = !!t.locked;
      endInput.addEventListener('input', ()=>{
        t.endMin = timeToMin(endInput.value);
        render();
      });

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

    // sleep before wake / after bedtime
    addSeg(0, wakeMin, 'var(--sleep)');
    addSeg(bedMin, DAY-bedMin, 'var(--sleep)');

    // detect overlaps between all scheduled tasks (top3 and regular alike)
    const sorted = [...scheduled].sort((a,b)=>a.startMin-b.startMin);
    const overlapping = new Set();
    for(let i=0; i<sorted.length-1; i++){
      if(sorted[i].endMin > sorted[i+1].startMin){
        overlapping.add(sorted[i].id);
        overlapping.add(sorted[i+1].id);
      }
    }

    // every task block placed at its real start~end time (clipped to awake window)
    scheduled.forEach(t=>{
      const s = Math.max(wakeMin, t.startMin);
      const e = Math.min(bedMin, t.endMin);
      addSeg(s, e-s, colorForTask(t), overlapping.has(t.id), t.locked);
    });

    // free time = gaps inside the awake window not covered by any task
    const merged = mergeIntervals(sorted.map(t=>[
      Math.max(wakeMin, t.startMin), Math.min(bedMin, t.endMin)
    ]));
    let cursor = wakeMin;
    merged.forEach(([s,e])=>{
      if(s > cursor) addSeg(cursor, s-cursor, 'var(--free)');
      cursor = Math.max(cursor, e);
    });
    if(cursor < bedMin) addSeg(cursor, bedMin-cursor, 'var(--free)');

    // ticks every 3 hours
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

    // now line
    const now = new Date();
    const nowMin = now.getHours()*60 + now.getMinutes();
    const nowLine = document.createElement('div');
    nowLine.className = 'now-line';
    nowLine.style.top = pct(nowMin)+'%';
    timelineEl.appendChild(nowLine);

    // legend
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

  function renderBigTimetable(){
    const { wakeMin, bedMin } = getWindow();
    const scheduled = tasks.filter(t=>t.endMin > t.startMin).sort((a,b)=>a.startMin-b.startMin);

    const barEl = document.getElementById('resultBar');
    const ticksEl = document.getElementById('resultTicks');
    const tbody = document.getElementById('resultTableBody');
    barEl.innerHTML = '';
    ticksEl.innerHTML = '';
    tbody.innerHTML = '';

    const DAY = 1440;
    const pct = (m)=> (m/DAY*100);

    // 수면 → (여유/일정 번갈아) → 수면 순서로 하루 전체를 블록 목록으로 구성
    const blocks = [];
    blocks.push({ start:0, end:wakeMin, color:'var(--sleep)', dot:'#9AB0C9', label:'수면' });

    let cursor = wakeMin;
    scheduled.forEach(t=>{
      const s = Math.max(wakeMin, t.startMin);
      const e = Math.min(bedMin, t.endMin);
      if(s > cursor){
        blocks.push({ start:cursor, end:s, color:'var(--free)', dot:'#D8DEE6', label:'여유' });
      }
      if(e > cursor){
        const label = (t.locked ? '🔒 ' : '') + (t.critical ? '★ ' : '') + t.text;
        blocks.push({ start:Math.max(cursor,s), end:e, color:colorForTask(t), dot:colorForTask(t), label });
        cursor = e;
      }
    });
    if(cursor < bedMin){
      blocks.push({ start:cursor, end:bedMin, color:'var(--free)', dot:'#D8DEE6', label:'여유' });
    }
    blocks.push({ start:bedMin, end:DAY, color:'var(--sleep)', dot:'#9AB0C9', label:'수면' });

    blocks.forEach(b=>{
      const width = b.end - b.start;
      if(width <= 0) return;

      const seg = document.createElement('div');
      seg.className = 'rseg';
      seg.style.left = pct(b.start)+'%';
      seg.style.width = pct(width)+'%';
      seg.style.background = b.color;
      if(width >= 45){
        const lab = document.createElement('span');
        lab.className = 'rseg-label';
        lab.textContent = b.label;
        seg.appendChild(lab);
      }
      barEl.appendChild(seg);

      const tr = document.createElement('tr');
      const tdTime = document.createElement('td');
      tdTime.className = 'rt-time';
      tdTime.textContent = `${minToClock(b.start)} ~ ${minToClock(b.end)}`;
      const tdName = document.createElement('td');
      const dot = document.createElement('span');
      dot.className = 'rt-dot';
      dot.style.background = b.dot;
      const nameSpan = document.createElement('span');
      nameSpan.className = 'rt-name';
      nameSpan.textContent = b.label;
      tdName.append(dot, nameSpan);
      tr.append(tdTime, tdName);
      tbody.appendChild(tr);
    });

    for(let h=0; h<=24; h+=3){
      const lab = document.createElement('span');
      lab.className = 'result-tick-label';
      lab.style.left = pct(h*60)+'%';
      lab.textContent = String(h).padStart(2,'0')+':00';
      ticksEl.appendChild(lab);
    }
  }

  function render(){
    renderReadout();
    renderTaskList();
    renderAllocation();
    renderTimeline();
  }

  wakeInput.addEventListener('input', render);
  bedInput.addEventListener('input', render);

  // 완료 버튼: 편집 화면을 숨기고 큰 시간표 화면을 보여줌 (페이지 이동 없음)
  const completeBtn = document.getElementById('completeBtn');
  const backBtn = document.getElementById('backBtn');
  const layoutEl = document.querySelector('.layout');
  const resultView = document.getElementById('resultView');

  completeBtn.addEventListener('click', ()=>{
    renderBigTimetable();
    layoutEl.hidden = true;
    resultView.hidden = false;
  });
  backBtn.addEventListener('click', ()=>{
    resultView.hidden = true;
    layoutEl.hidden = false;
  });

  // seed with a couple of example tasks so the UI isn't empty on first load
  addTask('다음날 일정 정리');
  {
    // 기본 일정은 취침 30분 전에 고정 (나중에 추가되는 일정들의 기상시간 기준 체이닝에 영향 없음)
    const seed = tasks[tasks.length - 1];
    const { bedMin } = getWindow();
    seed.startMin = bedMin - 30;
    seed.endMin = bedMin;
    seed.anchorToBedtime = true;
  }
  render();
