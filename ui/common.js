// ---- planning.html / schedule.html이 공통으로 쓰는 순수 함수들 ----

function timeToMin(t){
  const raw = String(t || '').trim();

  if(raw.includes(':')){
    const parts = raw.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if(isNaN(h) || isNaN(m)) return 0;
    return h*60 + m;
  }

  // 콜론 없이 숫자만 입력한 경우: 7 → 07:00, 730 → 07:30, 1930 → 19:30
  const digits = raw.replace(/\D/g, '');
  if(digits.length === 0) return 0;

  let h, m;
  if(digits.length <= 2){
    h = parseInt(digits, 10);
    m = 0;
  } else {
    m = parseInt(digits.slice(-2), 10);
    h = parseInt(digits.slice(0, -2), 10);
  }
  if(isNaN(h) || isNaN(m)) return 0;
  return h*60 + m;
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

function normalizeClockInput(input){
  input.addEventListener('blur', ()=>{
    input.value = minToClock(timeToMin(input.value));
  });
}

// ---- planning.html ↔ schedule.html ↔ 백엔드 API ----
const API_BASE = 'http://localhost:3000/api';

// 이 플래너는 "전날 밤에 다음날을 계획"하는 게 컨셉이라, 항상 내일 날짜를 기준으로 저장/조회합니다.
function getPlanDate(){
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function apiGet(path){
  const res = await fetch(`${API_BASE}${path}`);
  if(!res.ok) throw new Error(`서버 요청 실패 (${res.status})`);
  return res.json();
}

async function apiSend(method, path, body){
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if(!res.ok){
    let msg = `서버 요청 실패 (${res.status})`;
    try{ const err = await res.json(); if(err.error) msg = err.error; } catch(e){}
    throw new Error(msg);
  }
  if(res.status === 204) return null;
  return res.json();
}

// 그 날짜의 저장된 데이터 불러오기 (없으면 null)
async function loadPlannerState(date){
  const [daySettings, events] = await Promise.all([
    apiGet(`/day-settings/${date}`),
    apiGet(`/events?date=${date}`)
  ]);
  if(!events || events.length === 0) return null;
  return {
    wake: (daySettings && daySettings.wake_up_time != null) ? minToClock(daySettings.wake_up_time) : null,
    bed: (daySettings && daySettings.sleep_time != null) ? minToClock(daySettings.sleep_time) : null,
    tasks: events.map(eventRowToTask)
  };
}

// 완료 버튼: 기상/취침 시각 저장 + 그 날짜의 기존 일정을 전부 지우고 지금 목록으로 다시 생성
async function savePlannerState(date, wake, bed, tasks){
  await apiSend('PUT', `/day-settings/${date}`, {
    wake_up_time: timeToMin(wake),
    sleep_time: timeToMin(bed)
  });

  const existing = await apiGet(`/events?date=${date}`);
  for(const ev of existing){
    await apiSend('DELETE', `/events/${ev.event_id}`);
  }

  const created = [];
  for(const t of tasks){
    const saved = await apiSend('POST', '/events', taskToEventPayload(t, date));
    created.push(eventRowToTask(saved));
  }
  return created;
}

function eventRowToTask(row){
  return {
    id: row.event_id,
    text: row.title,
    critical: !!row.is_top3,
    locked: !!row.is_locked,
    startMin: row.start_time,
    endMin: row.end_time,
    routineItemId: row.routine_item_id || null
  };
}
function taskToEventPayload(task, date){
  return {
    title: task.text,
    date,
    start_time: task.startMin,
    end_time: task.endMin,
    is_top3: task.critical ? 1 : 0,
    is_locked: task.locked ? 1 : 0,
    event_type: task.routineItemId ? 'routine' : 'manual',
    routine_item_id: task.routineItemId || null
  };
}