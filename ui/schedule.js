const ACCENTS = ['#E8720C','#B8511F','#8A3A15'];
const MUTED = ['#5B7A99','#7C8CA3','#4E6580','#8B98AC'];

// schedule.html은 "지금 활성화된 하루"의 시간표를 보여주는 화면.
// 자정이 아니라 "그날의 기상 시각"을 하루의 경계로 보기 때문에, 서버에 물어봐야 해서 비동기로 계산한다.
// (init()에서 resolveActiveDate()로 채워짐. 그 전까지는 null)
let PLAN_DATE = null;

let wake = '07:00';
let bed = '23:00';
let tasks = [];

function getWindow(){
  const wakeMin = timeToMin(wake);
  let bedMin = timeToMin(bed);
  // 취침 시각이 기상 시각보다 이르거나 같으면(예: 기상 07:00, 취침 03:00) 자정을 넘긴 다음날 새벽으로 본다.
  if(bedMin <= wakeMin) bedMin += 1440;
  return { wakeMin, bedMin };
}

function colorForTask(t){
  if(t.critical){
    const i = tasks.filter(x=>x.critical).indexOf(t);
    return ACCENTS[i % ACCENTS.length];
  }
  const i = tasks.filter(x=>!x.critical).indexOf(t);
  return MUTED[i % MUTED.length];
}

function criticalCount(){
  return tasks.filter(t=>t.critical).length;
}

