const routineForm = document.getElementById('routineForm');
const routineNameInput = document.getElementById('routineNameInput');
const routineListEl = document.getElementById('routineList');

let routines = [];

async function loadRoutines(){
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
        txt.textContent = `${it.is_locked ? '🔒 ' : ''}${it.name} · ${minToClock(start)}~${minToClock(end)}`;

        const itemDel = document.createElement('button');
        itemDel.type = 'button';
        itemDel.className = 'del';
        itemDel.textContent = '✕';
        itemDel.addEventListener('click', async ()=>{
          try{
            await apiSend('DELETE', `/routine-items/${it.routine_item_id}`);
            r.items = r.items.filter(x => x.routine_item_id !== it.routine_item_id);
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
    nameInput.placeholder = '일정 이름 (예: 스트레칭)';

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

    const addBtn = document.createElement('button');
    addBtn.type = 'submit';
    addBtn.textContent = '추가';

    itemForm.append(nameInput, startInput, dash, endInput, lockLabel, addBtn);

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
          name, preferred_time: start, duration: end - start, is_locked: lockCheckbox.checked ? 1 : 0
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
