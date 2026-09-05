# 주요 골프장 날씨

한국 주요 골프장의 현재 날씨와 3일 예보를 보여주는 정적 웹앱입니다.

## 실행

로컬에서 정적 서버로 열면 됩니다. (`file://`로는 ES 모듈이 막힐 수 있습니다.)

```bash
cd golf-weather
python3 -m http.server 5173
```

브라우저에서 `http://localhost:5173` 을 엽니다.

## 배포

`main`에 `golf-weather/` 변경이 푸시되면 GitHub Actions(`.github/workflows/pages.yml`)가 Pages로 배포합니다.
저장소 Settings → Pages → Source를 **GitHub Actions**로 두면 됩니다.
배포 URL은 보통 `https://kjpia21-design.github.io/grok-bot/` 입니다. (private 저장소는 플랜에 따라 Pages가 제한될 수 있습니다.)

## 데이터

- 골프장 좌표: OpenStreetMap `leisure=golf_course`
- 날씨: [Open-Meteo](https://open-meteo.com/) (API 키 없음)

## 포함 골프장

수도권·제주 중심의 잘 알려진 코스 약 28곳입니다. `courses.js`에서 추가·수정할 수 있습니다.
