const express = require('express');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite'); // Node 22+ 내장 (실험적 기능)

const DB_PATH = path.join(__dirname, 'planner.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new DatabaseSync(DB_PATH);
db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

// 이미 만들어진 DB에 새 컬럼을 추가하는 간단한 마이그레이션 (이미 있으면 조용히 무시)
try{ db.exec('ALTER TABLE routine_item ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0'); } catch(e){}
try{ db.exec('ALTER TABLE routine_item ADD COLUMN category_id INTEGER'); } catch(e){}

// 카테고리 기본 시드 데이터 (테이블이 비어있을 때만 한 번 채워넣음)
try{
  const existingCount = db.prepare('SELECT COUNT(*) AS c FROM category').get();
  if(existingCount.c === 0){
    const insertCategory = db.prepare(
      'INSERT INTO category (name, color, icon, sort_order) VALUES (?, ?, ?, ?)'
    );
    const defaultCategories = [
      ['업무/학업', '#3A6EA5', '💼', 1],
      ['건강/운동', '#4C9A6B', '💪', 2],
      ['식사',     '#D98A3D', '🍚', 3],
      ['집안일',   '#8A7A66', '🧹', 4],
      ['자기관리', '#B06AA2', '🧴', 5],
      ['관계/사교', '#D9556B', '👥', 6],
      ['여가/취미', '#4FA3A8', '🎮', 7],
      ['자기계발', '#6A6ADB', '📚', 8],
    ];
    defaultCategories.forEach(c => insertCategory.run(...c));
  }
} catch(e){
  // 시드 실패해도 서버는 계속 떠야 하니 조용히 넘어감
}

const app = express();
app.use(express.json());

// Live Server 등 다른 포트(origin)에서 오는 요청을 허용
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---------- 공용 헬퍼 ----------
function row(stmt, ...params) {
  return stmt.get(...params);
}
function all(stmt, ...params) {
  return stmt.all(...params);
}

// ============================================
// DAY SETTINGS  (기상/취침 시각 - main.html의 Phase 01)
// ============================================

// GET /api/day-settings/:date  ->  { date, wake_up_time, sleep_time, ... }
app.get('/api/day-settings/:date', (req, res) => {
  const stmt = db.prepare('SELECT * FROM day_settings WHERE date = ?');
  const data = row(stmt, req.params.date);
  res.json(data || null);
});

// PUT /api/day-settings/:date  ->  있으면 갱신, 없으면 생성 (upsert)
app.put('/api/day-settings/:date', (req, res) => {
  const { date } = req.params;
  const { wake_up_time, breakfast_time, lunch_time, dinner_time, sleep_time } = req.body;

  const existing = row(db.prepare('SELECT day_setting_id FROM day_settings WHERE date = ?'), date);

  if (existing) {
    db.prepare(`
      UPDATE day_settings
      SET wake_up_time = ?, breakfast_time = ?, lunch_time = ?, dinner_time = ?, sleep_time = ?
      WHERE date = ?
    `).run(wake_up_time ?? null, breakfast_time ?? null, lunch_time ?? null, dinner_time ?? null, sleep_time ?? null, date);
  } else {
    db.prepare(`
      INSERT INTO day_settings (date, wake_up_time, breakfast_time, lunch_time, dinner_time, sleep_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(date, wake_up_time ?? null, breakfast_time ?? null, lunch_time ?? null, dinner_time ?? null, sleep_time ?? null);
  }

  const updated = row(db.prepare('SELECT * FROM day_settings WHERE date = ?'), date);
  res.json(updated);
});

// ============================================
// EVENTS  (할 일 목록 - main.html의 Phase 02/03, schedule.html)
// ============================================

// GET /api/events?date=YYYY-MM-DD  -> 그 날의 모든 일정
app.get('/api/events', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date 쿼리 파라미터가 필요해요.' });

  const events = all(
    db.prepare('SELECT * FROM event WHERE date = ? ORDER BY start_time ASC'),
    date
  );
  res.json(events);
});

// POST /api/events  -> 새 일정 추가
app.post('/api/events', (req, res) => {
  const {
    title, date, start_time, end_time,
    category_id = null, routine_item_id = null,
    event_type = 'manual', is_top3 = 0, is_locked = 0, memo = null
  } = req.body;

  if (!title || !date || start_time == null || end_time == null) {
    return res.status(400).json({ error: 'title, date, start_time, end_time은 필수예요.' });
  }
  if (end_time <= start_time) {
    return res.status(400).json({ error: '종료 시각이 시작 시각보다 늦어야 해요.' });
  }

  const result = db.prepare(`
    INSERT INTO event (title, date, start_time, end_time, category_id, routine_item_id, event_type, is_top3, is_locked, memo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, date, start_time, end_time, category_id, routine_item_id, event_type, is_top3 ? 1 : 0, is_locked ? 1 : 0, memo);

  const created = row(db.prepare('SELECT * FROM event WHERE event_id = ?'), result.lastInsertRowid);
  res.status(201).json(created);
});

// PUT /api/events/:id  -> 일정 수정 (이름/시간/Top3/잠금 등)
app.put('/api/events/:id', (req, res) => {
  const { id } = req.params;
  const existing = row(db.prepare('SELECT * FROM event WHERE event_id = ?'), id);
  if (!existing) return res.status(404).json({ error: '해당 일정을 찾을 수 없어요.' });

  const merged = { ...existing, ...req.body };
  if (merged.end_time <= merged.start_time) {
    return res.status(400).json({ error: '종료 시각이 시작 시각보다 늦어야 해요.' });
  }

  db.prepare(`
    UPDATE event
    SET title = ?, date = ?, start_time = ?, end_time = ?, category_id = ?,
        routine_item_id = ?, event_type = ?, is_top3 = ?, is_completed = ?, is_locked = ?, memo = ?,
        updated_at = datetime('now')
    WHERE event_id = ?
  `).run(
    merged.title, merged.date, merged.start_time, merged.end_time, merged.category_id,
    merged.routine_item_id, merged.event_type, merged.is_top3 ? 1 : 0,
    merged.is_completed ? 1 : 0, merged.is_locked ? 1 : 0, merged.memo, id
  );

  const updated = row(db.prepare('SELECT * FROM event WHERE event_id = ?'), id);
  res.json(updated);
});

// DELETE /api/events/:id
app.delete('/api/events/:id', (req, res) => {
  const result = db.prepare('DELETE FROM event WHERE event_id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: '해당 일정을 찾을 수 없어요.' });
  res.status(204).send();
});

// ============================================
// CATEGORY (참고용 - 나중에 프론트에서 색상/아이콘 고를 때 사용)
// ============================================
app.get('/api/categories', (req, res) => {
  res.json(all(db.prepare('SELECT * FROM category ORDER BY sort_order ASC')));
});

app.post('/api/categories', (req, res) => {
  const { name, color = null, icon = null, sort_order = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'name은 필수예요.' });
  const result = db.prepare(
    'INSERT INTO category (name, color, icon, sort_order) VALUES (?, ?, ?, ?)'
  ).run(name, color, icon, sort_order);
  res.status(201).json(row(db.prepare('SELECT * FROM category WHERE category_id = ?'), result.lastInsertRowid));
});

// ============================================
// ROUTINES (설정 페이지 - 반복되는 일정을 폴더처럼 묶어서 저장)
// ============================================

// GET /api/routines -> 모든 루틴 + 각 루틴에 속한 아이템들을 함께 반환
app.get('/api/routines', (req, res) => {
  const routines = all(db.prepare('SELECT * FROM routine ORDER BY routine_id ASC'));
  const items = all(db.prepare('SELECT * FROM routine_item ORDER BY sort_order ASC, routine_item_id ASC'));
  const result = routines.map(r => ({
    ...r,
    items: items.filter(it => it.routine_id === r.routine_id)
  }));
  res.json(result);
});

// POST /api/routines -> 새 루틴(폴더) 생성
app.post('/api/routines', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name은 필수예요.' });
  const result = db.prepare('INSERT INTO routine (name) VALUES (?)').run(name);
  const created = row(db.prepare('SELECT * FROM routine WHERE routine_id = ?'), result.lastInsertRowid);
  res.status(201).json({ ...created, items: [] });
});

// PUT /api/routines/:id -> 루틴 이름 수정 / 켜고 끄기(is_active)
app.put('/api/routines/:id', (req, res) => {
  const { id } = req.params;
  const existing = row(db.prepare('SELECT * FROM routine WHERE routine_id = ?'), id);
  if (!existing) return res.status(404).json({ error: '해당 루틴을 찾을 수 없어요.' });

  const merged = { ...existing, ...req.body };
  db.prepare(`
    UPDATE routine SET name = ?, is_active = ?, updated_at = datetime('now')
    WHERE routine_id = ?
  `).run(merged.name, merged.is_active ? 1 : 0, id);

  res.json(row(db.prepare('SELECT * FROM routine WHERE routine_id = ?'), id));
});

// DELETE /api/routines/:id -> 루틴 삭제 (안의 아이템들도 같이 삭제됨)
app.delete('/api/routines/:id', (req, res) => {
  const result = db.prepare('DELETE FROM routine WHERE routine_id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: '해당 루틴을 찾을 수 없어요.' });
  res.status(204).send();
});

// POST /api/routines/:id/items -> 루틴 안에 일정 아이템 추가
app.post('/api/routines/:id/items', (req, res) => {
  const routineId = req.params.id;
  const routineExists = row(db.prepare('SELECT routine_id FROM routine WHERE routine_id = ?'), routineId);
  if (!routineExists) return res.status(404).json({ error: '해당 루틴을 찾을 수 없어요.' });

  const { name, preferred_time, duration, is_locked = 0, category_id = null } = req.body;
  if (!name || preferred_time == null || duration == null) {
    return res.status(400).json({ error: 'name, preferred_time, duration은 필수예요.' });
  }

  const result = db.prepare(`
    INSERT INTO routine_item (routine_id, name, preferred_time, duration, is_locked, category_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(routineId, name, preferred_time, duration, is_locked ? 1 : 0, category_id);

  res.status(201).json(row(db.prepare('SELECT * FROM routine_item WHERE routine_item_id = ?'), result.lastInsertRowid));
});

// PUT /api/routine-items/:id -> 아이템 수정
app.put('/api/routine-items/:id', (req, res) => {
  const { id } = req.params;
  const existing = row(db.prepare('SELECT * FROM routine_item WHERE routine_item_id = ?'), id);
  if (!existing) return res.status(404).json({ error: '해당 항목을 찾을 수 없어요.' });

  const merged = { ...existing, ...req.body };
  db.prepare(`
    UPDATE routine_item
    SET name = ?, preferred_time = ?, duration = ?, is_active = ?, is_locked = ?, category_id = ?
    WHERE routine_item_id = ?
  `).run(merged.name, merged.preferred_time, merged.duration, merged.is_active ? 1 : 0, merged.is_locked ? 1 : 0, merged.category_id ?? null, id);

  res.json(row(db.prepare('SELECT * FROM routine_item WHERE routine_item_id = ?'), id));
});

// DELETE /api/routine-items/:id
app.delete('/api/routine-items/:id', (req, res) => {
  const result = db.prepare('DELETE FROM routine_item WHERE routine_item_id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: '해당 항목을 찾을 수 없어요.' });
  res.status(204).send();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`타임플래너 API 서버 실행 중: http://localhost:${PORT}`);
});

module.exports = app;
