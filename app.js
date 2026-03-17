const state = {
  indexObj: null,
  indexPathHint: "",
  indexBaseUrl: "",
  bundle: null,
  hitIds: new Set(),
  lastQuery: "",
  lastResults: [],
  filters: {
    shot_size: "",
    camera_movement: "",
    defect: "all",
  },
  assetUrls: new Map(),
  assetSuffixUrls: [],
  ownedObjectUrls: [],
  assetObjectUrls: [],
  playerMode: "none", // none | html5 | embed
  embedKind: "",
  embedBaseUrl: "",
  ui: {
    indexReady: false,
    videoReady: false,
    sourcePanelCollapsed: false,
  },
};

const statusLine = document.getElementById("statusLine");
const videoSourceInfo = document.getElementById("videoSourceInfo");
const videoActionBar = document.getElementById("videoActionBar");
const metaLine = document.getElementById("metaLine");
const player = document.getElementById("player");
const embedPlayer = document.getElementById("embedPlayer");
const segmentList = document.getElementById("segmentList");
const globalKeywordList = document.getElementById("globalKeywordList");
const resultList = document.getElementById("resultList");
const searchInfo = document.getElementById("searchInfo");
const searchDebug = document.getElementById("searchDebug");
const queryInput = document.getElementById("queryInput");
const shotSizeFilter = document.getElementById("shotSizeFilter");
const cameraMovementFilter = document.getElementById("cameraMovementFilter");
const defectFilter = document.getElementById("defectFilter");
const filterInfo = document.getElementById("filterInfo");
const sourcePanel = document.querySelector(".source-panel");
const sourceQuickState = document.getElementById("sourceQuickState");
const toggleSourcePanelBtn = document.getElementById("toggleSourcePanelBtn");
const dataSourceBlock = document.getElementById("dataSourceBlock");
const videoSourceBlock = document.getElementById("videoSourceBlock");
const toggleDataSourceBtn = document.getElementById("toggleDataSourceBtn");
const toggleVideoSourceBtn = document.getElementById("toggleVideoSourceBtn");

const DEFAULT_SHOT_SIZE_OPTIONS = [
  "大特写 | extreme close-up",
  "特写 | close-up",
  "近景 | medium close-up",
  "中景 | medium shot",
  "中远景 | medium long shot",
  "全景 | full shot",
  "远景 | long shot",
  "大远景 | extreme long shot",
  "未知 | unknown",
];

const DEFAULT_CAMERA_MOVEMENT_OPTIONS = [
  "固定镜头 | static",
  "平移 | pan",
  "俯仰 | tilt",
  "推镜 | dolly in",
  "拉镜 | dolly out",
  "跟拍 | tracking shot",
  "变焦 | zoom",
  "手持 | handheld",
  "旋转 | roll",
  "航拍移动 | aerial move",
  "未知 | unknown",
];

function setStatus(text) {
  statusLine.textContent = String(text || "");
}

function setBlockCollapsed(blockEl, btnEl, collapsed) {
  if (!blockEl) return;
  blockEl.classList.toggle("collapsed", Boolean(collapsed));
  if (btnEl) {
    btnEl.textContent = collapsed ? "展开" : "收起";
  }
}

function setSourcePanelCollapsed(collapsed) {
  const next = Boolean(collapsed);
  state.ui.sourcePanelCollapsed = next;
  if (sourcePanel) {
    sourcePanel.classList.toggle("collapsed", next);
  }
  if (toggleSourcePanelBtn) {
    toggleSourcePanelBtn.textContent = next ? "展开面板" : "收起面板";
  }
}

function updateSourceQuickState() {
  if (!sourceQuickState) return;
  const dataText = state.ui.indexReady ? "数据源：已加载" : "数据源：未加载";
  const videoText = state.ui.videoReady ? "视频源：已设置" : "视频源：未设置";
  sourceQuickState.textContent = `${dataText} ｜ ${videoText}`;
}

function markIndexReady(ready) {
  state.ui.indexReady = Boolean(ready);
  updateSourceQuickState();
  if (state.ui.indexReady && state.ui.videoReady) {
    setSourcePanelCollapsed(true);
  }
}

function markVideoReady(ready) {
  state.ui.videoReady = Boolean(ready);
  updateSourceQuickState();
  if (state.ui.indexReady && state.ui.videoReady) {
    setSourcePanelCollapsed(true);
  }
}

