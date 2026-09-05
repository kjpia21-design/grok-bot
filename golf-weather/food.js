/** Nearby food via OpenStreetMap Overpass (no API key). */
const AMENITY_KO = {
  restaurant: "식당",
  cafe: "카페",
  fast_food: "패스트푸드",
  pub: "펍"
};

const FOOD_RADIUS_M = 3000;
const FOOD_LIMIT = 12;
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter"
];

/** @type {Map<string, { status: string, items: object[] }>} */
export const foodCache = new Map();

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function elementLatLon(el) {
  if (Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
    return { lat: el.lat, lon: el.lon };
  }
  if (el.center && Number.isFinite(el.center.lat) && Number.isFinite(el.center.lon)) {
    return { lat: el.center.lat, lon: el.center.lon };
  }
  return null;
}

function parseOverpassFood(elements, course) {
  const seen = new Set();
  const items = [];
  for (const el of elements) {
    const tags = el.tags || {};
    const name = (tags.name || tags["name:ko"] || "").trim();
    if (!name) continue;
    const pos = elementLatLon(el);
    if (!pos) continue;
    const amenity = tags.amenity || "";
    const key = `${name}|${pos.lat.toFixed(5)}|${pos.lon.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const distKm = haversineKm(course.lat, course.lon, pos.lat, pos.lon);
    if (distKm > FOOD_RADIUS_M / 1000 + 0.05) continue;
    const cuisine = (tags.cuisine || "").replace(/;/g, ", ");
    const typeLabel = [AMENITY_KO[amenity] || amenity, cuisine].filter(Boolean).join(" · ");
    const mapQ = encodeURIComponent(`${name} ${pos.lat},${pos.lon}`);
    items.push({
      name,
      distKm,
      typeLabel,
      mapUrl: `https://www.openstreetmap.org/search?query=${mapQ}`
    });
  }
  items.sort((a, b) => a.distKm - b.distKm);
  return items.slice(0, FOOD_LIMIT);
}

export async function fetchNearbyFood(course) {
  const query = `
[out:json][timeout:25];
(
  node["amenity"~"^(restaurant|cafe|fast_food|pub)$"](around:${FOOD_RADIUS_M},${course.lat},${course.lon});
  way["amenity"~"^(restaurant|cafe|fast_food|pub)$"](around:${FOOD_RADIUS_M},${course.lat},${course.lon});
);
out center tags 40;
`.trim();

  let lastErr = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: `data=${encodeURIComponent(query)}`
      });
      if (!res.ok) {
        lastErr = new Error(`Overpass ${res.status}`);
        continue;
      }
      const json = await res.json();
      return parseOverpassFood(json.elements || [], course);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("주변 맛집 조회 실패");
}

export async function ensureFoodState(course) {
  if (foodCache.has(course.id)) return foodCache.get(course.id);
  try {
    const items = await fetchNearbyFood(course);
    const state = { status: items.length ? "ok" : "empty", items };
    foodCache.set(course.id, state);
    return state;
  } catch {
    return { status: "error", items: [] };
  }
}

export function foodSectionHtml(foodState) {
  const state = foodState || { status: "loading", items: [] };
  let body = "";
  if (state.status === "loading") {
    body = `<p class="food-msg">불러오는 중…</p>`;
  } else if (state.status === "error") {
    body = `<p class="food-msg error">오류 · 주변 맛집을 불러오지 못했습니다</p>`;
  } else if (state.status === "empty" || !state.items?.length) {
    body = `<p class="food-msg">없음 · 약 3km 내 등록된 맛집이 없습니다</p>`;
  } else {
    body = `<ul class="food-list">${state.items.map(item => `
      <li>
        <div class="food-main">
          <span class="food-name">${item.name}</span>
          <span class="food-dist">${item.distKm < 1 ? `${Math.round(item.distKm * 1000)} m` : `${item.distKm.toFixed(1)} km`}</span>
        </div>
        <div class="food-meta">
          ${item.typeLabel ? `<span class="pill">${item.typeLabel}</span>` : ""}
          <a class="food-link" href="${item.mapUrl}" target="_blank" rel="noopener noreferrer">지도</a>
        </div>
      </li>`).join("")}</ul>`;
  }
  return `
    <div class="food">
      <h4>주변 맛집 <span class="food-hint">약 3km · OpenStreetMap</span></h4>
      ${body}
    </div>`;
}