function renderGridTimetable(){
  const { wakeMin, bedMin } = getWindow();
  const scheduled = tasks.filter(t=>t.endMin > t.startMin).sort((a,b)=>a.startMin-b.startMin);

  const gridStartHour = Math.floor(wakeMin / 60);
  const gridEndHour = Math.ceil(bedMin / 60);

  const headerEl = document.getElementById('gridColHeader');
  const tableEl = document.getElementById('gridTable');
  headerEl.innerHTML = '';
  tableEl.innerHTML = '';

  // 상단 분 단위 헤더 (:10 :20 :30 :40 :50 :00)
  const corner = document.createElement('span');
  headerEl.appendChild(corner);
  for(let m=10; m<=60; m+=10){
    const span = document.createElement('span');
    span.textContent = ':' + String(m % 60).padStart(2,'0');
    headerEl.appendChild(span);
  }

  function typeAt(mid){
    const hitTask = scheduled.find(t => mid >= t.startMin && mid < t.endMin);
    if(hitTask) return { kind:'task', task: hitTask };
    if(mid >= wakeMin && mid < bedMin) return { kind:'free' };
    return { kind:'sleep' };
  }

  for(let h=gridStartHour; h<gridEndHour; h++){
    const rowIndex = h - gridStartHour + 1; // 1-based grid row
    const isFirstRow = (rowIndex === 1);
    const rowStart = h*60;
    const rowEnd = rowStart + 60;

    const hourCell = document.createElement('div');
    hourCell.className = 'grid-hour-cell' + (isFirstRow ? ' first-row' : '');
    hourCell.textContent = String(h % 24).padStart(2,'0');
    hourCell.style.gridRow = rowIndex;
    hourCell.style.gridColumn = 1;
    tableEl.appendChild(hourCell);

    // 이 한 시간(행) 안에서 상태가 바뀌는 지점(일정 시작/끝, 기상/취침)을 전부 모아
    // 10분 칸 단위가 아니라 "한 행 전체"를 기준으로 구간을 나눈다.
    // → 같은 일정이 칸을 넘나들어도 하나의 배경으로 이어지기 때문에 중간에 선이 생기지 않는다.
    const innerPoints = [];
    scheduled.forEach(t=>{
      if(t.startMin > rowStart && t.startMin < rowEnd) innerPoints.push(t.startMin);
      if(t.endMin   > rowStart && t.endMin   < rowEnd) innerPoints.push(t.endMin);
    });
    if(wakeMin > rowStart && wakeMin < rowEnd) innerPoints.push(wakeMin);
    if(bedMin  > rowStart && bedMin  < rowEnd) innerPoints.push(bedMin);
    const points = Array.from(new Set([rowStart, rowEnd, ...innerPoints])).sort((a,b)=>a-b);

    const segments = [];
    for(let k=0; k<points.length-1; k++){
      const segStart = points[k], segEnd = points[k+1];
      const { kind, task } = typeAt((segStart+segEnd)/2);
      segments.push({ segStart, segEnd, kind, task: kind === 'task' ? task : null });
    }

    // 행 전체를 덮는 배경 하나 (하나의 div = 절대 내부에 선이 생길 수 없음)
    const rowBg = document.createElement('div');
    rowBg.className = 'grid-cell' + (isFirstRow ? ' first-row' : '');
    rowBg.style.gridRow = rowIndex;
    rowBg.style.gridColumn = '2 / span 6';
    rowBg.style.position = 'relative';

    const stops = segments.map(seg=>{
      const color = seg.kind === 'task' ? colorForTask(seg.task)
        : seg.kind === 'sleep' ? 'var(--sleep)' : 'transparent';
      const startPct = (seg.segStart - rowStart) / 60 * 100;
      const endPct = (seg.segEnd - rowStart) / 60 * 100;
      return `${color} ${startPct}%, ${color} ${endPct}%`;
    });
    rowBg.style.background = `linear-gradient(to right, ${stops.join(', ')})`;

    // 표의 10분 단위 구분선(10/20/30/40/50분 지점) — 일정 색깔 위에는 그리지 않고,
    // 여유시간·수면 구간 위에만 표시 (일정 색을 가리거나 그 위에 얹혀 보이지 않게)
    for(let k=1; k<6; k++){
      const posMin = rowStart + k*10;
      const { kind } = typeAt(posMin);
      if(kind === 'task') continue;
      const tick = document.createElement('div');
      tick.className = 'gc-tick';
      tick.style.left = (k/6*100) + '%';
      tick.style.background = 'var(--line)';
      tick.style.pointerEvents = 'none';
      rowBg.appendChild(tick);
    }

    // 각 일정 구간마다: 정확히 그 구간에만 걸리는 클릭 영역 + (시작 지점이면) 이름 라벨
    // 10분 칸 단위가 아니라 실제 %로 배치하므로, 두 일정이 붙어있어도 각자 클릭 영역이 정확히 나뉜다.
    segments.forEach(seg=>{
      if(seg.kind !== 'task') return;
      const t = seg.task;
      const startPct = (seg.segStart - rowStart) / 60 * 100;
      const endPct = (seg.segEnd - rowStart) / 60 * 100;

      const hit = document.createElement('div');
      hit.className = 'gc-hit';
      hit.style.position = 'absolute';
      hit.style.top = '0';
      hit.style.bottom = '0';
      hit.style.left = startPct + '%';
      hit.style.width = (endPct - startPct) + '%';
      hit.style.cursor = 'pointer';
      hit.tabIndex = 0;
      hit.title = `${t.text} (클릭해서 수정)`;
      hit.addEventListener('click', ()=> openEditModal(t.id));
      hit.addEventListener('keydown', (e)=>{
        if(e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          openEditModal(t.id);
        }
      });
      rowBg.appendChild(hit);

      // 이 일정이 실제로 이 행에서 "시작"할 때만 이름 표시 (여러 시간에 걸쳐도 한 번만)
      if(t.startMin >= rowStart && t.startMin < rowEnd){
        const label = document.createElement('span');
        label.className = 'gc-label';
        // 기존 CSS(.grid-cell)의 flex 중앙정렬은 "칸=그 일정" 이었을 때 기준이라,
        // 지금은 행 전체(6칸) 안에 놓이므로 구간의 가운데 지점을 직접 계산해서 배치한다.
        const centerPct = (startPct + endPct) / 2;
        label.style.position = 'absolute';
        label.style.left = centerPct + '%';
        label.style.top = '50%';
        label.style.transform = 'translate(-50%, -50%)';
        label.style.width = 'auto';
        label.style.maxWidth = 'none';
        label.style.textAlign = 'center';
        label.style.whiteSpace = 'nowrap';
        label.style.pointerEvents = 'none';
        label.style.zIndex = '2';
        label.textContent = (t.locked ? '🔒' : '') + (t.critical ? '★ ' : '') + t.text;
        rowBg.appendChild(label);
      }
    });

    tableEl.appendChild(rowBg);
  }
}

