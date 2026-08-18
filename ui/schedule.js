const ACCENTS = ['#E8720C','#B8511F','#8A3A15'];
const MUTED = ['#5B7A99','#7C8CA3','#4E6580','#8B98AC'];

// planning.html과 동일한 기준으로 날짜를 계산 (항상 "다음날")
const PLAN_DATE = getPlanDate();

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

  // 칸[cellStart,cellEnd]과 구간[blockStart,blockEnd]이 걸쳐있으면(경계에 닿기만 해도) true
  function hits(blockStart, blockEnd, cellStart, cellEnd){
    return cellStart < blockEnd && blockStart <= cellEnd;
  }

  for(let h=gridStartHour; h<gridEndHour; h++){
    const rowIndex = h - gridStartHour + 1; // 1-based grid row
    const isFirstRow = (rowIndex === 1);

    const hourCell = document.createElement('div');
    hourCell.className = 'grid-hour-cell' + (isFirstRow ? ' first-row' : '');
    hourCell.textContent = String(h).padStart(2,'0');
    hourCell.style.gridRow = rowIndex;
    hourCell.style.gridColumn = 1;
    tableEl.appendChild(hourCell);

    // 이 행의 6칸(:10~:60) 각각이 어떤 상태인지 먼저 계산
    const slots = [];
    for(let i=0; i<6; i++){
      const m = (i+1) * 10;
      const cellEnd = h*60 + m;
      const cellStart = cellEnd - 10;
      const hitTask = scheduled.find(t => hits(t.startMin, t.endMin, cellStart, cellEnd));
      if(hitTask){
        slots.push({ key: 'task:' + hitTask.id, task: hitTask, cellStart, cellEnd });
      } else if(hits(wakeMin, bedMin, cellStart, cellEnd)){
        slots.push({ key: 'free', cellStart, cellEnd });
      } else {
        slots.push({ key: 'sleep', cellStart, cellEnd });
      }
    }

    // 같은 상태가 이어지는 칸들을 하나로 합쳐서 그리기
    let i = 0;
    while(i < 6){
      let j = i;
      while(j + 1 < 6 && slots[j+1].key === slots[i].key) j++;
      const run = slots[i];
      const span = j - i + 1;

      const cell = document.createElement('div');
      cell.className = 'grid-cell' + (isFirstRow ? ' first-row' : '');
      cell.style.gridRow = rowIndex;
      cell.style.gridColumn = `${2 + i} / span ${span}`;

      if(run.key === 'free'){
        // 여유 시간은 배경색 없이 빈 칸으로 표시
      } else if(run.key === 'sleep'){
        cell.style.background = 'var(--sleep)';
      } else {
        const t = run.task;
        cell.style.background = colorForTask(t);
        cell.classList.add('clickable');
        cell.tabIndex = 0;
        cell.title = `${t.text} (클릭해서 수정)`;
        cell.addEventListener('click', ()=> openEditModal(t.id));
        cell.addEventListener('keydown', (e)=>{
          if(e.key === 'Enter' || e.key === ' '){
            e.preventDefault();
            openEditModal(t.id);
          }
        });

        // 그 일정이 실제로 시작하는 칸에만 이름을 표시 (다음 행으로 이어져도 중복 표시 안 함)
        if(run.cellStart <= t.startMin){
          const label = document.createElement('span');
          label.className = 'gc-label';
          label.textContent = (t.locked ? '🔒' : '') + (t.critical ? '★ ' : '') + t.text;
          cell.appendChild(label);
        }
      }

      tableEl.appendChild(cell);

      // 병합된 칸 안에도 10분 단위 구분선을 표시하되, 같은 일정끼리는 하나로 이어져 보이게 생략
      const isTaskRun = run.key.startsWith('task:');
      if(span > 1 && !isTaskRun){
        for(let k=1; k<span; k++){
          const tick = document.createElement('div');
          tick.className = 'gc-tick';
          tick.style.left = (k/span*100) + '%';
          tick.style.background = 'var(--line)';
          cell.appendChild(tick);
        }
      }

      i = j + 1;
    }
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
  const saveBtn = document.getElementById('editSaveBtn');
  saveBtn.disabled = true;

  const payload = taskToEventPayload({
    text: name,
    startMin: newStart,
    endMin: newEnd,
    critical: t.critical,
    locked: editLockedChip.classList.contains('active')
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
    alert('서버에서 데이터를 불러오지 못했어요: ' + e.message + '\n서버(npm start)가 켜져 있는지 확인해주세요.');
    window.location.href = 'planning.html';
    return;
  }

  if(!saved){
    window.location.href = 'planning.html';
    return;
  }

  wake = saved.wake || '07:00';
  bed = saved.bed || '23:00';
  tasks = saved.tasks;

  renderGridTimetable();
})();
