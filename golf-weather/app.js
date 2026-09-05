import { COURSES } from "./courses.js";
import { foodCache, foodSectionHtml, ensureFoodState } from "./food.js";

const WMO = {
  0: "맑음", 1: "대체로 맑음", 2: "구름 조금", 3: "흐림",
  45: "안개", 48: "착빙 안개",
  51: "이슬비", 53: "이슬비", 55: "이슬비",
  61: "비", 63: "비", 65: "강한 비",
  71: "눈", 73: "눈", 75: "강한 눈",
  80: "소나기", 81: "소나기", 82: "강한 소나기",
  95: "뇌우", 96: "뇌우·우박", 99: "뇌우·우박"
};

const el = {
  q: document.getElementById("q"),
  region: document.getElementById("region"),
  refresh: document.getElementById("refresh"),
  status: document.getElementById("status"),
  grid: document.getElementById("grid"),
  detail: document.getElementById("detail")
};

/** @type {Map<string, object>} */
const cache = new Map();
let selectedId = null;
let loadSeq = 0;
let detailSeq = 0;

function windDir(deg) {
  const dirs = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
  return dirs[Math.round(((deg % 360) / 45)) % 8];
}

function weatherLabel(code) {
  return WMO[code] ?? `날씨코드 ${code}`;
}

function regions() {
  return [...new Set(COURSES.map(c => c.region.split(" ")[0]))].sort((a, b) => a.localeCompare(b, "ko"));
}