// ---- 일정 클릭 → 수정 모달 ----
let editingTaskId = null;
const editBackdrop = document.getElementById('editBackdrop');
const editName = document.getElementById('editName');
const editStart = document.getElementById('editStart');
const editEnd = document.getElementById('editEnd');
const editLockedChip = document.getElementById('editLockedChip');
const editWarn = document.getElementById('editWarn');

const pushToggleBtn = document.getElementById('pushToggleBtn');
const pushPanel = document.getElementById('pushPanel');
const pushCancelBtn = document.getElementById('pushCancelBtn');
const pushMinutes = document.getElementById('pushMinutes');
const pushStrategyRow = document.getElementById('pushStrategyRow');
const pushApplyBtn = document.getElementById('pushApplyBtn');
const pushLockedHint = document.getElementById('pushLockedHint');
let pushStrategy = null; // 처음엔 아무것도 선택 안 된 상태로 시작

pushStrategyRow.querySelectorAll('.chip-toggle').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    pushStrategy = btn.dataset.strategy;
    pushStrategyRow.querySelectorAll('.chip-toggle').forEach(b=>{
      b.classList.toggle('active', b === btn);
    });
  });
});

pushToggleBtn.addEventListener('click', ()=>{
  pushMinutes.value = 15;
  pushStrategy = null; // 패널을 열 때마다 선택 안 된 상태로 초기화
  pushStrategyRow.querySelectorAll('.chip-toggle').forEach(b=> b.classList.remove('active'));
  pushPanel.style.display = 'block';
});
pushCancelBtn.addEventListener('click', ()=>{
  pushPanel.style.display = 'none';
});

function toggleChip(chip){
  chip.classList.toggle('active');
}
editLockedChip.addEventListener('click', ()=> toggleChip(editLockedChip));

function openEditModal(taskId){
  const t = tasks.find(x=>x.id===taskId);
  if(!t) return;
  editingTaskId = taskId;
  editName.value = t.text;
  editStart.value = minToClock(t.startMin);
  editEnd.value = minToClock(t.endMin);
  editLockedChip.classList.toggle('active', !!t.locked);
  editWarn.style.display = 'none';

  // 잠긴(미루기 금지) 일정은 그 자체를 밀 수 없으므로 밀기 버튼을 숨기고 안내문구만 표시
  const isLocked = !!t.locked || !!t.routineLocked;
  pushToggleBtn.style.display = isLocked ? 'none' : '';
  pushLockedHint.style.display = isLocked ? 'block' : 'none';
  pushPanel.style.display = 'none'; // 모달 열 때는 항상 접힌 상태로 시작

  editBackdrop.hidden = false;
  editName.focus();
}

function closeEditModal(){
  editingTaskId = null;
  editBackdrop.hidden = true;
}

function showEditWarn(msg){
  editWarn.textContent = msg;
  editWarn.style.display = 'block';
}

