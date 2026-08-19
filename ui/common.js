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

// timeToMin()은 "HH:MM"을 항상 0~1439 사이의 값으로만 돌려준다.
// 근데 기상 07:00 / 취침 03:00(다음날 새벽)처럼 자정을 넘기는 하루도 있기 때문에,
// "기상 시각보다 이른 시각"은 자정을 넘긴 다음날 새벽으로 보고 1440을 더해 하루를 그대로 연장한다.
// (예: 기상 07:00=420, 취침 03:00=180 → 03:00은 420보다 이르므로 180+1440=1620으로 취급)
function normalizeToWindow(rawMin, wakeMin){
  return rawMin < wakeMin ? rawMin + 1440 : rawMin;
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

function formatDateObj(d){
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 'YYYY-MM-DD' 문자열에 날짜를 더하거나(delta>0) 빼는(delta<0) 헬퍼
function addDaysToDateStr(dateStr, delta){
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return formatDateObj(d);
}

// (참고용으로 남겨둠 - 예전에는 이 두 함수로 날짜를 계산했음)
function getPlanDate(){
  return addDaysToDateStr(formatDateObj(new Date()), 1);
}
function getTodayDate(){
  return formatDateObj(new Date());
}

// 지금 이 순간이 속한 "활성 날짜"를 계산한다.
// 자정이 아니라 그 날짜에 설정된 "기상 시각"을 하루의 경계로 본다:
// - 오늘(달력 기준) 날짜에 저장된 기상 시각이 있고, 지금이 그 시각 이전이면
//   → 아직 어제 하루(전날 밤에 세운 계획)가 안 끝난 것으로 보고 "어제" 날짜를 반환
// - 그 외에는 오늘(달력 기준) 날짜를 그대로 반환
// (기상 시각 정보를 아직 못 구했으면 그냥 달력 기준 오늘을 반환 — 새벽 2시에 자는 사람도,
//  밤낮이 바뀐 사람도 각자 설정한 기상 시각을 기준으로 하루가 넘어가게 하기 위함)
async function resolveActiveDate(){
  const calToday = formatDateObj(new Date());
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  let wakeMinToday = null;
  try{
    const ds = await apiGet(`/day-settings/${calToday}`);
    if(ds && ds.wake_up_time != null) wakeMinToday = ds.wake_up_time;
  } catch(e){
    // 조회 실패하면 그냥 달력 기준 오늘로 취급
  }

  if(wakeMinToday != null && nowMin < wakeMinToday){
    return addDaysToDateStr(calToday, -1);
  }
  return calToday;
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