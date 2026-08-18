# 타임플래너 API 서버

## 요구사항
- **Node.js 22 이상** (내장 `node:sqlite` 사용, 별도 DB 설치 필요 없음)

## 실행 방법
```bash
cd server
npm install
npm start
```
`http://localhost:3000` 에서 실행됩니다. 첫 실행 시 같은 폴더에 `planner.db` 파일이 자동 생성돼요 (schema.sql 기준).

## 시간 표기법
모든 시간 값은 **하루 중 분(0~1439)** 정수입니다.
예: `07:30` → `450`, `19:00` → `1140`
(프론트의 `timeToMin` / `minToClock` 함수와 그대로 호환됩니다.)

## API 목록

### Day Settings (기상/취침 시각)
| Method | URL | 설명 |
|---|---|---|
| GET | `/api/day-settings/:date` | 특정 날짜 설정 조회 (`date`='YYYY-MM-DD') |
| PUT | `/api/day-settings/:date` | 설정 저장/수정 (upsert) |

PUT 요청 body 예시:
```json
{ "wake_up_time": 420, "sleep_time": 1380 }
```

### Events (할 일 / 일정)
| Method | URL | 설명 |
|---|---|---|
| GET | `/api/events?date=YYYY-MM-DD` | 그 날짜의 모든 일정 조회 |
| POST | `/api/events` | 일정 추가 |
| PUT | `/api/events/:id` | 일정 수정 |
| DELETE | `/api/events/:id` | 일정 삭제 |

POST 요청 body 예시:
```json
{
  "title": "아침 운동",
  "date": "2026-08-15",
  "start_time": 420,
  "end_time": 450,
  "is_top3": 1,
  "is_locked": 0
}
```

### Categories (참고용)
| Method | URL | 설명 |
|---|---|---|
| GET | `/api/categories` | 카테고리 목록 |
| POST | `/api/categories` | 카테고리 추가 |

## 다음 단계 (프론트엔드 연결)
지금 `common.js`의 `loadPlannerState()` / `savePlannerState()`가 `localStorage`를 쓰고 있어요.
이 두 함수를 위 API를 호출하는 `fetch()` 코드로 바꾸면 실제 DB와 연결됩니다.
(원하시면 이 부분도 이어서 만들어드릴게요.)