function filtered() {
  const q = el.q.value.trim().toLowerCase();
  const r = el.region.value;
  return COURSES.filter(c => {
    const okR = !r || c.region.includes(r);
    const okQ = !q || c.name.toLowerCase().includes(q) || c.region.toLowerCase().includes(q);
    return okR && okQ;
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Open-Meteo multi-location: one HTTP call for many courses (avoids 429).
 * Response is a single object when 1 point, or an array when multiple.
 */
async function fetchBatch(courses, attempt = 0) {
  if (!courses.length) return [];
  const params = new URLSearchParams({
    latitude: courses.map(c => c.lat).join(","),
    longitude: courses.map(c => c.lon).join(","),
    timezone: "Asia/Seoul",
    forecast_days: "3",
    current: [
      "temperature_2m", "relative_humidity_2m", "apparent_temperature",
      "precipitation", "weather_code", "wind_speed_10m", "wind_direction_10m"
    ].join(","),
    daily: [
      "weather_code", "temperature_2m_max", "temperature_2m_min",
      "precipitation_probability_max", "wind_speed_10m_max"
    ].join(",")
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  const res = await fetch(url);
  if (res.status === 429 && attempt < 4) {
    await sleep(800 * (attempt + 1));
    return fetchBatch(courses, attempt + 1);
  }
  if (!res.ok) throw new Error(`날씨 API 오류 (${res.status})`);
  const raw = await res.json();
  const list = Array.isArray(raw) ? raw : [raw];
  return courses.map((course, i) => {
    const data = list[i];
    if (!data?.current) throw new Error("날씨 응답 형식 오류");
    cache.set(course.id, data);
    return { course, data };
  });
}

async function ensureWeather(courses) {
  const missing = courses.filter(c => !cache.has(c.id));
  if (missing.length) {
    // Chunk to stay under URL length / provider comfort (~20 pts)
    const CHUNK = 20;
    for (let i = 0; i < missing.length; i += CHUNK) {
      await fetchBatch(missing.slice(i, i + CHUNK));
      if (i + CHUNK < missing.length) await sleep(200);
    }
  }
  return courses.map(course => ({ course, data: cache.get(course.id) }));
}

function cardHtml(course, data) {
  const c = data.current;
  return `
    <article class="card ${selectedId === course.id ? "active" : ""}" tabindex="0" data-id="${course.id}">
      <h2>${course.name}</h2>
      <div class="meta">${course.region}</div>
      <div class="temps">
        <span class="now">${Math.round(c.temperature_2m)}°</span>
        <span class="feel">체감 ${Math.round(c.apparent_temperature)}°</span>
      </div>
      <div class="row">
        <span class="pill">${weatherLabel(c.weather_code)}</span>
        <span class="pill wind">바람 ${Math.round(c.wind_speed_10m)} km/h ${windDir(c.wind_direction_10m)}</span>
        <span class="pill rain">강수 ${c.precipitation ?? 0} mm</span>
      </div>
    </article>`;
}

function detailHtml(course, data, foodState) {
  const days = data.daily.time.map((t, i) => {
    const d = new Date(t + "T12:00:00");
    const label = d.toLocaleDateString("ko-KR", { weekday: "short", month: "numeric", day: "numeric" });
    return `
      <div class="day">
        <div class="d">${label}</div>
        <div class="hl">${Math.round(data.daily.temperature_2m_max[i])}° / ${Math.round(data.daily.temperature_2m_min[i])}°</div>
        <div class="row" style="margin-top:8px">
          <span class="pill">${weatherLabel(data.daily.weather_code[i])}</span>
          <span class="pill rain">비 ${data.daily.precipitation_probability_max[i] ?? "-"}%</span>
          <span class="pill wind">바람 ${Math.round(data.daily.wind_speed_10m_max[i])} km/h</span>
        </div>
      </div>`;
  }).join("");
  return `
    <h3>${course.name} · 3일 예보</h3>
    <div class="days">${days}</div>
    ${foodSectionHtml(foodState)}
    <p class="note">데이터: Open-Meteo · 좌표·맛집: OpenStreetMap · ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} 기준</p>`;
}

async function showDetail(course) {
  const seq = ++detailSeq;
  selectedId = course.id;
  document.querySelectorAll(".card").forEach(n => n.classList.toggle("active", n.dataset.id === selectedId));
  try {
    const [{ data }] = await ensureWeather([course]);
    if (seq !== detailSeq) return;
    const cachedFood = foodCache.get(course.id);
    el.detail.hidden = false;
    el.detail.innerHTML = detailHtml(course, data, cachedFood || { status: "loading", items: [] });
    el.detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (!cachedFood) {
      const foodState = await ensureFoodState(course);
      if (seq !== detailSeq || selectedId !== course.id) return;
      el.detail.innerHTML = detailHtml(course, data, foodState);
    }
  } catch (e) {
    if (seq !== detailSeq) return;
    el.status.textContent = e.message || "상세 불러오기 실패";
    el.status.classList.add("error");
  }
}

async function loadAll() {
  const seq = ++loadSeq;
  const list = filtered();
  el.status.classList.remove("error");
  el.status.textContent = `날씨 불러오는 중… (${list.length}곳)`;
  el.refresh.disabled = true;
  try {
    const results = await ensureWeather(list);
    if (seq !== loadSeq) return;
    el.grid.innerHTML = results.map(({ course, data }) => cardHtml(course, data)).join("");
    el.status.textContent = `${results.length}개 골프장 날씨 · Open-Meteo`;
    if (selectedId) {
      const hit = results.find(r => r.course.id === selectedId);
      if (hit) {
        const foodState = foodCache.get(selectedId) || { status: "loading", items: [] };
        el.detail.hidden = false;
        el.detail.innerHTML = detailHtml(hit.course, hit.data, foodState);
      }
    }
  } catch (e) {
    if (seq !== loadSeq) return;
    el.status.textContent = e.message || "불러오기 실패";
    el.status.classList.add("error");
  } finally {
    if (seq === loadSeq) el.refresh.disabled = false;
  }
}

function bind() {
  el.region.innerHTML = `<option value="">전체 지역</option>` +
    regions().map(r => `<option value="${r}">${r}</option>`).join("");

  el.grid.addEventListener("click", (ev) => {
    const card = ev.target.closest(".card");
    if (!card) return;
    const course = COURSES.find(c => c.id === card.dataset.id);
    if (course) showDetail(course);
  });

  el.grid.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const card = ev.target.closest(".card");
    if (!card) return;
    ev.preventDefault();
    const course = COURSES.find(c => c.id === card.dataset.id);
    if (course) showDetail(course);
  });

  // Filter uses cache — do not clear (that caused repeat 429s)
  let t = null;
  el.q.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(loadAll, 200);
  });
  el.region.addEventListener("change", loadAll);
  el.refresh.addEventListener("click", () => {
    cache.clear();
    foodCache.clear();
    loadAll();
  });
}

bind();
loadAll();
