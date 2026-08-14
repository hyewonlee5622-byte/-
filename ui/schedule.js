const ACCENTS = ['#E8720C','#B8511F','#8A3A15'];
const MUTED = ['#5B7A99','#7C8CA3','#4E6580','#8B98AC'];
const GRID_ROW_HEIGHT = 56; // px, CSS .grid-hour-label의 height와 반드시 일치해야 함

// ---- main.html에서 저장한 데이터 불러오기 (없으면 편집 화면으로 돌려보냄) ----
const saved = loadPlannerState();
if(!saved){
  window.location.href = 'main.html';
  throw new Error('저장된 일정이 없어 main.html로 이동합니다.');
}

let wake = saved.wake || '07:00';
let bed = saved.bed || '23:00';
let tasks = saved.tasks;

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

function persist(){
  savePlannerState(wake, bed, tasks);
}

function renderGridTimetable(){
  const { wakeMin, bedMin } = getWindow();
  const scheduled = tasks.filter(t=>t.endMin > t.startMin);

  const gridStartHour = Math.floor(wakeMin / 60);
  const gridEndHour = Math.ceil(bedMin / 60);
  const gridStartMin = gridStartHour * 60;
  const gridEndMin = gridEndHour * 60;
  const pxPerMin = GRID_ROW_HEIGHT / 60;

  const headerEl = document.getElementById('gridColHeader');
  const hoursEl = document.getElementById('gridHours');
  const trackEl = document.getElementById('gridTrack');
  headerEl.innerHTML = '';
  hoursEl.innerHTML = '';
  trackEl.innerHTML = '';

  // 상단 분 단위 헤더 (:10 :20 :30 :40 :50 :60)
  const corner = document.createElement('span');
  headerEl.appendChild(corner);
  for(let m=10; m<=60; m+=10){
    const span = document.createElement('span');
    span.textContent = ':' + String(m).padStart(2,'0');
    headerEl.appendChild(span);
  }

  // 좌측 시간 라벨
  for(let h=gridStartHour; h<gridEndHour; h++){
    const div = document.createElement('div');
    div.className = 'grid-hour-label';
    div.textContent = String(h).padStart(2,'0');
    hoursEl.appendChild(div);
  }

  trackEl.style.height = ((gridEndMin - gridStartMin) * pxPerMin) + 'px';

  function addBlock(startMin, endMin, color, label, timeLabel, task){
    if(endMin <= startMin) return;
    const top = (startMin - gridStartMin) * pxPerMin;
    const height = Math.max(16, (endMin - startMin) * pxPerMin);

    const block = document.createElement('div');
    block.className = 'grid-block' + (task ? '' : ' static');
    block.style.top = top + 'px';
    block.style.height = height + 'px';
    block.style.background = color;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = label;
    block.appendChild(nameSpan);

    if(height > 30){
      const timeSpan = document.createElement('span');
      timeSpan.className = 'gb-time';
      timeSpan.textContent = timeLabel;
      block.appendChild(timeSpan);
    }

    if(task){
      block.tabIndex = 0;
      block.title = '클릭해서 수정하기';
      block.addEventListener('click', ()=> openEditModal(task.id));
      block.addEventListener('keydown', (e)=>{
        if(e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          openEditModal(task.id);
        }
      });
    }
    trackEl.appendChild(block);
  }

  // 그리드 첫 시간~기상 사이에 걸친 수면 조각
  if(wakeMin > gridStartMin){
    addBlock(gridStartMin, wakeMin, 'var(--sleep)', '수면', `${minToClock(gridStartMin)}~${minToClock(wakeMin)}`, null);
  }
  if(bedMin < gridEndMin){
    addBlock(bedMin, gridEndMin, 'var(--sleep)', '수면', `${minToClock(bedMin)}~${minToClock(gridEndMin)}`, null);
  }

  // 기상~취침 사이: 일정과 여유 시간을 시간순으로 채움
  const sorted = [...scheduled].sort((a,b)=>a.startMin-b.startMin);
  let cursor = wakeMin;
  sorted.forEach(t=>{
    const s = Math.max(wakeMin, t.startMin);
    const e = Math.min(bedMin, t.endMin);
    if(s > cursor){
      addBlock(cursor, s, 'var(--free)', '여유', `${minToClock(cursor)}~${minToClock(s)}`, null);
    }
    if(e > cursor){
      const label = (t.locked ? '🔒 ' : '') + (t.critical ? '★ ' : '') + t.text;
      addBlock(Math.max(cursor, s), e, colorForTask(t), label, `${minToClock(t.startMin)}~${minToClock(t.endMin)}`, t);
      cursor = e;
    }
  });
  if(cursor < bedMin){
    addBlock(cursor, bedMin, 'var(--free)', '여유', `${minToClock(cursor)}~${minToClock(bedMin)}`, null);
  }
}

// ---- 일정 클릭 → 수정 모달 ----
let editingTaskId = null;
const editBackdrop = document.getElementById('editBackdrop');
const editName = document.getElementById('editName');
const editStart = document.getElementById('editStart');
const editEnd = document.getElementById('editEnd');
const editCriticalChip = document.getElementById('editCriticalChip');
const editLockedChip = document.getElementById('editLockedChip');
const editWarn = document.getElementById('editWarn');

function toggleChip(chip){
  chip.classList.toggle('active');
}
editCriticalChip.addEventListener('click', ()=>{
  const isActive = editCriticalChip.classList.contains('active');
  if(!isActive){
    const t = tasks.find(x=>x.id===editingTaskId);
    const alreadyCritical = !!(t && t.critical);
    if(!alreadyCritical && criticalCount() >= 3){
      showEditWarn('Top3는 최대 3개까지예요. 다른 항목을 먼저 해제하세요.');
      return;
    }
  }
  editWarn.style.display = 'none';
  toggleChip(editCriticalChip);
});
editLockedChip.addEventListener('click', ()=> toggleChip(editLockedChip));

function openEditModal(taskId){
  const t = tasks.find(x=>x.id===taskId);
  if(!t) return;
  editingTaskId = taskId;
  editName.value = t.text;
  editStart.value = minToClock(t.startMin);
  editEnd.value = minToClock(t.endMin);
  editCriticalChip.classList.toggle('active', !!t.critical);
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

document.getElementById('editDeleteBtn').addEventListener('click', ()=>{
  if(editingTaskId == null) return;
  tasks = tasks.filter(x=>x.id !== editingTaskId);
  closeEditModal();
  persist();
  renderGridTimetable();
});

document.getElementById('editSaveBtn').addEventListener('click', ()=>{
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
  const wantsCritical = editCriticalChip.classList.contains('active');
  if(wantsCritical && !t.critical && criticalCount() >= 3){
    showEditWarn('Top3는 이미 3개가 선택되어 있어요.');
    return;
  }

  t.text = name;
  t.startMin = newStart;
  t.endMin = newEnd;
  t.critical = wantsCritical;
  t.locked = editLockedChip.classList.contains('active');

  closeEditModal();
  persist();
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

renderGridTimetable();