function escapeHtml(v) {
  return String(v || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtSec(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "--:--";
  const s = Math.max(0, Math.floor(Number(v)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function registerObjectUrl(url) {
  if (!url) return;
  state.ownedObjectUrls.push(url);
}

function registerAssetObjectUrl(url) {
  if (!url) return;
  state.assetObjectUrls.push(url);
}

function clearAssetObjectUrls() {
  for (const url of state.assetObjectUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch (_) {
      // ignore
    }
  }
  state.assetObjectUrls = [];
}

function switchPlayer(mode) {
  state.playerMode = mode;
  if (mode === "html5") {
    player.classList.add("active");
    embedPlayer.classList.remove("active");
    embedPlayer.removeAttribute("src");
    return;
  }
  if (mode === "embed") {
    player.pause();
    player.removeAttribute("src");
    player.classList.remove("active");
    embedPlayer.classList.add("active");
    return;
  }
  player.pause();
  player.removeAttribute("src");
  embedPlayer.removeAttribute("src");
  player.classList.remove("active");
  embedPlayer.classList.remove("active");
}

function normalizePath(s) {
  return String(s || "").replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();
}

function clearVideoAction() {
  videoActionBar.innerHTML = "";
  videoActionBar.style.display = "none";
}

function setVideoActionLink(url, label) {
  clearVideoAction();
  if (!url) return;
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label || "在新标签页打开视频";
  videoActionBar.appendChild(link);
  videoActionBar.style.display = "block";
}

function setHtml5VideoSource(url, hint) {
  switchPlayer("html5");
  player.src = url;
  player.load();
  state.embedKind = "";
  state.embedBaseUrl = "";
  clearVideoAction();
  videoSourceInfo.textContent = hint || "使用 HTML5 视频源";
  markVideoReady(true);
}

function setEmbedSource(embedUrl, kind, hint) {
  switchPlayer("embed");
  embedPlayer.src = embedUrl;
  state.embedKind = kind || "generic";
  state.embedBaseUrl = embedUrl;
  clearVideoAction();
  videoSourceInfo.textContent = hint || "使用嵌入播放器";
  markVideoReady(true);
}

function setExternalOnlySource(url, platformName) {
  switchPlayer("none");
  state.embedKind = "external_only";
  state.embedBaseUrl = url;
  const pname = platformName || "该平台";
  videoSourceInfo.textContent = `${pname}限制外站 iframe，无法在当前页面内嵌播放`;
  setVideoActionLink(url, `在新标签页打开${pname}视频`);
  markVideoReady(true);
}

function parseYoutubeId(raw) {
  try {
    const u = new URL(raw);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.split("/").filter(Boolean)[0] || "";
    }
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v") || "";
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" && parts[1]) return parts[1];
      if (parts[0] === "embed" && parts[1]) return parts[1];
    }
  } catch (_) {
    return "";
  }
  return "";
}

function parseBilibiliId(raw) {
  const txt = String(raw || "");
  const bvMatch = txt.match(/BV[0-9A-Za-z]{10}/);
  if (bvMatch) return { type: "bvid", value: bvMatch[0] };
  const avMatch = txt.match(/(?:\/av|aid=)(\d{4,})/i);
  if (avMatch) return { type: "aid", value: avMatch[1] };
  return null;
}

function detectPlatform(rawUrl) {
  const raw = String(rawUrl || "").trim();
  if (!raw) return { kind: "none" };
  let parsedUrl = null;

  const lower = raw.toLowerCase();
  if (/\.(mp4|webm|m4v|mov|mkv)(\?|#|$)/i.test(raw)) {
    return { kind: "direct", url: raw };
  }

  const ytId = parseYoutubeId(raw);
  if (ytId) {
    return { kind: "youtube", embedUrl: `https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1` };
  }

  const bili = parseBilibiliId(raw);
  if (bili) {
    if (bili.type === "bvid") {
      return { kind: "bilibili", embedUrl: `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bili.value)}&page=1` };
    }
    return { kind: "bilibili", embedUrl: `https://player.bilibili.com/player.html?aid=${encodeURIComponent(bili.value)}&page=1` };
  }

  try {
    parsedUrl = new URL(raw);
  } catch (_) {
    parsedUrl = null;
  }

  if (parsedUrl && /(^|\.)douyin\.com$/i.test(parsedUrl.hostname)) {
    return { kind: "external_only", platform: "抖音", url: raw };
  }

  if (parsedUrl && /(^|\.)kuaishou\.com$/i.test(parsedUrl.hostname)) {
    return { kind: "external_only", platform: "快手", url: raw };
  }

  if (/youtube|youtu\.be|bilibili|douyin|kuaishou/i.test(lower)) {
    return { kind: "embed", embedUrl: raw };
  }

  return { kind: "direct", url: raw };
}

function useVideoUrl(rawUrl) {
  const parsed = detectPlatform(rawUrl);
  if (parsed.kind === "none") {
    videoSourceInfo.textContent = "请输入有效视频链接";
    return;
  }

  if (parsed.kind === "direct") {
    setHtml5VideoSource(parsed.url, `视频链接：${parsed.url}`);
    return;
  }

  if (parsed.kind === "external_only") {
    setExternalOnlySource(parsed.url, parsed.platform);
    return;
  }

  const note = `${parsed.kind.toUpperCase()} 嵌入播放（若站点禁止 iframe，请点链接在新标签页打开）`;
  setEmbedSource(parsed.embedUrl, parsed.kind, `${note}：${parsed.embedUrl}`);
}

function seek(sec) {
  const target = Math.max(0, Number(sec) || 0);
  if (state.playerMode === "html5") {
    if (!player.src) return;
    player.currentTime = target;
    player.play().catch(() => {});
    return;
  }

  if (state.playerMode === "embed") {
    if (!state.embedBaseUrl) return;
    if (state.embedKind === "youtube") {
      const u = new URL(state.embedBaseUrl);
      u.searchParams.set("start", String(Math.floor(target)));
      embedPlayer.src = u.toString();
      searchInfo.textContent = `YouTube 嵌入跳转到 ${fmtSec(target)}`;
      return;
    }
    if (state.embedKind === "bilibili") {
      const u = new URL(state.embedBaseUrl);
      u.searchParams.set("t", String(Math.floor(target)));
      embedPlayer.src = u.toString();
      searchInfo.textContent = `B站嵌入尝试跳转到 ${fmtSec(target)}`;
      return;
    }
    searchInfo.textContent = "当前为网页嵌入模式，精确 seek 可能受平台限制";
  }
}

function normalizeQueryText(text) {
  let s = String(text || "").toLowerCase().trim();
  if (!s) return "";
  s = s.replaceAll("\u3000", " ");
  s = s.replace(/[\|\uFF5C/,，、;；:：]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function extractTerms(q) {
  const nq = normalizeQueryText(q);
  const terms = nq.match(/[A-Za-z0-9_]+|[\u4e00-\u9fff]+/g) || [];
  return terms.filter(Boolean);
}

function expandTerms(terms) {
  const synonymMap = {
    "手机": ["smartphone", "phone", "mobile", "cellphone"],
    "电话": ["phone", "call", "calling", "talking on phone"],
    "智能手机": ["smartphone", "phone", "mobile"],
    "phone": ["smartphone", "mobile", "cellphone", "电话", "手机"],
    "smartphone": ["phone", "mobile", "cellphone", "手机"],
    "mobile": ["phone", "smartphone", "手机"],
    "字幕": ["subtitle", "subtitles", "caption", "captions", "台词", "歌词"],
    "日文字幕": ["japanese subtitle", "japanese subtitles", "日语字幕"],
    "subtitle": ["subtitles", "caption", "captions", "字幕"],
    "subtitles": ["subtitle", "caption", "captions", "字幕"],
    "caption": ["captions", "subtitle", "subtitles", "字幕"],
    "captions": ["caption", "subtitle", "subtitles", "字幕"],
    "动画": ["animation", "animated", "anime"],
    "animation": ["animated", "anime", "动画"],
    "anime": ["animation", "animated", "动画"],
    "狼": ["wolf"],
    "wolf": ["狼"],
    "兔子": ["rabbit"],
    "rabbit": ["兔子"],
  };

  const out = [];
  const seen = new Set();
  for (const t of terms) {
    if (!seen.has(t)) {
      out.push(t);
      seen.add(t);
    }
    for (const st of synonymMap[t] || []) {
      if (!seen.has(st)) {
        out.push(st);
        seen.add(st);
      }
    }
  }
  return out;
}

function listify(v) {
  if (Array.isArray(v)) return v.map((x) => String(x || "").trim()).filter(Boolean);
  const s = String(v || "").trim();
  return s ? [s] : [];
}

function dedupStrings(items) {
  const out = [];
  const seen = new Set();
  for (const item of items || []) {
    const key = String(item || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function setupTaxonomyFilters() {
  if (!shotSizeFilter || !cameraMovementFilter || !defectFilter) return;

  const tax = (state.bundle && state.bundle.taxonomies) || {};
  const segs = (state.bundle && state.bundle.segments) || [];

  const shotTax = dedupStrings(listify(tax.shot_size));
  const moveTax = dedupStrings(listify(tax.camera_movements));
  const observedShots = dedupStrings(segs.map((s) => s.shot_size));
  const observedMoves = dedupStrings(segs.flatMap((s) => listify(s.camera_movements)));

  const shotOptions = dedupStrings([
    ...(shotTax.length ? shotTax : DEFAULT_SHOT_SIZE_OPTIONS),
    ...observedShots,
  ]);
  const movementOptions = dedupStrings([
    ...(moveTax.length ? moveTax : DEFAULT_CAMERA_MOVEMENT_OPTIONS),
    ...observedMoves,
  ]);

  shotSizeFilter.innerHTML = "";
  cameraMovementFilter.innerHTML = "";

  const shotAll = document.createElement("option");
  shotAll.value = "";
  shotAll.textContent = "镜头景别：全部";
  shotSizeFilter.appendChild(shotAll);
  for (const opt of shotOptions) {
    const el = document.createElement("option");
    el.value = opt;
    el.textContent = opt;
    shotSizeFilter.appendChild(el);
  }

  const moveAll = document.createElement("option");
  moveAll.value = "";
  moveAll.textContent = "镜头运动：全部";
  cameraMovementFilter.appendChild(moveAll);
  for (const opt of movementOptions) {
    const el = document.createElement("option");
    el.value = opt;
    el.textContent = opt;
    cameraMovementFilter.appendChild(el);
  }

  shotSizeFilter.value = state.filters.shot_size || "";
  cameraMovementFilter.value = state.filters.camera_movement || "";
  defectFilter.value = state.filters.defect || "all";
}

function passFilters(seg) {
  const shotFilter = state.filters.shot_size || "";
  const moveFilter = state.filters.camera_movement || "";
  const defectFilterMode = state.filters.defect || "all";
  if (shotFilter && String(seg.shot_size || "").trim() !== shotFilter) return false;
  if (moveFilter && !listify(seg.camera_movements).includes(moveFilter)) return false;
  const defect = seg.defect || {};
  const hasDefect = Boolean(defect.has_defect);
  if (defectFilterMode === "has_defect" && !hasDefect) return false;
  if (defectFilterMode === "no_defect" && hasDefect) return false;
  return true;
}

function formatDefect(seg) {
  const defect = seg && seg.defect ? seg.defect : {};
  const hasDefect = Boolean(defect.has_defect);
  const defectTypes = listify(defect.defect_types);
  if (!hasDefect) return { text: "无缺陷", className: "defect-ok" };
  return {
    text: `存在缺陷${defectTypes.length ? `：${defectTypes.join(" / ")}` : ""}`,
    className: "defect-bad",
  };
}

function normalizeSoundEvents(events) {
  const rows = Array.isArray(events) ? events : [];
  const out = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const eventType = String(item.event_type || item.type || "").trim();
    if (!eventType) continue;
    const gs = Number(item.global_start_s ?? item.start_s ?? 0);
    const ge = Number(item.global_end_s ?? item.end_s ?? gs);
    const conf = Number(item.confidence ?? 0);
    out.push({
      event_type: eventType,
      global_start_s: Number.isFinite(gs) ? gs : 0,
      global_end_s: Number.isFinite(ge) ? ge : (Number.isFinite(gs) ? gs : 0),
      confidence: Number.isFinite(conf) ? conf : 0,
    });
  }
  out.sort((a, b) => (a.global_start_s - b.global_start_s) || String(a.event_type).localeCompare(String(b.event_type)));
  return out;
}

function segmentText(seg) {
  const parts = [];
  for (const key of ["summary", "asr_text", "asr_text_zh", "asr_text_bilingual", "asr_detected_language", "asr_language_to_zh"]) {
    const val = seg[key];
    if (typeof val === "string") parts.push(val);
  }
  for (const key of ["events", "objects", "actions", "scene_tags", "scene", "subjects", "camera_movements", "emotion_tags", "tokens"]) {
    parts.push(...listify(seg[key]));
  }
  const shotSize = seg.shot_size;
  if (typeof shotSize === "string" && shotSize.trim()) {
    parts.push(shotSize);
  }
  const defect = seg.defect;
  if (defect && typeof defect === "object") {
    if (defect.has_defect) {
      parts.push("has_defect");
    }
    parts.push(...listify(defect.defect_types));
  }
  parts.push(Boolean(seg.audio_has_music) ? "有音乐" : "无音乐");
  parts.push(String(seg.audio_music_ratio || ""));
  const soundEvents = seg.sound_events;
  if (Array.isArray(soundEvents)) {
    for (const ev of soundEvents) {
      if (ev && typeof ev === "object") {
        parts.push(String(ev.event_type || ""));
      } else {
        parts.push(String(ev || ""));
      }
    }
  }
  return parts.join("\n").toLowerCase();
}

function getHighlightMetaForSegment(seg, bundleSegmentsById) {
  const segId = String((seg && seg.segment_id) || "").trim();
  const bundleSeg = segId && bundleSegmentsById instanceof Map ? bundleSegmentsById.get(segId) : null;
  const source = bundleSeg || seg || {};
  const highlightWindows = Array.isArray(source.highlight_windows) ? source.highlight_windows : [];
  const primaryHighlight = source.primary_highlight && typeof source.primary_highlight === "object" ? source.primary_highlight : null;
  return {
    highlight_windows: highlightWindows,
    primary_highlight: primaryHighlight,
    highlight_count: Number(source.highlight_count || highlightWindows.length || 0),
  };
}

function searchSegments(indexObj, query, topK) {
  const q = String(query || "").trim().toLowerCase();
  const qNorm = normalizeQueryText(q);
  if (!q) {
    return { results: [], normalizedQuery: qNorm, terms: [] };
  }

  let terms = extractTerms(q);
  if (!terms.length) terms = [qNorm || q];
  terms = expandTerms(terms);

  const bundleSegmentsById = new Map(
    (((state.bundle && state.bundle.segments) || []).map((item) => [String((item && item.segment_id) || "").trim(), item]))
  );
  const out = [];
  for (const seg of indexObj.segments || []) {
    const highlightMeta = getHighlightMetaForSegment(seg, bundleSegmentsById);
    const text = segmentText(seg);
    const textNorm = normalizeQueryText(text);

    let score = 0;
    if (q && text.includes(q)) score += 3;
    if (qNorm && textNorm.includes(qNorm)) score += 2;

    let hits = 0;
    for (const t of terms) {
      if ((t && text.includes(t)) || (t && textNorm.includes(t))) {
        score += 1;
        hits += 1;
      }
    }
    if (terms.length && hits === terms.length) score += 1;

    if (score > 0) {
      out.push({
        segment_id: seg.segment_id,
        chunk_id: seg.chunk_id,
        global_start_s: seg.global_start_s,
        global_end_s: seg.global_end_s,
        summary: seg.summary || "",
        events: listify(seg.events),
        objects: listify(seg.objects),
        actions: listify(seg.actions),
        scene_tags: listify(seg.scene_tags),
        scene: listify(seg.scene || seg.scene_tags),
        subjects: listify(seg.subjects || seg.objects),
        shot_size: seg.shot_size || "未知 | unknown",
        camera_movements: listify(seg.camera_movements || ["未知 | unknown"]),
        emotion_tags: listify(seg.emotion_tags),
        defect: seg.defect || { has_defect: false, defect_types: [] },
        asr_text: seg.asr_text || "",
        asr_text_zh: seg.asr_text_zh || "",
        asr_text_bilingual: seg.asr_text_bilingual || "",
        asr_detected_language: seg.asr_detected_language || "unknown",
        asr_language_to_zh: seg.asr_language_to_zh || "",
        audio_music_ratio: seg.audio_music_ratio || 0,
        audio_has_music: Boolean(seg.audio_has_music),
        sound_events: seg.sound_events || [],
        score: Number(score.toFixed(4)),
        hit_type: "segment",
        matched_keyword: "",
        evidence_times_s: [],
        highlight_windows: highlightMeta.highlight_windows,
        primary_highlight: highlightMeta.primary_highlight,
        highlight_count: highlightMeta.highlight_count,
      });
    }

    for (const kw of seg.keyword_timeline || []) {
      const keyword = String(kw.keyword || "").trim().toLowerCase();
      if (!keyword) continue;
      const keywordNorm = normalizeQueryText(keyword);
      let kwScore = 0;

      if (q && keyword.includes(q)) kwScore += 6;
      if (qNorm && keywordNorm.includes(qNorm)) kwScore += 4;

      let termHits = 0;
      for (const t of terms) {
        if ((t && keyword.includes(t)) || (t && keywordNorm.includes(t))) {
          kwScore += 2;
          termHits += 1;
        }
      }
      if (terms.length && termHits === terms.length) kwScore += 1;
      if (kwScore <= 0) continue;

      out.push({
        segment_id: seg.segment_id,
        chunk_id: seg.chunk_id,
        global_start_s: kw.global_start_s ?? seg.global_start_s,
        global_end_s: kw.global_end_s ?? seg.global_end_s,
        summary: seg.summary || "",
        events: listify(seg.events),
        objects: listify(seg.objects),
        actions: listify(seg.actions),
        scene_tags: listify(seg.scene_tags),
        scene: listify(seg.scene || seg.scene_tags),
        subjects: listify(seg.subjects || seg.objects),
        shot_size: seg.shot_size || "未知 | unknown",
        camera_movements: listify(seg.camera_movements || ["未知 | unknown"]),
        emotion_tags: listify(seg.emotion_tags),
        defect: seg.defect || { has_defect: false, defect_types: [] },
        asr_text: seg.asr_text || "",
        asr_text_zh: seg.asr_text_zh || "",
        asr_text_bilingual: seg.asr_text_bilingual || "",
        asr_detected_language: seg.asr_detected_language || "unknown",
        asr_language_to_zh: seg.asr_language_to_zh || "",
        audio_music_ratio: seg.audio_music_ratio || 0,
        audio_has_music: Boolean(seg.audio_has_music),
        sound_events: seg.sound_events || [],
        score: Number(kwScore.toFixed(4)),
        hit_type: "keyword_timeline",
        matched_keyword: kw.keyword || "",
        evidence_times_s: kw.evidence_times_s || [],
        highlight_windows: highlightMeta.highlight_windows,
        primary_highlight: highlightMeta.primary_highlight,
        highlight_count: highlightMeta.highlight_count,
      });
    }
  }

  out.sort((a, b) => {
    const ds = Number(b.score || 0) - Number(a.score || 0);
    if (ds !== 0) return ds;
    return Number(a.global_start_s || 0) - Number(b.global_start_s || 0);
  });

  const clamped = Math.max(1, Math.min(Number(topK) || 30, 200));
  return {
    results: out.slice(0, clamped),
    normalizedQuery: qNorm,
    terms,
  };
}

function updateSearchDebug(msg) {
  searchDebug.textContent = String(msg || "");
}

function triggerQuery(qv) {
  queryInput.value = String(qv || "").trim();
  if (!queryInput.value) return;
  doSearch();
}

function resolveAssetUrl(fp) {
  const raw = String(fp || "").trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) return raw;

  const normRaw = normalizePath(raw);
  const direct = state.assetUrls.get(normRaw);
  if (direct) return direct;

  for (const item of state.assetSuffixUrls) {
    if (normRaw.endsWith(item.suffix)) return item.url;
  }

  if (state.indexBaseUrl) {
    try {
      return new URL(raw, state.indexBaseUrl).toString();
    } catch (_) {
      return "";
    }
  }

  return "";
}

function resolveFrameUrl(fp) {
  return resolveAssetUrl(fp);
}

function resolveMetaVideoPath(video) {
  const candidates = [];
  const path = String((video && video.path) || "").trim();
  const videoId = String((video && video.video_id) || "").trim();

  if (path) candidates.push(path);
  if (videoId) {
    for (const ext of [".mp4", ".mov", ".mkv", ".webm", ".m4v"]) {
      candidates.push(`${videoId}${ext}`);
    }
  }

  for (const cand of candidates) {
    const norm = normalizePath(cand);
    const d = state.assetUrls.get(norm);
    if (d) return d;
    for (const item of state.assetSuffixUrls) {
      if (norm.endsWith(item.suffix)) return item.url;
    }
    if (state.indexBaseUrl) {
      try {
        const asUrl = new URL(cand, state.indexBaseUrl).toString();
        return asUrl;
      } catch (_) {
        // ignore
      }
    }
  }

  return "";
}

function getHighlightFallbackVideoUrl() {
  if (state.playerMode === "html5") {
    return String(player.currentSrc || player.src || "").trim();
  }
  if (state.bundle && state.bundle.video) {
    return String(resolveMetaVideoPath(state.bundle.video) || "").trim();
  }
  return "";
}

function resolveHighlightPreviewSource(item) {
  if (!item || typeof item !== "object") return null;

  const clipUrl = String(item.clip_url || "").trim();
  const duration = Math.max(
    0.1,
    Number(item.duration_s || (Number(item.global_end_s || 0) - Number(item.global_start_s || 0)) || 0)
  );

  if (clipUrl) {
    return {
      url: clipUrl,
      trimStart: 0,
      trimEnd: duration,
      sourceLabel: "高光 clip",
      windowed: false,
    };
  }

  const fallbackUrl = getHighlightFallbackVideoUrl();
  if (!fallbackUrl) return null;

  return {
    url: fallbackUrl,
    trimStart: Math.max(0, Number(item.global_start_s || 0)),
    trimEnd: Math.max(0.1, Number(item.global_end_s || item.global_start_s || 0)),
    sourceLabel: "主视频裁切预览",
    windowed: true,
  };
}

function bindHighlightPreview(videoEl, preview) {
  if (!videoEl || !preview || !preview.url) return;

  const trimStart = Math.max(0, Number(preview.trimStart) || 0);
  const rawTrimEnd = Number(preview.trimEnd);
  const trimEnd = Number.isFinite(rawTrimEnd) ? Math.max(trimStart + 0.05, rawTrimEnd) : trimStart + 3;

  videoEl.src = preview.url;
  videoEl.preload = "metadata";
  videoEl.autoplay = true;
  videoEl.defaultMuted = true;
  videoEl.muted = true;
  videoEl.loop = !preview.windowed;
  videoEl.playsInline = true;
  videoEl.setAttribute("autoplay", "");
  videoEl.setAttribute("muted", "");
  videoEl.setAttribute("playsinline", "");

  if (!preview.windowed) {
    const playClip = () => {
      const task = videoEl.play();
      if (task && typeof task.catch === "function") task.catch(() => {});
    };
    videoEl.addEventListener("loadedmetadata", playClip);
    return;
  }

  const syncWindow = () => {
    const mediaDuration = Number.isFinite(videoEl.duration) ? videoEl.duration : trimEnd;
    const effectiveEnd = Math.max(trimStart + 0.05, Math.min(trimEnd, mediaDuration));
    videoEl.dataset.trimStart = String(trimStart);
    videoEl.dataset.trimEnd = String(effectiveEnd);
    if (videoEl.currentTime < trimStart || videoEl.currentTime > effectiveEnd) {
      videoEl.currentTime = trimStart;
    }
    const task = videoEl.play();
    if (task && typeof task.catch === "function") task.catch(() => {});
  };

  videoEl.addEventListener("loadedmetadata", syncWindow);
  videoEl.addEventListener("canplay", syncWindow);
  videoEl.addEventListener("timeupdate", () => {
    const start = Number(videoEl.dataset.trimStart || trimStart);
    const end = Number(videoEl.dataset.trimEnd || trimEnd);
    if (videoEl.currentTime >= end - 0.04) {
      videoEl.currentTime = start;
      if (videoEl.paused) {
        const task = videoEl.play();
        if (task && typeof task.catch === "function") task.catch(() => {});
      }
    }
  });
  videoEl.addEventListener("ended", () => {
    videoEl.currentTime = trimStart;
    const task = videoEl.play();
    if (task && typeof task.catch === "function") task.catch(() => {});
  });
}

function normalizeHighlightWindow(row, seg, fallbackProvider) {
  if (!row || typeof row !== "object") return null;
  const segGlobalStart = Number((seg && seg.global_start_s) || 0);
  const globalStart = Number(row.global_start_s ?? row.start_s ?? segGlobalStart);
  const globalEnd = Number(row.global_end_s ?? row.end_s ?? globalStart);
  const localStart = Number.isFinite(Number(row.local_start_s))
    ? Number(row.local_start_s)
    : Math.max(0, globalStart - segGlobalStart);
  const localEnd = Number.isFinite(Number(row.local_end_s))
    ? Number(row.local_end_s)
    : Math.max(localStart, globalEnd - segGlobalStart);
  const clipPath = String(row.clip_path || row.clip_url || "").trim();
  return {
    ...row,
    provider: String(row.provider || fallbackProvider || "").trim(),
    clip_path: clipPath,
    clip_url: resolveAssetUrl(clipPath),
    global_start_s: globalStart,
    global_end_s: globalEnd,
    start_s: globalStart,
    end_s: globalEnd,
    local_start_s: localStart,
    local_end_s: localEnd,
    duration_s: Math.max(0, Number((globalEnd - globalStart).toFixed(3))),
    title: String(row.title || "").trim(),
    reason: String(row.reason || "").trim(),
    tags: listify(row.tags),
    score: Math.max(0, Math.min(1, Number(row.score || 0))),
  };
}

function buildKeywordIndex(indexObj) {
  if (Array.isArray(indexObj.keyword_index) && indexObj.keyword_index.length) {
    return indexObj.keyword_index;
  }

  const map = new Map();
  for (const seg of indexObj.segments || []) {
    for (const item of seg.keyword_timeline || []) {
      const kw = String(item.keyword || "").trim();
      if (!kw) continue;
      if (!map.has(kw)) map.set(kw, []);
      map.get(kw).push({
        global_start_s: item.global_start_s ?? seg.global_start_s ?? 0,
        global_end_s: item.global_end_s ?? seg.global_end_s ?? 0,
      });
    }
  }

  return Array.from(map.entries()).map(([keyword, occurrences]) => ({ keyword, occurrences }));
}

function buildBundle(indexObj) {
  const video = indexObj.video || {};
  const taxonomies = (indexObj && typeof indexObj.taxonomies === "object" && indexObj.taxonomies) || {};
  const modelHighlights =
    (indexObj && typeof indexObj.model_highlights === "object" && indexObj.model_highlights) || {};
  const fallbackProvider = String(modelHighlights.provider || "").trim();
  const topWindowsBySegment = new Map();
  const normalizedModelWindows = [];
  for (const row of modelHighlights.windows || []) {
    const item = normalizeHighlightWindow(row, null, fallbackProvider);
    if (!item) continue;
    normalizedModelWindows.push(item);
    const segId = String(item.segment_id || "").trim();
    if (!segId) continue;
    if (!topWindowsBySegment.has(segId)) topWindowsBySegment.set(segId, []);
    topWindowsBySegment.get(segId).push(item);
  }
  const segments = (indexObj.segments || []).map((seg) => {
    const defectRaw = seg.defect;
    let defectTypes = [];
    let hasDefect = false;
    if (defectRaw && typeof defectRaw === "object") {
      hasDefect = Boolean(defectRaw.has_defect);
      defectTypes = listify(defectRaw.defect_types);
    }
    if (defectTypes.length && !hasDefect) hasDefect = true;
    if (!hasDefect) defectTypes = [];

    const segId = String(seg.segment_id || "").trim();
    const rawHighlightWindows =
      (Array.isArray(seg.highlight_windows) && seg.highlight_windows.length
        ? seg.highlight_windows
        : topWindowsBySegment.get(segId)) || [];
    const highlightWindows = rawHighlightWindows
      .map((row) => normalizeHighlightWindow(row, seg, fallbackProvider))
      .filter(Boolean)
      .sort((a, b) => {
        const ds = Number(a.global_start_s || 0) - Number(b.global_start_s || 0);
        if (ds !== 0) return ds;
        return String(a.window_id || "").localeCompare(String(b.window_id || ""));
      });
    let primaryHighlight = normalizeHighlightWindow(seg.primary_highlight, seg, fallbackProvider);
    if (!primaryHighlight && highlightWindows.length) primaryHighlight = highlightWindows[0];
    if (
      primaryHighlight &&
      !highlightWindows.some((item) => {
        if (primaryHighlight.window_id && item.window_id) return item.window_id === primaryHighlight.window_id;
        return (
          Number(item.global_start_s || 0) === Number(primaryHighlight.global_start_s || 0) &&
          Number(item.global_end_s || 0) === Number(primaryHighlight.global_end_s || 0)
        );
      })
    ) {
      highlightWindows.unshift(primaryHighlight);
    }

    return {
      segment_id: seg.segment_id,
      chunk_id: seg.chunk_id,
      global_start_s: seg.global_start_s,
      global_end_s: seg.global_end_s,
      duration_s: seg.duration_s,
      summary: seg.summary || "",
      asr_text: seg.asr_text || "",
      asr_text_zh: seg.asr_text_zh || "",
      asr_text_bilingual: seg.asr_text_bilingual || "",
      asr_detected_language: seg.asr_detected_language || "unknown",
      asr_language_to_zh: seg.asr_language_to_zh || "",
      audio_music_ratio: seg.audio_music_ratio || 0,
      audio_has_music: Boolean(seg.audio_has_music),
      sound_events: seg.sound_events || [],
      events: listify(seg.events),
      objects: listify(seg.objects),
      actions: listify(seg.actions),
      scene_tags: listify(seg.scene_tags),
      scene: listify(seg.scene || seg.scene_tags),
      subjects: listify(seg.subjects || seg.objects),
      shot_size: seg.shot_size || "未知 | unknown",
      camera_movements: listify(seg.camera_movements || ["未知 | unknown"]),
      emotion_tags: listify(seg.emotion_tags),
      defect: {
        has_defect: hasDefect,
        defect_types: defectTypes,
      },
      confidence: seg.confidence,
      quality: seg.quality || {},
      frame_paths: listify(seg.frame_paths),
      frame_urls: listify(seg.frame_paths).map(resolveFrameUrl).filter(Boolean),
      keyword_timeline: seg.keyword_timeline || [],
      tokens: seg.tokens || [],
      highlight_windows: highlightWindows,
      primary_highlight: primaryHighlight,
      highlight_count: highlightWindows.length,
    };
  });

  return {
    index_path: state.indexPathHint || "(uploaded file)",
    run_dir: "",
    video,
    stats: indexObj.stats || {},
    scene_cuts_s: indexObj.scene_cuts_s || [],
    taxonomies: {
      shot_size: listify(taxonomies.shot_size),
      camera_movements: listify(taxonomies.camera_movements || taxonomies.camera_movement),
      sound_events: listify(taxonomies.sound_events),
    },
    model_highlights: {
      ...modelHighlights,
      provider: fallbackProvider,
      windows: normalizedModelWindows,
    },
    rmdb_highlights:
      (indexObj && typeof indexObj.rmdb_highlights === "object" && indexObj.rmdb_highlights) || {},
    gemini_highlights:
      (indexObj && typeof indexObj.gemini_highlights === "object" && indexObj.gemini_highlights) || {},
    segments,
    keyword_index: buildKeywordIndex(indexObj),
  };
}

function formatHighlightProvider(provider) {
  return String(provider || "").trim().replaceAll("_", " ").replaceAll("-", " ");
}

function renderHighlightItem(item, index) {
  if (!item || typeof item !== "object") return null;

  const card = document.createElement("div");
  card.className = `highlight-item${index === 0 ? " primary" : ""}`;

  const preview = resolveHighlightPreviewSource(item);
  const media = document.createElement("div");
  media.className = "highlight-media";
  if (preview) {
    const videoEl = document.createElement("video");
    videoEl.className = "highlight-video";
    videoEl.controls = true;
    bindHighlightPreview(videoEl, preview);
    media.appendChild(videoEl);

    const note = document.createElement("div");
    note.className = "highlight-source-note";
    note.textContent = preview.sourceLabel;
    media.appendChild(note);
  } else {
    media.innerHTML = '<div class="highlight-empty">未找到高光 clip；可先绑定资源目录或设置可直接播放的视频源</div>';
  }

  const meta = document.createElement("div");
  meta.className = "highlight-meta";

  const duration = Number(
    item.duration_s || (Number(item.global_end_s || 0) - Number(item.global_start_s || 0)) || 0
  );
  const score = Number(item.score || 0);
  const title = String(item.title || "").trim() || `高光 ${index + 1}`;
  const badges = [];
  if (duration > 0) badges.push(`<span class="highlight-badge">${duration.toFixed(1)}s</span>`);
  if (score > 0) badges.push(`<span class="highlight-badge">score ${score.toFixed(2)}</span>`);

  meta.innerHTML = `
    <div class="highlight-item-head">
      <div class="highlight-item-title">${escapeHtml(title)}</div>
      <div class="highlight-head-side">${badges.join("")}</div>
    </div>
    <div class="meta-line"><span class="meta-label">全局时间</span><span>${fmtSec(item.global_start_s)} - ${fmtSec(item.global_end_s)}</span></div>
    <div class="meta-line"><span class="meta-label">片段内</span><span>${fmtSec(item.local_start_s)} - ${fmtSec(item.local_end_s)}</span></div>
    ${item.reason ? `<div class="meta-line"><span class="meta-label">原因</span><span>${escapeHtml(item.reason)}</span></div>` : ""}
  `;

  const tags = listify(item.tags);
  if (tags.length) {
    const tagRow = document.createElement("div");
    tagRow.className = "chips";
    for (const tag of tags.slice(0, 8)) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = tag;
      chip.title = "点击定位该关键词";
      chip.onclick = () => triggerQuery(tag);
      tagRow.appendChild(chip);
    }
    if (tagRow.children.length) meta.appendChild(tagRow);
  }

  const actions = document.createElement("div");
  actions.className = "highlight-actions";
  const jumpBtn = document.createElement("button");
  jumpBtn.className = "small-btn";
  jumpBtn.textContent = "跳到高光";
  jumpBtn.onclick = () => seek(item.global_start_s || 0);
  actions.appendChild(jumpBtn);
  meta.appendChild(actions);

  card.appendChild(media);
  card.appendChild(meta);
  return card;
}

function renderHighlightPanel(seg) {
  const fallbackProvider = String(
    (seg && seg.primary_highlight && seg.primary_highlight.provider) ||
      (state.bundle && state.bundle.model_highlights && state.bundle.model_highlights.provider) ||
      ""
  ).trim();
  const rawRows = Array.isArray(seg && seg.highlight_windows)
    ? seg.highlight_windows
        .map((item) => normalizeHighlightWindow(item, seg, fallbackProvider))
        .filter((item) => item && typeof item === "object")
    : [];
  const primary =
    seg && seg.primary_highlight && typeof seg.primary_highlight === "object"
      ? normalizeHighlightWindow(seg.primary_highlight, seg, fallbackProvider)
      : rawRows[0] || null;
  const rows = [];
  const seen = new Set();
  for (const item of primary ? [primary, ...rawRows] : rawRows) {
    if (!item) continue;
    const key =
      String(item.window_id || "").trim() ||
      `${Number(item.global_start_s || 0).toFixed(3)}-${Number(item.global_end_s || 0).toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(item);
  }
  if (!rows.length) return null;

  const provider = formatHighlightProvider(
    (primary || rows[0]).provider ||
      fallbackProvider
  );
  const panel = document.createElement("div");
  panel.className = "highlight-panel";

  const headBadges = [];
  if (provider) headBadges.push(`<span class="highlight-badge">${escapeHtml(provider)}</span>`);
  headBadges.push(`<span class="highlight-count">共 ${rows.length} 个高光窗口</span>`);

  panel.innerHTML = `
    <div class="highlight-head">
      <div class="meta-title">模型高光</div>
      <div class="highlight-head-side">${headBadges.join("")}</div>
    </div>
  `;

  const stack = document.createElement("div");
  stack.className = "highlight-stack";
  for (const [index, item] of rows.entries()) {
    const card = renderHighlightItem(item, index);
    if (card) stack.appendChild(card);
  }
  panel.appendChild(stack);

  return panel;
}

function renderSegments() {
  const segs = (state.bundle && state.bundle.segments) || [];
  const filtered = segs.filter(passFilters);
  const activeFilters = [];
  if (state.filters.shot_size) activeFilters.push(`景别=${state.filters.shot_size}`);
  if (state.filters.camera_movement) activeFilters.push(`运动=${state.filters.camera_movement}`);
  if (state.filters.defect === "has_defect") activeFilters.push("缺陷=仅有缺陷");
  if (state.filters.defect === "no_defect") activeFilters.push("缺陷=仅无缺陷");
  if (filterInfo) {
    filterInfo.textContent = `分段筛选：${filtered.length}/${segs.length}${
      activeFilters.length ? `（${activeFilters.join("，")}）` : ""
    }`;
  }

  segmentList.innerHTML = "";
  if (!filtered.length) {
    segmentList.innerHTML = '<div class="muted">当前筛选条件下无分段</div>';
    return;
  }

  for (const seg of filtered) {
    const card = document.createElement("div");
    card.className = `card${state.hitIds.has(seg.segment_id) ? " hit" : ""}`;
    card.id = `seg_${seg.segment_id}`;

    const row = document.createElement("div");
    row.className = "rowline";
    row.innerHTML = `
      <div>
        <span class="time">${fmtSec(seg.global_start_s)} - ${fmtSec(seg.global_end_s)}</span>
        <span class="muted" style="margin-left:6px;">${escapeHtml(seg.segment_id || "")}</span>
      </div>
      <button class="small-btn">跳转</button>
    `;
    row.querySelector("button").onclick = () => seek(seg.global_start_s || 0);

    const sum = document.createElement("div");
    sum.style.marginTop = "8px";
    sum.textContent = seg.summary || "(无摘要)";

    const sceneText = listify(seg.scene).join(" / ");
    const subjectText = listify(seg.subjects).join(" / ");
    const shotSizeText = String(seg.shot_size || "未知 | unknown");
    const movementText = listify(seg.camera_movements).join(" / ");
    const emotionText = listify(seg.emotion_tags).join(" / ");
    const defectInfo = formatDefect(seg);
    const asrLangText = String(seg.asr_detected_language || "(空)").trim();
    const musicRatio = Number(seg.audio_music_ratio || 0);
    const hasMusic = Boolean(seg.audio_has_music);
    const musicText = `${hasMusic ? "是" : "否"} (${(Math.max(0, musicRatio) * 100).toFixed(1)}%)`;
    const soundEvents = normalizeSoundEvents(seg.sound_events);
    const soundEventText = soundEvents.length
      ? dedupStrings(soundEvents.map((x) => x.event_type)).join(" / ")
      : "(无)";

    const visualMeta = document.createElement("div");
    visualMeta.className = "meta-grid";
    visualMeta.innerHTML = `
      <div class="meta-line"><span class="meta-label">场景</span><span>${escapeHtml(sceneText || "(空)")}</span></div>
      <div class="meta-line"><span class="meta-label">主体</span><span>${escapeHtml(subjectText || "(空)")}</span></div>
      <div class="meta-line"><span class="meta-label">镜头景别</span><span>${escapeHtml(shotSizeText)}</span></div>
      <div class="meta-line"><span class="meta-label">镜头运动</span><span>${escapeHtml(movementText || "(空)")}</span></div>
      <div class="meta-line"><span class="meta-label">情绪</span><span>${escapeHtml(emotionText || "(空)")}</span></div>
      <div class="meta-line"><span class="meta-label">缺陷</span><span class="${defectInfo.className}">${escapeHtml(defectInfo.text)}</span></div>
    `;

    const asrBi = String(seg.asr_text_bilingual || "").trim();
    const audioMeta = document.createElement("div");
    audioMeta.className = "meta-block";
    audioMeta.innerHTML = `
      <div class="meta-title">声音分析</div>
      <div class="meta-grid" style="margin-top:0;">
        <div class="meta-line"><span class="meta-label">ASR双语</span><span>${escapeHtml(asrBi || "(空)")}</span></div>
        <div class="meta-line"><span class="meta-label">ASR语种</span><span>${escapeHtml(asrLangText || "(空)")}</span></div>
        <div class="meta-line"><span class="meta-label">音乐检测</span><span>${escapeHtml(musicText)}</span></div>
        <div class="meta-line"><span class="meta-label">声音事件</span><span>${escapeHtml(soundEventText)}</span></div>
      </div>
    `;

    const chips = document.createElement("div");
    chips.className = "chips";
    const groups = [
      ...(seg.events || []),
      ...(seg.objects || []),
      ...(seg.actions || []),
      ...(seg.scene_tags || []),
      ...listify(seg.scene),
      ...listify(seg.subjects),
      ...listify(seg.camera_movements),
      ...listify(seg.emotion_tags),
      ...soundEvents.map((x) => x.event_type),
      ...listify(seg.defect && seg.defect.defect_types),
      String(seg.asr_detected_language || "").trim(),
      seg.shot_size || "",
    ];
    const seen = new Set();
    for (const k of groups) {
      const key = String(k || "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = key;
      chip.title = "点击定位该关键词";
      chip.onclick = () => triggerQuery(key);
      chips.appendChild(chip);
    }

    card.appendChild(row);
    card.appendChild(sum);
    card.appendChild(visualMeta);
    card.appendChild(audioMeta);
    const highlightPanel = renderHighlightPanel(seg);
    if (highlightPanel) card.appendChild(highlightPanel);
    if (chips.children.length) card.appendChild(chips);

    const timelineRows = Array.isArray(seg.keyword_timeline) ? seg.keyword_timeline : [];
    if (timelineRows.length) {
      const tl = document.createElement("div");
      tl.className = "timeline";
      for (const item of timelineRows.slice(0, 20)) {
        const start = Number(item.global_start_s || 0);
        const end = Number(item.global_end_s || 0);
        const kw = String(item.keyword || "").trim();
        if (!kw) continue;
        const t = document.createElement("span");
        t.className = "timechip";
        t.innerHTML = `<strong>${escapeHtml(kw)}</strong> @ ${fmtSec(start)}-${fmtSec(end)}`;
        t.title = "点击跳转到全局时间戳";
        t.onclick = () => seek(start);
        tl.appendChild(t);
      }
      if (tl.children.length) card.appendChild(tl);
    }

    if (soundEvents.length) {
      const stl = document.createElement("div");
      stl.className = "timeline";
      for (const item of soundEvents.slice(0, 20)) {
        const start = Number(item.global_start_s || 0);
        const end = Number(item.global_end_s || start);
        const eventType = String(item.event_type || "").trim();
        if (!eventType) continue;
        const t = document.createElement("span");
        t.className = "timechip";
        t.innerHTML = `<strong>${escapeHtml(eventType)}</strong> @ ${fmtSec(start)}-${fmtSec(end)}`;
        t.title = "点击跳转到声音事件时间戳";
        t.onclick = () => seek(start);
        stl.appendChild(t);
      }
      if (stl.children.length) audioMeta.appendChild(stl);
    }

    segmentList.appendChild(card);
  }
}

function renderSearchResults(results, query) {
  resultList.innerHTML = "";
  if (!results.length) {
    resultList.innerHTML = `<div class="muted">没有命中：${escapeHtml(query)}</div>`;
    searchInfo.textContent = `“${query}” 无匹配结果`;
    return;
  }

  searchInfo.textContent = `“${query}” 命中 ${results.length} 段`;
  for (const r of results) {
    const defectInfo = formatDefect(r);
    const sceneText = listify(r.scene).join(" / ");
    const subjectText = listify(r.subjects).join(" / ");
    const shotSizeText = String(r.shot_size || "未知 | unknown");
    const movementText = listify(r.camera_movements).join(" / ");
    const emotionText = listify(r.emotion_tags).join(" / ");
    const asrLangText = String(r.asr_detected_language || "(空)").trim();
    const musicRatio = Number(r.audio_music_ratio || 0);
    const hasMusic = Boolean(r.audio_has_music);
    const musicText = `${hasMusic ? "是" : "否"} (${(Math.max(0, musicRatio) * 100).toFixed(1)}%)`;
    const soundEvents = normalizeSoundEvents(r.sound_events);
    const soundEventText = soundEvents.length
      ? dedupStrings(soundEvents.map((x) => x.event_type)).join(" / ")
      : "(无)";
    const asrBi = String(r.asr_text_bilingual || "").trim();

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="rowline">
        <div>
          <span class="time">${fmtSec(r.global_start_s)} - ${fmtSec(r.global_end_s)}</span>
          <span class="muted" style="margin-left:6px;">${escapeHtml(r.segment_id || "")}</span>
        </div>
        <div>
          <span class="score">score ${Number(r.score || 0).toFixed(2)}</span>
          <button class="small-btn" style="margin-left:8px;">跳转</button>
        </div>
      </div>
      <div class="muted" style="margin-top:6px;">${r.hit_type === "keyword_timeline" ? `关键词命中: ${escapeHtml(r.matched_keyword || "")}` : "分段命中"}</div>
      <div style="margin-top:8px;">${escapeHtml(r.summary || "")}</div>
      <div class="meta-grid">
        <div class="meta-line"><span class="meta-label">场景</span><span>${escapeHtml(sceneText || "(空)")}</span></div>
        <div class="meta-line"><span class="meta-label">主体</span><span>${escapeHtml(subjectText || "(空)")}</span></div>
        <div class="meta-line"><span class="meta-label">镜头景别</span><span>${escapeHtml(shotSizeText)}</span></div>
        <div class="meta-line"><span class="meta-label">镜头运动</span><span>${escapeHtml(movementText || "(空)")}</span></div>
        <div class="meta-line"><span class="meta-label">情绪</span><span>${escapeHtml(emotionText || "(空)")}</span></div>
        <div class="meta-line"><span class="meta-label">缺陷</span><span class="${defectInfo.className}">${escapeHtml(defectInfo.text)}</span></div>
      </div>
      <div class="meta-block">
        <div class="meta-title">声音分析</div>
        <div class="meta-grid" style="margin-top:0;">
          <div class="meta-line"><span class="meta-label">ASR双语</span><span>${escapeHtml(asrBi || "(空)")}</span></div>
          <div class="meta-line"><span class="meta-label">ASR语种</span><span>${escapeHtml(asrLangText || "(空)")}</span></div>
          <div class="meta-line"><span class="meta-label">音乐检测</span><span>${escapeHtml(musicText)}</span></div>
          <div class="meta-line"><span class="meta-label">声音事件</span><span>${escapeHtml(soundEventText)}</span></div>
        </div>
      </div>
    `;
    card.querySelector("button").onclick = () => seek(r.global_start_s || 0);

    const chips = document.createElement("div");
    chips.className = "chips";
    const chipTerms = dedupStrings([
      ...listify(r.events),
      ...listify(r.objects),
      ...listify(r.actions),
      ...listify(r.scene),
      ...listify(r.subjects),
      ...listify(r.camera_movements),
      ...listify(r.emotion_tags),
      ...soundEvents.map((x) => x.event_type),
      ...listify(r.defect && r.defect.defect_types),
      String(r.asr_detected_language || "").trim(),
      String(r.shot_size || "").trim(),
    ]);
    for (const key of chipTerms) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = key;
      chip.title = "点击定位该关键词";
      chip.onclick = () => triggerQuery(key);
      chips.appendChild(chip);
    }
    if (chips.children.length) card.appendChild(chips);

    if (soundEvents.length) {
      const audioBlock = card.querySelector(".meta-block");
      const tl = document.createElement("div");
      tl.className = "timeline";
      for (const item of soundEvents.slice(0, 12)) {
        const start = Number(item.global_start_s || 0);
        const end = Number(item.global_end_s || start);
        const eventType = String(item.event_type || "").trim();
        if (!eventType) continue;
        const chip = document.createElement("span");
        chip.className = "timechip";
        chip.innerHTML = `<strong>${escapeHtml(eventType)}</strong> @ ${fmtSec(start)}-${fmtSec(end)}`;
        chip.onclick = () => seek(start);
        tl.appendChild(chip);
      }
      if (tl.children.length && audioBlock) audioBlock.appendChild(tl);
    }

    const highlightPanel = renderHighlightPanel(r);
    if (highlightPanel) card.appendChild(highlightPanel);
    resultList.appendChild(card);
  }
}

function renderGlobalKeywords() {
  const rows = (state.bundle && state.bundle.keyword_index) || [];
  globalKeywordList.innerHTML = "";
  if (!rows.length) {
    globalKeywordList.innerHTML = '<div class="muted">无全局关键词时间索引</div>';
    return;
  }

  const title = document.createElement("div");
  title.className = "muted";
  title.style.marginBottom = "6px";
  title.textContent = "全局关键词时间索引（点击时间跳转）";
  globalKeywordList.appendChild(title);

  for (const item of rows.slice(0, 50)) {
    const kw = String(item.keyword || "").trim();
    if (!kw) continue;
    const occ = Array.isArray(item.occurrences) ? item.occurrences : [];

    const line = document.createElement("div");
    line.style.marginBottom = "6px";

    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = kw;
    chip.title = "点击定位该关键词";
    chip.onclick = () => triggerQuery(kw);
    line.appendChild(chip);

    for (const o of occ.slice(0, 8)) {
      const s = Number(o.global_start_s || 0);
      const e = Number(o.global_end_s || 0);
      const t = document.createElement("span");
      t.className = "timechip";
      t.style.marginLeft = "6px";
      t.textContent = `${fmtSec(s)}-${fmtSec(e)}`;
      t.title = "点击跳转到全局时间戳";
      t.onclick = () => seek(s);
      line.appendChild(t);
    }

    globalKeywordList.appendChild(line);
  }
}

function refreshWithFilters() {
  const filteredResults = state.lastResults.filter(passFilters);
  state.hitIds = new Set(filteredResults.map((x) => x.segment_id));
  renderSegments();
  if (state.lastQuery) {
    renderSearchResults(filteredResults, state.lastQuery);
  } else {
    resultList.innerHTML = '<div class="muted">在上方输入文本进行定位。</div>';
  }
  return filteredResults;
}

function doSearch() {
  if (!state.indexObj) {
    searchInfo.textContent = "请先加载 index.json";
    return;
  }
  const query = queryInput.value.trim();
  if (!query) return;

  const { results, normalizedQuery, terms } = searchSegments(state.indexObj, query, 30);
  state.lastQuery = query;
  state.lastResults = Array.isArray(results) ? results : [];
  const filteredResults = refreshWithFilters();

  updateSearchDebug(
    `query=${query} | normalized=${normalizedQuery || ""} | terms=${terms.join(",")} | count=${results.length} | filtered=${filteredResults.length}`
  );
}

function resetSearch() {
  queryInput.value = "";
  state.hitIds = new Set();
  state.lastQuery = "";
  state.lastResults = [];
  renderSegments();
  renderGlobalKeywords();
  resultList.innerHTML = '<div class="muted">在上方输入文本进行定位。</div>';
  searchInfo.textContent = "可点击右侧关键词快速定位";
  updateSearchDebug(`index=${state.indexPathHint || "(uploaded file)"}`);
}

function refreshAfterIndexLoaded() {
  state.bundle = buildBundle(state.indexObj);
  state.hitIds = new Set();
  state.lastQuery = "";
  state.lastResults = [];
  setupTaxonomyFilters();
  const v = state.bundle.video || {};
  const segCount = (state.bundle.segments || []).length;
  metaLine.textContent = `${v.video_id || "-"} | ${fmtSec(v.duration_s || 0)} | segments=${segCount} | ${state.bundle.index_path}`;

  renderSegments();
  renderGlobalKeywords();
  resultList.innerHTML = '<div class="muted">在上方输入文本进行定位。</div>';
  searchInfo.textContent = "可点击右侧关键词快速定位";
  updateSearchDebug(`index=${state.bundle.index_path}`);

  const maybeVideo = resolveMetaVideoPath(v);
  if (maybeVideo) {
    setHtml5VideoSource(maybeVideo, `按 index.video 自动解析视频源：${String(v.path || v.video_id || "")}`);
  } else {
    videoSourceInfo.textContent = "未自动解析到视频源，请上传本地视频或粘贴视频链接";
  }

  markIndexReady(true);
  setStatus(`index.json 已加载，共 ${segCount} 个分段`);
}

async function loadIndexFromFile() {
  const input = document.getElementById("indexFileInput");
  const file = input.files && input.files[0];
  if (!file) {
    setStatus("请先选择 index.json 文件");
    return;
  }

  try {
    const text = await file.text();
    const obj = JSON.parse(text);
    state.indexObj = obj;
    state.indexPathHint = file.name;
    state.indexBaseUrl = "";
    refreshAfterIndexLoaded();
  } catch (err) {
    setStatus(`读取 JSON 失败: ${String(err)}`);
  }
}

async function loadIndexFromUrl() {
  const raw = document.getElementById("indexUrlInput").value.trim();
  if (!raw) {
    setStatus("请输入 index.json URL");
    return;
  }

  try {
    const resp = await fetch(raw, { cache: "no-store" });
    if (!resp.ok) {
      setStatus(`读取 URL 失败: HTTP ${resp.status}`);
      return;
    }
    const obj = await resp.json();
    state.indexObj = obj;
    state.indexPathHint = raw;
    state.indexBaseUrl = new URL(".", raw).toString();
    refreshAfterIndexLoaded();
  } catch (err) {
    setStatus(`读取 URL 失败: ${String(err)}`);
  }
}

function bindAssetFolder() {
  const input = document.getElementById("assetFolderInput");
  const files = input.files;
  if (!files || !files.length) {
    setStatus("请选择资源目录");
    return;
  }

  clearAssetObjectUrls();
  state.assetUrls = new Map();
  state.assetSuffixUrls = [];

  for (const f of files) {
    const rel = normalizePath(f.webkitRelativePath || f.name);
    const objUrl = URL.createObjectURL(f);
    registerAssetObjectUrl(objUrl);

    state.assetUrls.set(rel, objUrl);
    state.assetSuffixUrls.push({ suffix: rel, url: objUrl });

    const nameOnly = normalizePath(f.name);
    if (!state.assetUrls.has(nameOnly)) {
      state.assetUrls.set(nameOnly, objUrl);
    }
  }

  state.assetSuffixUrls.sort((a, b) => b.suffix.length - a.suffix.length);

  setStatus(`资源目录已绑定，共 ${files.length} 个文件`);
  if (state.indexObj) {
    refreshAfterIndexLoaded();
  }
}

function useVideoFile() {
  const input = document.getElementById("videoFileInput");
  const file = input.files && input.files[0];
  if (!file) {
    videoSourceInfo.textContent = "请先选择本地视频文件";
    return;
  }

  const objUrl = URL.createObjectURL(file);
  registerObjectUrl(objUrl);
  setHtml5VideoSource(objUrl, `本地视频：${file.name}`);
}

document.getElementById("loadIndexFileBtn").onclick = loadIndexFromFile;
document.getElementById("loadIndexUrlBtn").onclick = loadIndexFromUrl;
document.getElementById("bindAssetsBtn").onclick = bindAssetFolder;
document.getElementById("useVideoFileBtn").onclick = useVideoFile;
document.getElementById("useVideoUrlBtn").onclick = () => {
  const raw = document.getElementById("videoUrlInput").value.trim();
  useVideoUrl(raw);
};
if (toggleDataSourceBtn && dataSourceBlock) {
  toggleDataSourceBtn.onclick = () => {
    const collapsed = !dataSourceBlock.classList.contains("collapsed");
    setBlockCollapsed(dataSourceBlock, toggleDataSourceBtn, collapsed);
  };
}
if (toggleVideoSourceBtn && videoSourceBlock) {
  toggleVideoSourceBtn.onclick = () => {
    const collapsed = !videoSourceBlock.classList.contains("collapsed");
    setBlockCollapsed(videoSourceBlock, toggleVideoSourceBtn, collapsed);
  };
}
if (toggleSourcePanelBtn) {
  toggleSourcePanelBtn.onclick = () => {
    setSourcePanelCollapsed(!state.ui.sourcePanelCollapsed);
  };
}
document.getElementById("searchBtn").onclick = doSearch;
document.getElementById("resetBtn").onclick = resetSearch;
if (shotSizeFilter) {
  shotSizeFilter.addEventListener("change", () => {
    state.filters.shot_size = shotSizeFilter.value || "";
    refreshWithFilters();
  });
}
if (cameraMovementFilter) {
  cameraMovementFilter.addEventListener("change", () => {
    state.filters.camera_movement = cameraMovementFilter.value || "";
    refreshWithFilters();
  });
}
if (defectFilter) {
  defectFilter.addEventListener("change", () => {
    state.filters.defect = defectFilter.value || "all";
    refreshWithFilters();
  });
}
const clearFilterBtn = document.getElementById("clearFilterBtn");
if (clearFilterBtn) {
  clearFilterBtn.onclick = () => {
    state.filters.shot_size = "";
    state.filters.camera_movement = "";
    state.filters.defect = "all";
    if (shotSizeFilter) shotSizeFilter.value = "";
    if (cameraMovementFilter) cameraMovementFilter.value = "";
    if (defectFilter) defectFilter.value = "all";
    refreshWithFilters();
  };
}

queryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch();
});

player.addEventListener("error", () => {
  const err = player.error ? player.error.code : "unknown";
  searchInfo.textContent = `视频加载失败，错误码: ${err}`;
});

setStatus("等待加载 index.json");
updateSourceQuickState();
setBlockCollapsed(dataSourceBlock, toggleDataSourceBtn, false);
setBlockCollapsed(videoSourceBlock, toggleVideoSourceBtn, false);
setSourcePanelCollapsed(false);
metaLine.textContent = "请先加载 index.json";
resultList.innerHTML = '<div class="muted">在上方输入文本进行定位。</div>';
globalKeywordList.innerHTML = '<div class="muted">无全局关键词时间索引</div>';
if (filterInfo) filterInfo.textContent = "分段筛选：0/0";
clearVideoAction();
switchPlayer("none");
