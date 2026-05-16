const STORAGE_KEY = "happiness_mosaic_state_v1";

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < 21; i += 1) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${prefix}_${Date.now().toString(36)}_${s}`;
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function emptyState() {
  return { activeTask: null, completedTasks: [] };
}

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const doc = JSON.parse(raw);
    if (!doc || typeof doc !== "object") return emptyState();
    if (doc.schemaVersion !== 1) return emptyState();
    const s = doc.state;
    if (!s || typeof s !== "object") return emptyState();
    return {
      activeTask: s.activeTask ?? null,
      completedTasks: Array.isArray(s.completedTasks) ? s.completedTasks : []
    };
  } catch {
    return emptyState();
  }
}

function writeState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, state }));
}

function builtinPatterns() {
  return [
    { id: "p_qiaoliushui", title: "小桥流水", imageUrl: "/patterns/qiaoliushui.jpeg", thumbnailUrl: "/patterns/qiaoliushui.jpeg" },
    { id: "p_hubianting", title: "湖边亭", imageUrl: "/patterns/hubianting.jpeg", thumbnailUrl: "/patterns/hubianting.jpeg" },
    { id: "p_fendai", title: "粉黛花海", imageUrl: "/patterns/fendaihuahai.jpeg", thumbnailUrl: "/patterns/fendaihuahai.jpeg" }
  ];
}

function createGridBlocks(targetCount) {
  const cols = Math.ceil(Math.sqrt(targetCount));
  const rows = Math.ceil(targetCount / cols);
  const blocks = [];
  for (let i = 0; i < targetCount; i += 1) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x0 = c / cols;
    const y0 = r / rows;
    const x1 = (c + 1) / cols;
    const y1 = (r + 1) / rows;
    blocks.push({
      id: createId("block"),
      geometry: { kind: "polygon", points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] }
    });
  }
  return blocks;
}

function litSet(task) {
  return new Set(task.entries.map((e) => e.blockId));
}

function pickRandomUnlitBlockId(task) {
  const lit = litSet(task);
  const unlit = task.blocks.filter((b) => !lit.has(b.id));
  if (unlit.length === 0) return null;
  const idx = Math.floor(Math.random() * unlit.length);
  return unlit[idx]?.id ?? null;
}

function addEntryToState(state, input) {
  const t = state.activeTask;
  if (!t) throw new Error("当前没有进行中的任务");
  if (t.entries.length >= t.targetCount) throw new Error("已达到预设数目");
  const blockId = pickRandomUnlitBlockId(t);
  if (!blockId) throw new Error("没有可点亮的块");
  const entry = { id: createId("entry"), dateISO: input.dateISO, content: input.content, blockId, createdAt: Date.now() };
  const updated = { ...t, entries: [...t.entries, entry] };
  if (updated.entries.length === updated.targetCount) {
    const archived = { ...updated, status: "completed", completedAt: Date.now() };
    return { activeTask: null, completedTasks: [archived, ...state.completedTasks] };
  }
  return { ...state, activeTask: updated };
}

function startTask(state, input) {
  if (state.activeTask) throw new Error("当前存在进行中的任务");
  const targetCount = input.targetCount;
  if (!Number.isInteger(targetCount) || targetCount <= 0) throw new Error("事件数必须为正整数");
  const blocks = createGridBlocks(targetCount);
  const task = {
    id: createId("task"),
    pattern: input.pattern,
    targetCount,
    blocks,
    entries: [],
    status: "active",
    createdAt: Date.now()
  };
  return { ...state, activeTask: task };
}

function normalizeRoute() {
  const p = location.pathname.replace(/\/+$/, "") || "/";
  if (location.hash) return;
  if (p === "/record") location.hash = "#record";
  else if (p === "/album") location.hash = "#album";
  else location.hash = "#";
}

function activeRoute(state) {
  normalizeRoute();
  const h = (location.hash || "#").toLowerCase();
  if (h.startsWith("#record")) return "record";
  if (h.startsWith("#album")) return "album";
  return state.activeTask ? "record" : "album";
}

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) n.setAttribute(k, String(v));
  }
  for (const c of children) n.append(c);
  return n;
}

function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function formatDateTime(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function mountMosaic(canvas, task, options = {}) {
  const mode = options.mode ?? "active";
  const enableHover = options.enableHover === true;
  let ro = null;
  let disposed = false;
  let img = null;
  let pending = null;
  let tip = null;
  let hoverBlockId = null;
  let hoverClient = null;

  const draw = () => {
    if (disposed) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    ctx.clearRect(0, 0, w, h);

    if (!img || !img.naturalWidth || !img.naturalHeight) {
      ctx.fillStyle = "rgba(6, 16, 30, 0.14)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(10, 22, 34, 0.78)";
      ctx.font = `${Math.max(12, Math.floor(12 * dpr))}px ui-sans-serif, system-ui`;
      ctx.fillText("图案加载失败", Math.floor(14 * dpr), Math.floor(22 * dpr));
      return;
    }

    const ir = img.naturalWidth / img.naturalHeight;
    const cr = w / h;
    let sx, sy, sw, sh;
    if (ir > cr) {
      sh = img.naturalHeight;
      sw = sh * cr;
      sx = (img.naturalWidth - sw) / 2;
      sy = 0;
    } else {
      sw = img.naturalWidth;
      sh = sw / cr;
      sx = 0;
      sy = (img.naturalHeight - sh) / 2;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

    if (mode === "active") {
      ctx.fillStyle = "rgba(6, 16, 30, 0.62)";
      ctx.fillRect(0, 0, w, h);

      const lit = litSet(task);
      for (const b of task.blocks) {
        if (b.geometry.kind !== "polygon") continue;
        if (!lit.has(b.id)) continue;
        ctx.save();
        const pts = b.geometry.points;
        ctx.beginPath();
        ctx.moveTo(pts[0].x * w, pts[0].y * h);
        for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x * w, pts[i].y * h);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        ctx.restore();
      }
    }

    ctx.strokeStyle = mode === "active" ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.42)";
    ctx.lineWidth = Math.max(1, Math.floor(1.2 * dpr));
    for (const b of task.blocks) {
      if (b.geometry.kind !== "polygon") continue;
      const pts = b.geometry.points;
      ctx.beginPath();
      ctx.moveTo(pts[0].x * w, pts[0].y * h);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x * w, pts[i].y * h);
      ctx.closePath();
      ctx.stroke();
    }

    if (hoverBlockId) {
      const b = task.blocks.find((x) => x.id === hoverBlockId);
      if (b && b.geometry.kind === "polygon") {
        const pts = b.geometry.points;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0].x * w, pts[0].y * h);
        for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x * w, pts[i].y * h);
        ctx.closePath();
        ctx.fillStyle = "rgba(140, 201, 255, 0.20)";
        ctx.fill();
        ctx.strokeStyle = "rgba(140, 201, 255, 0.82)";
        ctx.lineWidth = Math.max(2, Math.floor(2.2 * dpr));
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  const load = () => {
    const i = new Image();
    i.decoding = "async";
    i.src = task.pattern.imageUrl;
    i.addEventListener("load", () => {
      img = i;
      draw();
    });
    i.addEventListener("error", () => {
      img = null;
      draw();
    });
  };

  load();
  ro = new ResizeObserver(() => {
    if (pending) cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      pending = null;
      draw();
    });
  });
  ro.observe(canvas);

  if (enableHover) {
    tip = el("div", { class: "hoverTip" });
    tip.style.display = "none";
    document.body.append(tip);

    const updateHover = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      const nx = clamp01((clientX - rect.left) / rect.width);
      const ny = clamp01((clientY - rect.top) / rect.height);
      let found = null;
      for (const b of task.blocks) {
        if (b.geometry.kind !== "polygon") continue;
        if (pointInPolygon({ x: nx, y: ny }, b.geometry.points)) {
          found = b.id;
          break;
        }
      }

      if (found !== hoverBlockId) {
        hoverBlockId = found;
        draw();
      }

      const entry = found ? task.entries.find((e) => e.blockId === found) : null;
      if (!entry) {
        tip.style.display = "none";
        return;
      }

      const title = entry.dateISO;
      const body = entry.content || "";
      tip.innerHTML = `<div class="hoverTip__date">${title}</div><div class="hoverTip__text"></div>`;
      const textNode = tip.querySelector(".hoverTip__text");
      if (textNode) textNode.textContent = body;
      tip.style.display = "block";
      tip.style.left = `${clientX + 14}px`;
      tip.style.top = `${clientY + 14}px`;
    };

    const onMove = (e) => {
      hoverClient = { x: e.clientX, y: e.clientY };
      updateHover(e.clientX, e.clientY);
    };

    const onLeave = () => {
      hoverBlockId = null;
      hoverClient = null;
      tip.style.display = "none";
      draw();
    };

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("touchstart", (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      updateHover(t.clientX, t.clientY);
    });
  }

  return () => {
    disposed = true;
    ro?.disconnect();
    if (pending) cancelAnimationFrame(pending);
    tip?.remove();
  };
}

function render() {
  const app = document.getElementById("app");
  if (!app) return;
  const state = readState();
  const route = activeRoute(state);

  const shell = el("div", { class: "shell" });
  const top = el("header", { class: "topbar" });
  top.append(
    el("div", { class: "brand" }, [el("div", { class: "logo", text: "HM" }), el("div", { class: "title", text: "Happiness Mosaic" })])
  );
  const tabs = el("nav", { class: "tabs", "aria-label": "主导航" });
  const mkTab = (key, text, href) =>
    el("a", { class: route === key ? "tab tab--active" : "tab", href, text });
  tabs.append(mkTab("record", "幸福记录", "#record"), mkTab("album", "幸福册子", "#album"));
  top.append(tabs);
  top.append(el("div", { class: "badge", text: state.activeTask ? "Active Task" : "No Active Task" }));
  shell.append(top);

  const main = el("main", { class: "main" });

  let overlay = null;
  let cleanupCanvas = null;

  const closeOverlay = () => {
    cleanupCanvas?.();
    cleanupCanvas = null;
    overlay?.remove();
    overlay = null;
  };

  const openOverlay = (content) => {
    closeOverlay();
    overlay = el("div", {
      class: "overlay",
      onmousedown: (e) => {
        if (e.target === e.currentTarget) closeOverlay();
      }
    });
    overlay.append(content);
    document.body.append(overlay);
  };

  if (route === "record") {
    main.append(
      el("div", { class: "hero" }, [
        el("h1", { text: "幸福记录" }),
        el("p", {
          text: state.activeTask ? "点击任务栏，记录一件幸福的事，随机点亮一块。" : "点一下 “+” 开始一张新的幸福拼图。"
        })
      ])
    );

    if (!state.activeTask) {
      const center = el("div", { class: "center" });
      const plus = el("button", {
        class: "plus",
        type: "button",
        "aria-label": "新建任务",
        onclick: () => {
          const patterns = builtinPatterns();
          let selectedId = patterns[0]?.id ?? "";
          let targetCount = 12;
          const body = el("div", { class: "modal" });
          body.append(
            el("div", { class: "modalHeader" }, [
              el("div", { class: "modalTitle", text: "开始一张新的幸福拼图" }),
              el("button", { class: "iconBtn", type: "button", text: "×", onclick: closeOverlay })
            ])
          );

          const content = el("div", { class: "modalBody" });
          const grid = el("div", { class: "patternGrid" });

          const paintGrid = () => {
            grid.replaceChildren();
            for (const p of patterns) {
              const btn = el("button", {
                type: "button",
                class: p.id === selectedId ? "patternOpt patternOpt--active" : "patternOpt",
                onclick: () => {
                  selectedId = p.id;
                  paintGrid();
                }
              });
              btn.append(el("img", { class: "thumb", src: p.thumbnailUrl || p.imageUrl, alt: p.title }));
              btn.append(el("div", { text: p.title, class: "pill" }));
              grid.append(btn);
            }
          };
          paintGrid();
          content.append(grid);

          const field = el("div", { class: "field" }, [el("label", { text: "希望记录的幸福事件数" })]);
          const sel = el("select", {
            onchange: (e) => {
              targetCount = Number(e.target.value);
            }
          });
          for (const n of [6, 9, 12, 15, 18, 24]) sel.append(el("option", { value: String(n), text: String(n) }));
          sel.value = String(targetCount);
          field.append(sel);
          content.append(field);

          const err = el("div", { class: "muted" });
          content.append(err);

          const row = el("div", { class: "row" });
          row.append(
            el("button", {
              class: "btn btnPrimary",
              type: "button",
              text: "创建任务",
              onclick: () => {
                try {
                  const st = readState();
                  const p = patterns.find((x) => x.id === selectedId);
                  if (!p) throw new Error("请选择一个图案");
                  const next = startTask(st, { pattern: p, targetCount });
                  writeState(next);
                  closeOverlay();
                  render();
                } catch (e) {
                  err.textContent = e instanceof Error ? e.message : "操作失败";
                }
              }
            })
          );
          row.append(el("button", { class: "btn", type: "button", text: "取消", onclick: closeOverlay }));
          content.append(row);

          body.append(content);
          openOverlay(body);
        }
      });
      plus.textContent = "+";
      center.append(plus);
      main.append(center);
    } else {
      const t = state.activeTask;
      const lane = el("div", { class: "center" });
      const card = el("div", { class: "card taskCard", role: "button", tabindex: "0" });
      const media = el("div", { class: "taskMedia" });
      const canvas = el("canvas", { class: "mosaic", "aria-label": "拼图预览" });
      media.append(canvas);
      card.append(media);
      const meta = el("div", { class: "taskMeta" });
      meta.append(el("div", { class: "taskTitle", text: t.pattern.title }));
      meta.append(
        el("div", { class: "pills" }, [
          el("span", { class: "pill", text: String(t.entries.length) }),
          el("span", { class: "pill pill--muted", text: "/" }),
          el("span", { class: "pill", text: String(t.targetCount) }),
          el("span", { class: "pill pill--muted", text: "点击记录一件幸福的事" })
        ])
      );
      card.append(meta);
      lane.append(card);
      main.append(lane);

      cleanupCanvas = mountMosaic(canvas, t);

      const openRecord = () => {
        const body = el("div", { class: "modal" });
        body.append(
          el("div", { class: "modalHeader" }, [
            el("div", { class: "modalTitle", text: "记录一件幸福的事" }),
            el("button", { class: "iconBtn", type: "button", text: "×", onclick: closeOverlay })
          ])
        );
        const content = el("div", { class: "modalBody" });
        const date = el("input", { type: "date", value: todayISO() });
        const txt = el("textarea", { rows: "4", placeholder: "写下今天让你开心的一件事…" });
        const err = el("div", { class: "muted" });
        content.append(el("div", { class: "field" }, [el("label", { text: "日期" }), date]));
        content.append(el("div", { class: "field" }, [el("label", { text: "幸福事件" }), txt]));
        content.append(err);
        const row = el("div", { class: "row" });
        row.append(
          el("button", {
            class: "btn btnPrimary",
            type: "button",
            text: "点亮一块",
            onclick: () => {
              try {
                const st = readState();
                const next = addEntryToState(st, { dateISO: date.value, content: txt.value.trim() });
                writeState(next);
                closeOverlay();
                render();
              } catch (e) {
                err.textContent = e instanceof Error ? e.message : "操作失败";
              }
            }
          })
        );
        row.append(
          el("button", {
            class: "btn danger",
            type: "button",
            text: "放弃任务",
            onclick: () => {
              const st = readState();
              writeState({ ...st, activeTask: null });
              closeOverlay();
              render();
            }
          })
        );
        content.append(row);
        body.append(content);
        openOverlay(body);
      };

      card.addEventListener("click", openRecord);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") openRecord();
      });
    }
  } else {
    main.append(
      el("div", { class: "hero" }, [
        el("h1", { text: "幸福册子" }),
        el("p", {
          text: state.completedTasks.length ? "这里会收集你完成的每一张幸福拼图。" : "还没有完成的作品。去「幸福记录」开始第一张。"
        })
      ])
    );

    const tasks = state.completedTasks.slice().sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    if (!tasks.length) {
      main.append(el("div", { class: "center" }, [el("div", { class: "muted", text: "先去「幸福记录」点一下 “+”。" })]));
    } else {
      const rows = el("div", { class: "albumRows" });
      for (const t of tasks) {
        const row = el("button", { type: "button", class: "albumRow" });
        row.append(el("img", { class: "albumThumb", src: t.pattern.thumbnailUrl || t.pattern.imageUrl, alt: t.pattern.title }));
        const meta = el("div", { class: "albumMeta" });
        meta.append(el("div", { class: "albumTitle", text: t.pattern.title }));
        meta.append(
          el("div", { class: "albumSub" }, [
            el("span", { class: "mini", text: `${t.entries.length} 条` }),
            el("span", { class: "mini", text: t.completedAt ? formatDateTime(t.completedAt) : "—" })
          ])
        );
        row.append(meta);
        row.append(el("div", { class: "albumChevron", text: "→", "aria-hidden": "true" }));

        row.addEventListener("click", () => {
          const body = el("div", { class: "modal" });
          body.append(
            el("div", { class: "modalHeader" }, [
              el("div", { class: "modalTitle", text: t.pattern.title }),
              el("button", { class: "iconBtn", type: "button", text: "×", onclick: closeOverlay })
            ])
          );
          const content = el("div", { class: "modalBody" });
          const canvas = el("canvas", { class: "mosaic mosaicLarge", "aria-label": "作品预览" });
          content.append(canvas);
          content.append(el("div", { class: "muted", text: "鼠标悬停在块上，查看对应的幸福事件。" }));
          body.append(content);
          openOverlay(body);
          cleanupCanvas = mountMosaic(canvas, t, { mode: "completed", enableHover: true });
        });

        rows.append(row);
      }
      main.append(rows);
    }
  }

  shell.append(main);
  app.replaceChildren(shell);
}

window.addEventListener("hashchange", () => render());
window.addEventListener("popstate", () => render());
render();
