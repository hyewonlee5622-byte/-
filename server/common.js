// ---- main.html / schedule.html이 공통으로 쓰는 순수 함수들 ----

function timeToMin(t){
  const parts = String(t || '').split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
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

// ---- main.html ↔ schedule.html 간 데이터 전달 (localStorage) ----
const PLANNER_STORAGE_KEY = 'timeplanner:data';

function loadPlannerState(){
  try{
    const raw = localStorage.getItem(PLANNER_STORAGE_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(!data || !Array.isArray(data.tasks)) return null;
    return data;
  } catch(e){
    return null;
  }
}

function savePlannerState(wake, bed, tasks){
  try{
    localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify({ wake, bed, tasks }));
    return true;
  } catch(e){
    return false;
  }
}