// ---- 전체 밀기 ----
// chain: 기준 일정부터(포함) 시작 시각 순으로 정렬된 일정 목록.
// 잠긴(locked) 일정은 절대 움직이지 않음. 전략에 따라 나머지가 어떻게 밀리는지가 달라짐.
function computePushedSchedule(chain, deltaMinutes, strategy){
  const warnings = [];

  if(strategy === 'cap'){
    // 뒤에 있는 잠긴 일정을 침범하지 않는 한도까지만 delta를 줄인다
    let appliedDelta = deltaMinutes;
    for(let i=0; i<chain.length; i++){
      if(!chain[i].locked) continue;
      for(let j=0; j<i; j++){
        if(chain[j].locked) continue;
        const room = chain[i].startMin - chain[j].endMin;
        appliedDelta = Math.max(0, Math.min(appliedDelta, room));
      }
    }
    const updated = chain.filter(t=>!t.locked).map(t=>({
      id: t.id, startMin: t.startMin + appliedDelta, endMin: t.endMin + appliedDelta
    }));
    if(appliedDelta < deltaMinutes){
      warnings.push(`뒤에 잠긴 일정이 있어서 ${deltaMinutes}분 중 ${appliedDelta}분만 밀렸어요.`);
    }
    return { updated, deleted: [], warnings, appliedDelta };
  }

  if(strategy === 'delete'){
    const shifted = chain.filter(t=>!t.locked).map(t=>({
      id: t.id, text: t.text, startMin: t.startMin + deltaMinutes, endMin: t.endMin + deltaMinutes
    }));
    const lockedList = chain.filter(t=>t.locked);
    const updated = [];
    const deleted = [];
    shifted.forEach(s=>{
      const collides = lockedList.some(L => s.startMin < L.endMin && L.startMin < s.endMin);
      if(collides){
        deleted.push(s.id);
        warnings.push(`"${s.text}"은 미루기 금지 일정과 겹쳐서 삭제됐어요.`);
      } else {
        updated.push({ id: s.id, startMin: s.startMin, endMin: s.endMin });
      }
    });
    return { updated, deleted, warnings, appliedDelta: deltaMinutes };
  }

  // strategy === 'skip': 잠긴 일정들은 각각 그 자리 그대로 두고,
  // 그 사이/앞/뒤 구간마다 "다음 잠긴 일정을 침범하지 않는 선"에서 최대한 delta를 적용해 이어붙인다.
  // (cap과 다른 점: 잠긴 일정 하나 때문에 전체가 다 같이 줄어들지 않고, 그 뒤 구간은 다시 원래 delta를 온전히 씀)
  const updated = [];
  const lockedIdxs = [];
  chain.forEach((t,i)=>{ if(t.locked) lockedIdxs.push(i); });
  const boundaries = [...lockedIdxs, chain.length];

  let cursor = null; // 이전 잠긴 일정이 끝나는 시각(또는 이전 구간의 마지막 일정이 끝나는 시각)
  let segStart = 0;

  boundaries.forEach(boundaryIdx=>{
    const segTasks = chain.slice(segStart, boundaryIdx).filter(t=>!t.locked);

    // 이 구간 끝에 잠긴 일정이 있으면, 그걸 침범하지 않는 선까지만 delta 사용
    let segDelta = deltaMinutes;
    if(boundaryIdx < chain.length){
      const barrier = chain[boundaryIdx];
      segTasks.forEach(t=>{
        const room = barrier.startMin - t.endMin;
        segDelta = Math.max(0, Math.min(segDelta, room));
      });
    }

    segTasks.forEach(t=>{
      const duration = t.endMin - t.startMin;
      const naiveStart = t.startMin + segDelta;
      const newStart = cursor === null ? naiveStart : Math.max(cursor, naiveStart);
      const newEnd = newStart + duration;
      updated.push({ id: t.id, startMin: newStart, endMin: newEnd });
      cursor = newEnd;
    });

    if(boundaryIdx < chain.length){
      const barrier = chain[boundaryIdx];
      cursor = cursor === null ? barrier.endMin : Math.max(cursor, barrier.endMin);
    }
    segStart = boundaryIdx + 1;
  });

  return { updated, deleted: [], warnings, appliedDelta: deltaMinutes };
}

