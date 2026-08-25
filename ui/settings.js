const routineForm = document.getElementById('routineForm');
const routineNameInput = document.getElementById('routineNameInput');
const routineListEl = document.getElementById('routineList');

let routines = [];
let categories = [];

// planning.js가 "할 일 기록"에서 루틴 일정을 지울 때 localStorage에
// `planner_excluded_routines_YYYY-MM-DD` 키로 "이 날짜에서는 이 항목 빼기"를 기록해둔다.
// 루틴을 껐다가 다시 켜면, 그 루틴 항목들에 대한 이 기록을 전부 지워서 다시 나타나게 한다.
function clearExclusionForRoutineItems(routineItemIds){
  if(!routineItemIds || routineItemIds.length === 0) return;
  const idSet = new Set(routineItemIds);
  try{
    const keysToCheck = [];
    for(let i=0; i<localStorage.length; i++){
      const key = localStorage.key(i);
      if(key && key.startsWith('planner_excluded_routines_')) keysToCheck.push(key);
    }
    keysToCheck.forEach(key => {
      try{
        const ids = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
        let changed = false;
        idSet.forEach(id => {
          if(ids.has(id)){ ids.delete(id); changed = true; }
        });
        if(changed) localStorage.setItem(key, JSON.stringify([...ids]));
      } catch(e){}
    });
  } catch(e){
    // localStorage를 못 쓰는 환경이어도 루틴 켜고 끄는 기능 자체는 계속 동작해야 하니 조용히 넘어감
  }
}

async function loadRoutines(){
  try{
    categories = await apiGet('/categories');
  } catch(e){
    // 카테고리를 못 불러와도 루틴 설정 자체는 계속 쓸 수 있어야 하니 조용히 넘어감
  }
  try{
    routines = await apiGet('/routines');
  } catch(e){
    alert('루틴을 불러오지 못했어요: ' + e.message + '\n서버(npm start)가 켜져 있는지 확인해주세요.');
    routines = [];
  }
  renderRoutines();
}

