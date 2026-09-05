# 주요 골프장 날씨

한국 주요 골프장의 현재 날씨, 3일 예보, 그리고 코스 선택 시 주변 맛집을 보여주는 정적 웹앱입니다.

## 실행

로컬에서 정적 서버로 열면 됩니다. (`file://`로는 ES 모듈이 막힐 수 있습니다.)

```bash
cd golf-weather
python3 -m http.server 5173
```

브라우저에서 `http://localhost:5173` 을 엽니다.

## 데이터

- 골프장 좌표: OpenStreetMap `leisure=golf_course`
- 날씨: [Open-Meteo](https://open-meteo.com/) (API 키 없음)
- 주변 맛집: OpenStreetMap Overpass (`amenity=restaurant|cafe|fast_food|pub`, 약 3km) — 코스 클릭 시에만 조회·캐시

## 포함 골프장

`courses.js`에 한국 주요 코스가 들어 있으며, 추가·수정할 수 있습니다.