pushApplyBtn.addEventListener('click', async ()=>{
  if(editingTaskId == null) return;
  const ref = tasks.find(x=>x.id===editingTaskId);
  if(!ref) return;

  const deltaMinutes = parseInt(pushMinutes.value, 10);
  if(!deltaMinutes || deltaMinutes <= 0){
    showEditWarn('밀 시간을 1분 이상으로 입력하세요.');
    return;
  }

  if(!pushStrategy){
    showEditWarn('미루기 금지 일정과 겹쳤을 때 처리 방식을 선택하세요.');
    return;
  }

  const { bedMin } = getWindow();

  // 취침 시각(수면 시간)도 "잠긴 일정"처럼 취급해서, 밀다가 수면 시간을 넘어가지 않게 한다.
  // (끝나는 시각이 없는 - 무한히 이어지는 - 잠긴 구간으로 체인에 끼워 넣으면 기존 3가지 전략 로직을 그대로 재사용할 수 있다)
  const sleepBarrier = { id: '__sleep__', text: '수면 시간', startMin: bedMin, endMin: Infinity, locked: true };

  const chain = tasks
    .filter(t => t.startMin !== undefined && t.endMin !== undefined && t.startMin >= ref.startMin)
    .concat([sleepBarrier])
    .sort((a,b)=>a.startMin - b.startMin);

  const { updated, deleted, warnings, appliedDelta } = computePushedSchedule(chain, deltaMinutes, pushStrategy);

  if(updated.length === 0 && deleted.length === 0){
    showEditWarn('밀 수 있는 일정이 없어요 (전부 잠겨있거나, 밀 만큼의 여유가 없어요).');
    return;
  }

  pushApplyBtn.disabled = true;
  pushApplyBtn.textContent = '적용 중...';

  const saveFailures = [];

  for(const u of updated){
    const t = tasks.find(x=>x.id===u.id);
    if(!t) continue;
    t.startMin = u.startMin;
    t.endMin = u.endMin;
    try{
      const payload = taskToEventPayload({
        text: t.text,
        startMin: t.startMin,
        endMin: t.endMin,
        critical: t.critical,
        locked: t.locked,
        routineItemId: t.routineItemId
      }, PLAN_DATE);
      const savedRow = await apiSend('PUT', `/events/${t.id}`, payload);
      Object.assign(t, eventRowToTask(savedRow));
    } catch(e){
      saveFailures.push(`"${t.text}" 저장 실패: ${e.message}`);
    }
  }

  for(const id of deleted){
    try{
      await apiSend('DELETE', `/events/${id}`);
      tasks = tasks.filter(x => x.id !== id);
    } catch(e){
      const t = tasks.find(x=>x.id===id);
      saveFailures.push(`"${t ? t.text : id}" 삭제 실패: ${e.message}`);
    }
  }

  pushApplyBtn.disabled = false;
  pushApplyBtn.textContent = '밀기 적용';

  const allMessages = [...warnings, ...saveFailures];
  if(allMessages.length > 0){
    alert(`${updated.length}개 일정을 ${appliedDelta}분 밀었어요.\n\n확인이 필요해요:\n` + allMessages.join('\n'));
  }

  closeEditModal();
  renderGridTimetable();
});

document.getElementById('editCancelBtn').addEventListener('click', closeEditModal);
document.getElementById('editCloseBtn').addEventListener('click', closeEditModal);
editBackdrop.addEventListener('click', (e)=>{
  if(e.target === editBackdrop) closeEditModal();
});
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape' && !editBackdrop.hidden) closeEditModal();
});

document.getElementById('editDeleteBtn').addEventListener('click', async ()=>{
  if(editingTaskId == null) return;
  const deleteBtn = document.getElementById('editDeleteBtn');
  deleteBtn.disabled = true;
  try{
    await apiSend('DELETE', `/events/${editingTaskId}`);
  } catch(e){
    showEditWarn('삭제에 실패했어요: ' + e.message);
    deleteBtn.disabled = false;
    return;
  }
  tasks = tasks.filter(x=>x.id !== editingTaskId);
  deleteBtn.disabled = false;
  closeEditModal();
  renderGridTimetable();
});

