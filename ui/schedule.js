const ACCENTS = ['#E8720C','#B8511F','#8A3A15'];
const MUTED = ['#5B7A99','#7C8CA3','#4E6580','#8B98AC'];

// schedule.html은 "오늘" 실행할 시간표를 보여주는 화면 (planning.html은 "내일"을 계획하는 화면)
const PLAN_DATE = getTodayDate();

let wake = '07:00';
let bed = '23:00';
let tasks = [];

function getWindow(){
  const wakeMin = timeToMin(wake);
  let bedMin = timeToMin(bed);
  if(bedMin <= wakeMin) bedMin = wakeMin + 60;
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
    hourCell.textContent = String(h).padStart(2,'0');
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
  const newStart = timeToMin(editStart.value);
  const newEnd = timeToMin(editEnd.value);
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