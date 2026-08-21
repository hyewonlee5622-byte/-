const reportDateInput = document.getElementById('reportDateInput');
const reportTodayBtn = document.getElementById('reportTodayBtn');

const completionRingFg = document.getElementById('completionRingFg');
const completionPercentLabel = document.getElementById('completionPercentLabel');
const completionText = document.getElementById('completionText');
const completionHint = document.getElementById('completionHint');

const pieChartEl = document.getElementById('pieChart');
const categoryLegendEl = document.getElementById('categoryLegend');
const dayListEl = document.getElementById('dayList');

let categories = [];
let todayActiveDate = null; // "오늘로" 버튼 기준

// 카테고리가 없는 일정을 표시할 때 쓰는 기본값
const NO_CATEGORY = { name: '카테고리 없음', color: '#C7D0DA', icon: '❔' };

// ---- 완료율 (개수 기준) ----
function renderCompletion(events){
  const total = events.length;
  const done = events.filter(ev => ev.is_completed).length;
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;

  const R = 66;
  const C = 2 * Math.PI * R;
  completionRingFg.setAttribute('stroke-dasharray', `${C}`);
  completionRingFg.setAttribute('stroke-dashoffset', `${C * (1 - rate / 100)}`);

  completionPercentLabel.textContent = `${rate}%`;
  completionText.textContent = `${done} / ${total}개 완료`;
  completionHint.textContent = total === 0
    ? '이 날짜에 계획된 일정이 없어요.'
    : (rate === 100 ? '전부 완료했어요! 🎉' : `${total - done}개 남았어요.`);
}