document.getElementById('editSaveBtn').addEventListener('click', async ()=>{
  if(editingTaskId == null) return;
  const t = tasks.find(x=>x.id===editingTaskId);
  if(!t) return;

  const name = editName.value.trim();
  if(!name){
    showEditWarn('이름을 입력하세요.');
    return;
  }
  const { wakeMin } = getWindow();
  const newStart = normalizeToWindow(timeToMin(editStart.value), wakeMin);
  const newEnd = normalizeToWindow(timeToMin(editEnd.value), wakeMin);
  if(newEnd <= newStart){
    showEditWarn('종료 시각이 시작 시각보다 늦어야 해요.');
    return;
  }

  // 다른 일정(자기 자신은 제외)과 시간이 겹치면 저장하지 않음
  const overlapping = tasks.find(other =>
    other.id !== t.id && other.endMin > other.startMin &&
    newStart < other.endMin && other.startMin < newEnd
  );
  if(overlapping){
    showEditWarn(`"${overlapping.text}"(${minToClock(overlapping.startMin)}~${minToClock(overlapping.endMin)})과 시간이 겹쳐요. 겹치지 않게 조정해주세요.`);
    return;
  }

  const saveBtn = document.getElementById('editSaveBtn');
  saveBtn.disabled = true;

  const payload = taskToEventPayload({
    text: name,
    startMin: newStart,
    endMin: newEnd,
    critical: t.critical,
    locked: editLockedChip.classList.contains('active'),
    routineItemId: t.routineItemId
  }, PLAN_DATE);

  try{
    const updated = await apiSend('PUT', `/events/${t.id}`, payload);
    Object.assign(t, eventRowToTask(updated));
  } catch(e){
    showEditWarn('저장에 실패했어요: ' + e.message);
    saveBtn.disabled = false;
    return;
  }

  saveBtn.disabled = false;
  closeEditModal();
  renderGridTimetable();
});

// ---- 이미지로 저장 (새 창 없이 바로 다운로드) ----
const saveImageBtn = document.getElementById('saveImageBtn');
saveImageBtn.addEventListener('click', async ()=>{
  if(typeof html2canvas === 'undefined'){
    alert('이미지 저장 기능을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해주세요.');
    return;
  }
  const target = document.querySelector('.grid-wrap');
  const originalLabel = saveImageBtn.textContent;
  saveImageBtn.disabled = true;
  saveImageBtn.textContent = '저장 중...';
  try{
    const canvas = await html2canvas(target, { backgroundColor: '#ffffff', scale: 2 });
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth()+1).padStart(2,'0');
    const d = String(now.getDate()).padStart(2,'0');

    const link = document.createElement('a');
    link.download = `시간표_${y}${m}${d}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch(err){
    alert('이미지 저장에 실패했어요. 다시 시도해주세요.');
  } finally {
    saveImageBtn.disabled = false;
    saveImageBtn.textContent = originalLabel;
  }
});

// ---- 초기 로딩: 서버에서 그 날짜 데이터를 불러옴 (없으면 편집 화면으로 돌려보냄) ----
(async function init(){
  try{
    PLAN_DATE = await resolveActiveDate();
  } catch(e){
    PLAN_DATE = getTodayDate(); // 실패 시 그냥 달력 기준 오늘로 대체
  }

  let saved = null;
  try{
    saved = await loadPlannerState(PLAN_DATE);
  } catch(e){
    // 서버 조회에 실패해도 화면 자체는 그대로 보여주고, 빈 시간표로 대체합니다.
    alert('서버에서 데이터를 불러오지 못했어요: ' + e.message + '\n서버(npm start)가 켜져 있는지 확인해주세요.');
  }

  // 오늘 저장된 일정이 없어도(= saved가 null) planning.html로 보내지 않고,
  // 기본 기상/취침 시각 기준의 빈 시간표를 그대로 보여줍니다.
  wake = (saved && saved.wake) || '07:00';
  bed = (saved && saved.bed) || '23:00';
  tasks = (saved && saved.tasks) || [];

  renderGridTimetable();
  updateEmptyState();
})();

// 오늘 계획된 일정이 하나도 없을 때, 빈 화면만 덩그러니 있지 않도록 안내 문구를 보여줍니다.
function updateEmptyState(){
  const gridWrap = document.querySelector('.grid-wrap');
  let emptyHint = document.getElementById('emptyHint');

  if(tasks.length === 0){
    if(!emptyHint){
      emptyHint = document.createElement('p');
      emptyHint.id = 'emptyHint';
      emptyHint.className = 'hint';
      emptyHint.style.margin = '0 0 14px';
      emptyHint.textContent = '오늘 계획된 일정이 없어요. planning.html에서 전날 밤에 다음날 일정을 먼저 계획해보세요.';
      gridWrap.parentNode.insertBefore(emptyHint, gridWrap);
    }
  } else if(emptyHint){
    emptyHint.remove();
  }
}