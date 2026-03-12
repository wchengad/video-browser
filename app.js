const state = {
  indexObj: null,
  indexPathHint: "",
  indexBaseUrl: "",
  bundle: null,
  hitIds: new Set(),
  assetUrls: new Map(),
  assetSuffixUrls: [],
  ownedObjectUrls: [],
  assetObjectUrls: [],
  playerMode: "none", // none | html5 | embed
  embedKind: "",
  embedBaseUrl: "",
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

function setStatus(text) {
  statusLine.textContent = String(text || "");
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
}

function setEmbedSource(embedUrl, kind, hint) {
  switchPlayer("embed");
  embedPlayer.src = embedUrl;
  state.embedKind = kind || "generic";
  state.embedBaseUrl = embedUrl;
  clearVideoAction();
  videoSourceInfo.textContent = hint || "使用嵌入播放器";
}

function setExternalOnlySource(url, platformName) {
  switchPlayer("none");
  state.embedKind = "external_only";
  state.embedBaseUrl = url;
  const pname = platformName || "该平台";
  videoSourceInfo.textContent = `${pname}限制外站 iframe，无法在当前页面内嵌播放`;
  setVideoActionLink(url, `在新标签页打开${pname}视频`);
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

function segmentText(seg) {
  const parts = [];
  for (const key of ["summary", "asr_text"]) {
    const val = seg[key];
    if (typeof val === "string") parts.push(val);
  }
  for (const key of ["events", "objects", "actions", "scene_tags", "tokens"]) {
    const arr = seg[key];
    if (Array.isArray(arr)) parts.push(...arr.map((x) => String(x)));
  }
  return parts.join("\n").toLowerCase();
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

  const out = [];
  for (const seg of indexObj.segments || []) {
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
        events: seg.events || [],
        objects: seg.objects || [],
        actions: seg.actions || [],
        scene_tags: seg.scene_tags || [],
        asr_text: seg.asr_text || "",
        score: Number(score.toFixed(4)),
        hit_type: "segment",
        matched_keyword: "",
        evidence_times_s: [],
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
        events: seg.events || [],
        objects: seg.objects || [],
        actions: seg.actions || [],
        scene_tags: seg.scene_tags || [],
        asr_text: seg.asr_text || "",
        score: Number(kwScore.toFixed(4)),
        hit_type: "keyword_timeline",
        matched_keyword: kw.keyword || "",
        evidence_times_s: kw.evidence_times_s || [],
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

function resolveFrameUrl(fp) {
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
  const segments = (indexObj.segments || []).map((seg) => ({
    segment_id: seg.segment_id,
    chunk_id: seg.chunk_id,
    global_start_s: seg.global_start_s,
    global_end_s: seg.global_end_s,
    duration_s: seg.duration_s,
    summary: seg.summary || "",
    asr_text: seg.asr_text || "",
    events: seg.events || [],
    objects: seg.objects || [],
    actions: seg.actions || [],
    scene_tags: seg.scene_tags || [],
    confidence: seg.confidence,
    quality: seg.quality || {},
    frame_paths: seg.frame_paths || [],
    frame_urls: (seg.frame_paths || []).map(resolveFrameUrl).filter(Boolean),
    keyword_timeline: seg.keyword_timeline || [],
    tokens: seg.tokens || [],
  }));

  return {
    index_path: state.indexPathHint || "(uploaded file)",
    run_dir: "",
    video,
    stats: indexObj.stats || {},
    scene_cuts_s: indexObj.scene_cuts_s || [],
    segments,
    keyword_index: buildKeywordIndex(indexObj),
  };
}

function renderSegments() {
  const segs = (state.bundle && state.bundle.segments) || [];
  segmentList.innerHTML = "";

  for (const seg of segs) {
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

    const chips = document.createElement("div");
    chips.className = "chips";
    const groups = [
      ...(seg.events || []),
      ...(seg.objects || []),
      ...(seg.actions || []),
      ...(seg.scene_tags || []),
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

    const asr = document.createElement("div");
    asr.className = "muted";
    asr.style.marginTop = "8px";
    asr.textContent = seg.asr_text ? `ASR: ${seg.asr_text}` : "ASR: (空)";

    card.appendChild(row);
    card.appendChild(sum);
    if (chips.children.length) card.appendChild(chips);
    card.appendChild(asr);

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

    if (seg.frame_urls && seg.frame_urls.length) {
      const frames = document.createElement("div");
      frames.className = "frames";
      for (const u of seg.frame_urls.slice(0, 6)) {
        const img = document.createElement("img");
        img.src = u;
        img.loading = "lazy";
        img.onclick = () => seek(seg.global_start_s || 0);
        frames.appendChild(img);
      }
      card.appendChild(frames);
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
    `;
    card.querySelector("button").onclick = () => seek(r.global_start_s || 0);
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

function doSearch() {
  if (!state.indexObj) {
    searchInfo.textContent = "请先加载 index.json";
    return;
  }
  const query = queryInput.value.trim();
  if (!query) return;

  const { results, normalizedQuery, terms } = searchSegments(state.indexObj, query, 30);
  state.hitIds = new Set(results.map((x) => x.segment_id));
  renderSegments();
  renderSearchResults(results, query);

  updateSearchDebug(
    `query=${query} | normalized=${normalizedQuery || ""} | terms=${terms.join(",")} | count=${results.length}`
  );
}

function resetSearch() {
  queryInput.value = "";
  state.hitIds = new Set();
  renderSegments();
  renderGlobalKeywords();
  resultList.innerHTML = '<div class="muted">在上方输入文本进行定位。</div>';
  searchInfo.textContent = "可点击右侧关键词快速定位";
  updateSearchDebug(`index=${state.indexPathHint || "(uploaded file)"}`);
}

function refreshAfterIndexLoaded() {
  state.bundle = buildBundle(state.indexObj);
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
document.getElementById("searchBtn").onclick = doSearch;
document.getElementById("resetBtn").onclick = resetSearch;

queryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch();
});

player.addEventListener("error", () => {
  const err = player.error ? player.error.code : "unknown";
  searchInfo.textContent = `视频加载失败，错误码: ${err}`;
});

setStatus("等待加载 index.json");
metaLine.textContent = "请先加载 index.json";
resultList.innerHTML = '<div class="muted">在上方输入文本进行定位。</div>';
globalKeywordList.innerHTML = '<div class="muted">无全局关键词时间索引</div>';
clearVideoAction();
switchPlayer("none");