// ---- 카테고리별 시간 비율 (도넛 차트) ----
function renderCategoryChart(events){
  const catMap = new Map(categories.map(c => [c.category_id, c]));
  const totals = new Map(); // key(카테고리 id 또는 'none') -> 분(minute)

  events.forEach(ev => {
    if(ev.start_time == null || ev.end_time == null) return;
    const duration = ev.end_time - ev.start_time;
    if(duration <= 0) return;
    const key = ev.category_id || 'none';
    totals.set(key, (totals.get(key) || 0) + duration);
  });

  const entries = [...totals.entries()]
    .map(([key, minutes]) => {
      const cat = key === 'none' ? null : catMap.get(key);
      return {
        name: cat ? cat.name : NO_CATEGORY.name,
        color: cat ? (cat.color || NO_CATEGORY.color) : NO_CATEGORY.color,
        icon: cat ? (cat.icon || '') : NO_CATEGORY.icon,
        minutes
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  drawDonut(entries);
  renderCategoryLegend(entries);
}

function drawDonut(entries){
  pieChartEl.innerHTML = '';
  const cx = 90, cy = 90, R = 70, STROKE = 30;
  const total = entries.reduce((s, e) => s + e.minutes, 0);

  if(total === 0){
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bg.setAttribute('cx', cx); bg.setAttribute('cy', cy); bg.setAttribute('r', R);
    bg.setAttribute('fill', 'none');
    bg.setAttribute('stroke', 'var(--line)');
    bg.setAttribute('stroke-width', STROKE);
    pieChartEl.appendChild(bg);
    return;
  }

  const C = 2 * Math.PI * R;
  let offset = 0;
  entries.forEach(e => {
    const frac = e.minutes / total;
    const len = frac * C;
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', cx); circle.setAttribute('cy', cy); circle.setAttribute('r', R);
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', e.color);
    circle.setAttribute('stroke-width', STROKE);
    circle.setAttribute('stroke-dasharray', `${len} ${C - len}`);
    circle.setAttribute('stroke-dashoffset', `${-offset}`);
    circle.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
    pieChartEl.appendChild(circle);
    offset += len;
  });
}

function renderCategoryLegend(entries){
  categoryLegendEl.innerHTML = '';
  const total = entries.reduce((s, e) => s + e.minutes, 0);

  if(entries.length === 0){
    categoryLegendEl.innerHTML = '<li class="empty">시간이 배정된 일정이 없어요.</li>';
    return;
  }

  entries.forEach(e => {
    const pct = total > 0 ? Math.round((e.minutes / total) * 100) : 0;
    const li = document.createElement('li');

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = e.color;

    const name = document.createElement('span');
    name.className = 'report-legend-name';
    name.textContent = `${e.icon ? e.icon + ' ' : ''}${e.name}`;

    const value = document.createElement('span');
    value.className = 'report-legend-value';
    value.textContent = `${minToHM(e.minutes)} · ${pct}%`;

    li.append(dot, name, value);
    categoryLegendEl.appendChild(li);
  });
}

// ---- 오늘 어떻게 보냈나 (시간순 목록) ----
function renderDayList(events){
  dayListEl.innerHTML = '';
  const catMap = new Map(categories.map(c => [c.category_id, c]));

  const scheduled = events
    .filter(ev => ev.start_time != null && ev.end_time != null && ev.end_time > ev.start_time)
    .sort((a, b) => a.start_time - b.start_time);

  if(scheduled.length === 0){
    dayListEl.innerHTML = '<li class="empty">계획된 일정이 없어요.</li>';
    return;
  }

  scheduled.forEach(ev => {
    const cat = ev.category_id ? catMap.get(ev.category_id) : null;
    const row = document.createElement('li');
    row.className = 'report-day-row' + (ev.is_completed ? ' done' : '');

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = cat ? (cat.color || NO_CATEGORY.color) : NO_CATEGORY.color;

    const time = document.createElement('span');
    time.className = 'report-day-time';
    time.textContent = `${minToClock(ev.start_time)}~${minToClock(ev.end_time)}`;

    const name = document.createElement('span');
    name.className = 'report-day-name';
    name.textContent = (ev.is_top3 ? '★ ' : '') + ev.title;

    const check = document.createElement('span');
    check.className = 'report-day-check';
    check.textContent = ev.is_completed ? '✓ 완료' : '';

    row.append(dot, time, name, check);
    dayListEl.appendChild(row);
  });
}

// ---- 날짜별로 리포트 전체를 불러와서 그림 ----
async function loadReport(date){
  reportDateInput.value = date;

  let events = [];
  try{
    events = await apiGet(`/events?date=${date}`);
  } catch(e){
    alert('데이터를 불러오지 못했어요: ' + e.message + '\n서버(npm start)가 켜져 있는지 확인해주세요.');
    return;
  }

  renderCompletion(events);
  renderCategoryChart(events);
  renderDayList(events);
}

reportDateInput.addEventListener('change', ()=>{
  if(reportDateInput.value) loadReport(reportDateInput.value);
});
reportTodayBtn.addEventListener('click', ()=>{
  if(todayActiveDate) loadReport(todayActiveDate);
});

// ---- 설정 (아직 개발 전인 기능들의 선택 상태만 저장) ----
const APP_SETTINGS_KEY = 'planner_app_settings';
const settingTimeAttack = document.getElementById('settingTimeAttack');
const settingOverseas = document.getElementById('settingOverseas');

function loadAppSettings(){
  try{
    const raw = localStorage.getItem(APP_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch(e){
    return {};
  }
}
function saveAppSettings(settings){
  try{
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
  } catch(e){
    console.warn('설정 저장 실패:', e.message);
  }
}

const appSettings = loadAppSettings();
settingTimeAttack.checked = !!appSettings.timeAttack;
settingOverseas.checked = !!appSettings.overseas;

settingTimeAttack.addEventListener('change', ()=>{
  const s = loadAppSettings();
  s.timeAttack = settingTimeAttack.checked;
  saveAppSettings(s);
});
settingOverseas.addEventListener('change', ()=>{
  const s = loadAppSettings();
  s.overseas = settingOverseas.checked;
  saveAppSettings(s);
});

// ---- 초기 로딩 ----
(async function init(){
  try{
    categories = await apiGet('/categories');
  } catch(e){
    // 카테고리를 못 불러와도 리포트 자체는 계속 볼 수 있어야 하니 조용히 넘어감
  }

  try{
    todayActiveDate = await resolveActiveDate();
  } catch(e){
    todayActiveDate = getTodayDate();
  }

  await loadReport(todayActiveDate);
})();