function renderRoutines(){
  routineListEl.innerHTML = '';

  if(routines.length === 0){
    routineListEl.innerHTML = '<p class="empty">아직 만든 루틴이 없어요. 위에서 새 루틴을 만들어보세요.</p>';
    return;
  }

  routines.forEach(r => {
    const card = document.createElement('section');
    card.className = 'phase routine-card' + (r.is_active ? '' : ' routine-off');

    // ---- 헤더: 켜기/끄기 스위치 + 이름 + 삭제 ----
    const head = document.createElement('div');
    head.className = 'phase-head routine-head';

    const switchLabel = document.createElement('label');
    switchLabel.className = 'switch';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = !!r.is_active;
    toggle.addEventListener('change', async ()=>{
      toggle.disabled = true;
      try{
        await apiSend('PUT', `/routines/${r.routine_id}`, { name: r.name, is_active: toggle.checked ? 1 : 0 });
        r.is_active = toggle.checked ? 1 : 0;

        // 루틴을 끄는 순간, 이미 "다음날 계획"에 반영된 이 루틴의 일정이 있으면 즉시 정리.
        // (여기서 안 지우면, DB에 예전 top3/시간 값이 남아있다가 나중에 루틴을 다시 켰을 때
        //  planning.html이 그 오래된 값을 그대로 물고 들어오게 됨)
        // 중요: 반드시 "다음날" 날짜만 정리해야 하고, "오늘" 일정은 절대 건드리면 안 됨.
        // (달력상 오늘+1이 아니라, schedule.html/planning.html과 동일하게 기상 시각 기준으로 계산)
        if(!toggle.checked){
          const routineItemIds = new Set(r.items.map(it => it.routine_item_id));
          if(routineItemIds.size > 0){
            try{
              const todayActive = await resolveActiveDate();
              const planDate = addDaysToDateStr(todayActive, 1); // 오늘(활성 날짜)이 아니라 반드시 그 다음날
              const events = await apiGet(`/events?date=${planDate}`);
              const toDelete = events.filter(ev => routineItemIds.has(ev.routine_item_id));
              for(const ev of toDelete){
                await apiSend('DELETE', `/events/${ev.event_id}`);
              }
            } catch(e){
              // 정리에 실패해도 루틴 켜고 끄는 기능 자체는 계속 동작해야 하니 조용히 넘어감
            }
          }
        } else {
          // 루틴을 다시 켤 때는, "이 날짜에서는 뺐다"고 기록해둔 게 있으면 전부 지워서
          // 다음에 그 날짜를 열었을 때 다시 나타나게 한다.
          clearExclusionForRoutineItems(r.items.map(it => it.routine_item_id));
        }

        renderRoutines();
      } catch(e){
        alert('변경에 실패했어요: ' + e.message);
        toggle.checked = !toggle.checked;
        toggle.disabled = false;
      }
    });
    const slider = document.createElement('span');
    slider.className = 'slider';
    switchLabel.append(toggle, slider);

    const title = document.createElement('h2');
    title.textContent = r.name;
    title.style.flex = '1';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'del';
    delBtn.textContent = '✕';
    delBtn.title = '루틴 삭제';
    delBtn.addEventListener('click', async ()=>{
      if(!confirm(`"${r.name}" 루틴을 삭제할까요? 안에 있는 일정도 같이 삭제돼요.`)) return;
      try{
        await apiSend('DELETE', `/routines/${r.routine_id}`);
        routines = routines.filter(x => x.routine_id !== r.routine_id);

        // 이 루틴의 항목들이 이미 "다음날 계획"에 반영되어 있었을 수 있으니 즉시 정리
        try{
          const routineItemIds = new Set(r.items.map(it => it.routine_item_id));
          if(routineItemIds.size > 0){
            const todayActive = await resolveActiveDate();
            const planDate = addDaysToDateStr(todayActive, 1);
            const events = await apiGet(`/events?date=${planDate}`);
            const toDelete = events.filter(ev => routineItemIds.has(ev.routine_item_id));
            for(const ev of toDelete){
              await apiSend('DELETE', `/events/${ev.event_id}`);
            }
          }
        } catch(e){
          // 정리 실패해도 루틴 삭제 자체는 이미 됐으니 조용히 넘어감
        }

        renderRoutines();
      } catch(e){
        alert('삭제에 실패했어요: ' + e.message);
      }
    });

    head.append(switchLabel, title, delBtn);
    card.appendChild(head);

    // ---- 아이템 목록 ----
    const itemList = document.createElement('ul');
    itemList.className = 'task-list';

    if(r.items.length === 0){
      itemList.innerHTML = '<li class="empty">등록된 일정이 없어요.</li>';
    } else {
      r.items.forEach(it => {
        const li = document.createElement('li');
        li.className = 'task-item';

        const txt = document.createElement('span');
        txt.className = 'txt';
        const start = it.preferred_time;
        const end = it.preferred_time + it.duration;
        const cat = categories.find(c => c.category_id === it.category_id);
        const catLabel = cat ? ` [${cat.icon ? cat.icon + ' ' : ''}${cat.name}]` : '';
        txt.textContent = `${it.is_locked ? '🔒 ' : ''}${it.name} · ${minToClock(start)}~${minToClock(end)}${catLabel}`;

        const itemDel = document.createElement('button');
        itemDel.type = 'button';
        itemDel.className = 'del';
        itemDel.textContent = '✕';
        itemDel.addEventListener('click', async ()=>{
          try{
            await apiSend('DELETE', `/routine-items/${it.routine_item_id}`);
            r.items = r.items.filter(x => x.routine_item_id !== it.routine_item_id);

            // 이 항목이 이미 "다음날 계획"에 반영되어 있었을 수 있으니 즉시 정리
            // (루틴을 통째로 껐을 때와 동일하게, 오늘 일정은 절대 건드리지 않고 다음날만 정리)
            try{
              const todayActive = await resolveActiveDate();
              const planDate = addDaysToDateStr(todayActive, 1);
              const events = await apiGet(`/events?date=${planDate}`);
              const toDelete = events.filter(ev => ev.routine_item_id === it.routine_item_id);
              for(const ev of toDelete){
                await apiSend('DELETE', `/events/${ev.event_id}`);
              }
            } catch(e){
              // 정리 실패해도 항목 삭제 자체는 이미 됐으니 조용히 넘어감
            }

            renderRoutines();
          } catch(e){
            alert('삭제에 실패했어요: ' + e.message);
          }
        });

        li.append(txt, itemDel);
        itemList.appendChild(li);
      });
    }
    card.appendChild(itemList);

    // ---- 아이템 추가 폼 ----
    const itemForm = document.createElement('form');
    itemForm.className = 'task-form routine-item-form';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = '일정 이름';

    const startInput = document.createElement('input');
    startInput.type = 'text';
    startInput.className = 'clock-input';
    startInput.placeholder = 'HH:MM';
    startInput.inputMode = 'numeric';
    startInput.maxLength = 5;
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
    normalizeClockInput(endInput);

    const lockLabel = document.createElement('label');
    lockLabel.className = 'routine-lock-label';
    const lockCheckbox = document.createElement('input');
    lockCheckbox.type = 'checkbox';
    lockLabel.append(lockCheckbox, document.createTextNode('🔒'));

    const catSelect = document.createElement('select');
    catSelect.className = 'clock-input';
    catSelect.style.width = 'auto';
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '카테고리 없음';
    catSelect.appendChild(noneOpt);
    categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.category_id;
      opt.textContent = `${c.icon ? c.icon + ' ' : ''}${c.name}`;
      catSelect.appendChild(opt);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'submit';
    addBtn.textContent = '추가';

    itemForm.append(nameInput, startInput, dash, endInput, lockLabel, catSelect, addBtn);

    itemForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const name = nameInput.value.trim();
      if(!name) return;
      const start = timeToMin(startInput.value);
      const end = timeToMin(endInput.value);
      if(end <= start){
        alert('종료 시각이 시작 시각보다 늦어야 해요.');
        return;
      }
      try{
        const created = await apiSend('POST', `/routines/${r.routine_id}/items`, {
          name, preferred_time: start, duration: end - start,
          is_locked: lockCheckbox.checked ? 1 : 0,
          category_id: catSelect.value ? parseInt(catSelect.value, 10) : null
        });
        r.items.push(created);
        renderRoutines();
      } catch(e){
        alert('추가에 실패했어요: ' + e.message);
      }
    });

    card.appendChild(itemForm);
    routineListEl.appendChild(card);
  });
}

routineForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const name = routineNameInput.value.trim();
  if(!name) return;
  try{
    const created = await apiSend('POST', '/routines', { name });
    routines.push(created);
    routineNameInput.value = '';
    renderRoutines();
  } catch(e){
    alert('루틴 추가에 실패했어요: ' + e.message);
  }
});

loadRoutines();