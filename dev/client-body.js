/**
 * Client bundle source for dsh-blend-preview.
 *
 * scripts/build-client.mjs replaces the viewer marker below with the renderer
 * from dev/viewer.js and writes lib/client.js. Edit this file for the UI and
 * dev/viewer.js for the renderer, then run `node scripts/build-client.mjs`.
 */
window.__ModuleLoader__.load({
  id: "dsh-blend-preview",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");

    /* @viewer */

    /** This package's copy namespace. */
    const NS = "blendPreview";
    /** Renderer identity: the registry definition id and the body slot key. */
    const BODY_ID = "dsh-blend-preview/blend";
    /** Route that converts and serves the scene; the Host half owns the same default. */
    const DEFAULT_ROUTE_PATH = "/api/blend-preview";
    /** Suffixes mirrored from the Host defaults. */
    const DEFAULT_EXTENSIONS = ["blend"];

    const zh = {
      blender: "Blender",
      loading: "正在用 Blender 导出预览…",
      loadingHint: "首次打开需要几秒，之后直接读缓存。",
      preparing: "正在读取场景信息…",
      elapsed: "已用 {seconds}s",
      failed: "无法预览这个场景",
      retry: "重试",
      reset: "重置视角",
      wireframe: "线框",
      spin: "自动旋转",
      info: "场景信息",
      hint: "拖动旋转 · 滚轮缩放 · 双击复位",
      size: "外形尺寸",
      objects: "对象",
      triangles: "三角面",
      materials: "材质",
      cameras: "相机",
      lights: "灯光",
      exportMeta: "{blender} · {size} GLB · {time}",
      cached: "缓存命中",
      exportedIn: "导出 {seconds}s",
      unit: "单位",
      scene: "场景",
      collections: "集合",
      noSceneInfo: "没有可显示的场景信息。",
      details: "Blender 日志",
      webglMissing: "这个浏览器/显卡组合不支持 WebGL，无法绘制 3D 预览。",
      readFailed: "无法读取这个文件。",
      unsupported: "这个文件无法被 Blender 打开，或者不是有效的 .blend。",
    };

    const en = {
      blender: "Blender",
      loading: "Exporting the preview with Blender…",
      loadingHint: "The first open takes a few seconds; later opens read the cache.",
      preparing: "Reading scene information…",
      elapsed: "{seconds}s elapsed",
      failed: "This scene could not be previewed",
      retry: "Retry",
      reset: "Reset view",
      wireframe: "Wireframe",
      spin: "Auto-rotate",
      info: "Scene info",
      hint: "Drag to orbit · Wheel to zoom · Double-click to reset",
      size: "Size",
      objects: "Objects",
      triangles: "Triangles",
      materials: "Materials",
      cameras: "Cameras",
      lights: "Lights",
      exportMeta: "{blender} · {size} GLB · {time}",
      cached: "cache hit",
      exportedIn: "exported in {seconds}s",
      unit: "Unit",
      scene: "Scene",
      collections: "Collections",
      noSceneInfo: "No scene information to show.",
      details: "Blender log",
      webglMissing: "This browser/GPU combination does not support WebGL, so the 3D preview cannot be drawn.",
      readFailed: "This file could not be read.",
      unsupported: "Blender could not open this file, or it is not a valid .blend.",
    };

    /** Scoped styles; every selector starts at the root attribute. */
    const STYLE = [
      '[data-blend-preview]{display:flex;flex-direction:column;flex:auto;height:100%;min-height:0;box-sizing:border-box;color:var(--dsw-alias-label-primary,#1f2329);font-size:12px}',
      '[data-blend-preview] .dsh-bp-toolbar{display:flex;align-items:center;gap:6px;flex:none;padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1))}',
      '[data-blend-preview] .dsh-bp-name{font-weight:600;font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '[data-blend-preview] .dsh-bp-actions{display:flex;gap:4px;margin-left:auto;flex:none}',
      '[data-blend-preview] .dsh-bp-button{appearance:none;border:0;border-radius:7px;padding:5px 8px;font:inherit;font-size:11px;line-height:1.2;cursor:pointer;color:var(--dsw-alias-label-primary,#1f2329);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));white-space:nowrap}',
      '[data-blend-preview] .dsh-bp-button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.12))}',
      '[data-blend-preview] .dsh-bp-button[data-active="true"]{background:var(--dsw-alias-interactive-bg-selected,rgba(64,128,255,.18));color:var(--dsw-alias-label-accent,#2c6ef2)}',
      '[data-blend-preview] .dsh-bp-viewport{position:relative;flex:1 1 auto;min-height:240px;min-width:0;overflow:hidden;background:radial-gradient(120% 100% at 50% 0%,#2a3446 0%,#141a24 55%,#0b0f16 100%)}',
      '[data-blend-preview] .dsh-bp-canvas{position:absolute;inset:0;display:block;width:100%;height:100%;touch-action:none;cursor:grab;outline:none}',
      '[data-blend-preview] .dsh-bp-canvas:active{cursor:grabbing}',
      '[data-blend-preview] .dsh-bp-badge{position:absolute;left:10px;top:10px;padding:4px 8px;border-radius:999px;background:rgba(9,13,20,.55);color:#dfe8f6;font-size:11px;letter-spacing:.01em;pointer-events:none;backdrop-filter:blur(6px)}',
      '[data-blend-preview] .dsh-bp-hint{position:absolute;left:10px;bottom:8px;color:rgba(223,232,246,.55);font-size:10.5px;pointer-events:none;user-select:none}',
      '[data-blend-preview] .dsh-bp-overlay{position:absolute;inset:0;display:grid;place-items:center;padding:20px;background:rgba(8,11,17,.72);backdrop-filter:blur(3px)}',
      '[data-blend-preview] .dsh-bp-card{width:min(420px,100%);color:#e8edf5;text-align:center;display:flex;flex-direction:column;gap:10px;align-items:center}',
      '[data-blend-preview] .dsh-bp-card[data-tone="error"]{text-align:left;align-items:stretch}',
      '[data-blend-preview] .dsh-bp-title{margin:0;font-size:13px;font-weight:600}',
      '[data-blend-preview] .dsh-bp-text{margin:0;font-size:11.5px;line-height:1.55;color:rgba(232,237,245,.72)}',
      '[data-blend-preview] .dsh-bp-code{margin:0;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10.5px;color:#ffb4b4}',
      '[data-blend-preview] .dsh-bp-spinner{width:22px;height:22px;border-radius:50%;border:2px solid rgba(255,255,255,.2);border-top-color:#7fa8ff;animation:dsh-bp-spin .8s linear infinite}',
      '@keyframes dsh-bp-spin{to{transform:rotate(360deg)}}',
      '[data-blend-preview] .dsh-bp-panel{flex:none;max-height:40%;overflow:auto;padding:10px 12px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.02))}',
      '[data-blend-preview] .dsh-bp-panel[data-open="false"]{display:none}',
      '[data-blend-preview] .dsh-bp-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 14px;margin-bottom:8px}',
      '[data-blend-preview] .dsh-bp-kv{display:flex;justify-content:space-between;gap:8px;min-width:0}',
      '[data-blend-preview] .dsh-bp-kv span:first-child{opacity:.6}',
      '[data-blend-preview] .dsh-bp-kv span:last-child{font-variant-numeric:tabular-nums;text-align:right;overflow-wrap:anywhere}',
      '[data-blend-preview] .dsh-bp-table{width:100%;border-collapse:collapse;font-size:11.5px}',
      '[data-blend-preview] .dsh-bp-table th{text-align:left;font-weight:500;opacity:.5;padding:2px 4px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}',
      '[data-blend-preview] .dsh-bp-table td{padding:3px 4px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.05));vertical-align:top}',
      '[data-blend-preview] .dsh-bp-table td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '[data-blend-preview] .dsh-bp-swatch{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px;vertical-align:-1px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.18)}',
      '[data-blend-preview] .dsh-bp-materials{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}',
      '[data-blend-preview] .dsh-bp-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 7px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));font-size:10.5px}',
      '[data-blend-preview] .dsh-bp-footer{margin-top:8px;font-size:10.5px;opacity:.55;display:flex;flex-wrap:wrap;gap:4px 10px}',
      '[data-blend-preview] .dsh-bp-details{margin-top:4px;font-size:10.5px;color:rgba(232,237,245,.7)}',
      '[data-blend-preview] .dsh-bp-details pre{max-height:180px;overflow:auto;white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,.25);padding:8px;border-radius:8px;margin:6px 0 0;font-size:10.5px}',
    ].join("\n");

    /** Install the scoped stylesheet once per document. */
    function installStyle() {
      if (typeof document === "undefined") return;
      const tagId = "dsh-blend-preview/client.css";
      if (document.querySelector('style[data-plugin-css="' + tagId + '"]') !== null) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-blend-preview";
      tag.dataset.pluginCss = tagId;
      tag.textContent = STYLE;
      document.head.appendChild(tag);
    }

    /** Fill `{key}` placeholders. */
    function fill(template, values) {
      return String(template).replace(/\{(\w+)\}/g, (whole, key) =>
        Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : whole
      );
    }

    /** A final path segment. */
    function basenameOf(path) {
      if (typeof path !== "string") return "";
      const normalized = path.replaceAll("\\", "/");
      return normalized.slice(normalized.lastIndexOf("/") + 1);
    }

    /** Human byte size, or the empty string when unknown. */
    function formatBytes(bytes) {
      if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "";
      const units = ["B", "KB", "MB", "GB", "TB"];
      let value = bytes;
      let unit = 0;
      while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
      }
      const rounded = unit === 0 ? String(Math.round(value)) : value.toFixed(value >= 100 ? 0 : 1);
      return rounded + " " + units[unit];
    }

    /** Thousands separators without depending on the UI locale. */
    function formatCount(value) {
      if (typeof value !== "number" || !Number.isFinite(value)) return "0";
      return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    /** One dimension triple in millimetres. */
    function formatSize(values) {
      if (!Array.isArray(values) || values.length < 3) return "—";
      return values
        .slice(0, 3)
        .map((value) => (typeof value === "number" && Number.isFinite(value) ? String(Math.round(value * 10) / 10) : "0"))
        .join(" × ") + " mm";
    }

    /** The route the Host half actually registered, as injected at boot. */
    function configuredConfig() {
      const config = globalThis.__DSH_BLEND_PREVIEW_CONFIG__;
      const routePath =
        typeof config === "object" && config !== null && typeof config.routePath === "string" && config.routePath !== ""
          ? config.routePath
          : DEFAULT_ROUTE_PATH;
      const extensions =
        typeof config === "object" && config !== null && Array.isArray(config.extensions) && config.extensions.length > 0
          ? config.extensions.filter((entry) => typeof entry === "string" && entry !== "")
          : DEFAULT_EXTENSIONS;
      return { routePath, extensions };
    }

    /** The route URL for one artifact of one file version. */
    function assetUrl(routePath, absolutePath, kind, version) {
      return (
        routePath +
        "?path=" +
        encodeURIComponent(absolutePath) +
        "&kind=" +
        encodeURIComponent(kind) +
        "&v=" +
        encodeURIComponent(version)
      );
    }

    /** The material swatch for one scene object. */
    function swatchFor(object, materials) {
      const names = Array.isArray(object.materials) ? object.materials.filter(Boolean) : [];
      for (const name of names) {
        const material = materials.find((entry) => entry.name === name);
        if (material && typeof material.hex === "string") return material.hex;
      }
      return "#8a94a6";
    }

    /**
     * The preview body: fetch the scene JSON and the exported GLB, draw the
     * model, and show the scene facts underneath.
     * @param props - document body props plus the injected route and copy.
     * @returns the preview, or its loading/error state.
     */
    function BlendBody(props) {
      const { content, resourceAddress, useResource, t, routePath } = props;
      const meta = useResource(resourceAddress);
      const absolutePath = meta.value && meta.value.absolutePath ? meta.value.absolutePath : undefined;
      const version = meta.value && meta.value.version ? meta.value.version : "0";
      const revision = content !== undefined && content.kind === "renderer" ? content.revision : 0;
      const tRef = React.useRef(t);
      tRef.current = t;

      const viewerRef = React.useRef(null);
      const viewerErrorRef = React.useRef("");
      const [viewerError, setViewerError] = React.useState("");
      const [state, setState] = React.useState("loading");
      const [payload, setPayload] = React.useState(null);
      const [stats, setStats] = React.useState(null);
      const [failure, setFailure] = React.useState(null);
      const [attempt, setAttempt] = React.useState(0);
      const [elapsed, setElapsed] = React.useState(0);
      const [panelOpen, setPanelOpen] = React.useState(true);
      const [wireframe, setWireframe] = React.useState(false);
      const [autoRotate, setAutoRotate] = React.useState(false);
      const reported = React.useRef(-1);

      const settle = React.useCallback(
        (ok, fileVersion) => {
          if (reported.current === revision) return;
          reported.current = revision;
          if (content === undefined || content.kind !== "renderer") return;
          if (ok) content.loaded(fileVersion);
          else content.failed();
        },
        [content, revision]
      );
      const settleRef = React.useRef(settle);
      settleRef.current = settle;

      // The canvas only exists once the resource metadata resolves, so the
      // viewer is created from the ref callback rather than a mount effect.
      const attachCanvas = React.useCallback((node) => {
        if (node === null) {
          viewerRef.current?.dispose();
          viewerRef.current = null;
          return;
        }
        if (viewerRef.current !== null) return;
        try {
          viewerRef.current = createViewer(node, {});
          viewerErrorRef.current = "";
          setViewerError("");
        } catch (error) {
          const message = String(error && error.message ? error.message : error);
          viewerErrorRef.current = message;
          setViewerError(message);
          // The failure is shown in the overlay; the console line keeps the
          // shader/context detail reachable when the overlay is not enough.
          console.error("[blend-preview] viewer init failed:", error);
        }
      }, []);

      React.useEffect(() => {
        viewerRef.current?.setWireframe(wireframe);
      }, [wireframe]);

      React.useEffect(() => {
        viewerRef.current?.setAutoRotate(autoRotate);
      }, [autoRotate]);

      React.useEffect(() => {
        if (absolutePath === undefined) return undefined;
        const controller = new AbortController();
        let tick = 0;
        const timer = setInterval(() => {
          tick += 1;
          setElapsed(tick);
        }, 1000);
        setState("loading");
        setFailure(null);
        setPayload(null);
        setStats(null);
        setElapsed(0);

        (async () => {
          const infoResponse = await fetch(assetUrl(routePath, absolutePath, "info", version), {
            signal: controller.signal,
            credentials: "same-origin",
          });
          const infoBody = await infoResponse.json().catch(() => null);
          if (!infoResponse.ok) {
            throw infoBody && infoBody.error ? infoBody.error : { message: tRef.current("readFailed"), code: "HTTP_" + String(infoResponse.status) };
          }
          if (controller.signal.aborted) return;
          setPayload(infoBody);
          setState("exporting");

          const glbResponse = await fetch(assetUrl(routePath, absolutePath, "glb", version), {
            signal: controller.signal,
            credentials: "same-origin",
          });
          if (!glbResponse.ok) {
            const glbBody = await glbResponse.json().catch(() => null);
            throw glbBody && glbBody.error ? glbBody.error : { message: tRef.current("readFailed"), code: "HTTP_" + String(glbResponse.status) };
          }
          const bytes = await glbResponse.arrayBuffer();
          if (controller.signal.aborted) return;
          const viewer = viewerRef.current;
          if (viewer === null) {
            const detail = viewerErrorRef.current;
            throw {
              message: tRef.current("webglMissing") + (detail === "" ? "" : " " + detail),
              code: "WEBGL_MISSING",
            };
          }
          const modelStats = viewer.setModel(bytes);
          setStats(modelStats);
          setState("ready");
          settleRef.current(true, version);
        })().catch((error) => {
          if (controller.signal.aborted) return;
          setFailure({
            code: typeof error?.code === "string" ? error.code : "UNKNOWN",
            message: error instanceof Error ? error.message : String(error?.message ?? error),
            hint: error?.hint,
            detail: error?.detail,
          });
          setState("failed");
          settleRef.current(false, version);
        });

        return () => {
          controller.abort();
          clearInterval(timer);
        };
      }, [absolutePath, version, attempt, routePath]);

      if (absolutePath === undefined) {
        const failed = meta.status === "failed";
        return React.createElement(
          "div",
          { "data-blend-preview": true, "data-blend-state": failed ? "failed" : "loading" },
          React.createElement(
            "div",
            { className: "dsh-bp-viewport" },
            React.createElement(
              "div",
              { className: "dsh-bp-overlay" },
              failed
                ? React.createElement(
                    "div",
                    { className: "dsh-bp-card", "data-tone": "error" },
                    React.createElement("p", { className: "dsh-bp-title" }, t("failed")),
                    React.createElement("p", { className: "dsh-bp-text" }, t("readFailed")),
                    React.createElement(
                      "button",
                      { type: "button", className: "dsh-bp-button", onClick: () => setAttempt((value) => value + 1) },
                      t("retry")
                    )
                  )
                : React.createElement(
                    "div",
                    { className: "dsh-bp-card" },
                    React.createElement("div", { className: "dsh-bp-spinner" }),
                    React.createElement("p", { className: "dsh-bp-text" }, t("preparing"))
                  )
            )
          )
        );
      }

      const scene = payload && payload.scene ? payload.scene : null;
      const counts = scene && scene.counts ? scene.counts : null;
      const materials = scene && Array.isArray(scene.materials) ? scene.materials : [];
      const objects = scene && Array.isArray(scene.objects)
        ? scene.objects.filter((entry) => entry.type === "MESH" && entry.visible !== false)
        : [];
      const name = scene && scene.file_name ? scene.file_name : basenameOf(absolutePath);
      const triangles = stats !== null ? stats.triangles : counts !== null ? counts.triangles : 0;

      const loading = state === "loading" || state === "exporting";
      const toolbar = React.createElement(
        "div",
        { className: "dsh-bp-toolbar" },
        React.createElement("div", { className: "dsh-bp-name", title: absolutePath }, name),
        React.createElement(
          "div",
          { className: "dsh-bp-actions" },
          React.createElement(
            "button",
            {
              type: "button",
              className: "dsh-bp-button",
              title: t("reset") + " (Home)",
              "data-blend-action": "reset",
              onClick: () => viewerRef.current?.resetView(),
            },
            t("reset")
          ),
          React.createElement(
            "button",
            {
              type: "button",
              className: "dsh-bp-button",
              title: t("wireframe"),
              "data-blend-action": "wireframe",
              "data-active": wireframe ? "true" : "false",
              "aria-pressed": wireframe ? "true" : "false",
              onClick: () => setWireframe((value) => !value),
            },
            t("wireframe")
          ),
          React.createElement(
            "button",
            {
              type: "button",
              className: "dsh-bp-button",
              title: t("spin"),
              "data-blend-action": "spin",
              "data-active": autoRotate ? "true" : "false",
              "aria-pressed": autoRotate ? "true" : "false",
              onClick: () => setAutoRotate((value) => !value),
            },
            t("spin")
          ),
          React.createElement(
            "button",
            {
              type: "button",
              className: "dsh-bp-button",
              title: t("info"),
              "data-blend-action": "info",
              "data-active": panelOpen ? "true" : "false",
              "aria-pressed": panelOpen ? "true" : "false",
              onClick: () => setPanelOpen((value) => !value),
            },
            t("info")
          )
        )
      );

      const overlay = loading
        ? React.createElement(
            "div",
            { className: "dsh-bp-overlay" },
            React.createElement(
              "div",
              { className: "dsh-bp-card" },
              React.createElement("div", { className: "dsh-bp-spinner" }),
              React.createElement("p", { className: "dsh-bp-title" }, t("loading")),
              React.createElement("p", { className: "dsh-bp-text" }, t("loadingHint")),
              React.createElement("p", { className: "dsh-bp-text", "data-blend-elapsed": true }, fill(t("elapsed"), { seconds: elapsed }))
            )
          )
        : state === "failed"
          ? React.createElement(
              "div",
              { className: "dsh-bp-overlay" },
              React.createElement(
                "div",
                { className: "dsh-bp-card", "data-tone": "error" },
                React.createElement("p", { className: "dsh-bp-title" }, t("failed")),
                React.createElement("p", { className: "dsh-bp-code", "data-blend-error-code": true }, failure?.code ?? ""),
                React.createElement("p", { className: "dsh-bp-text", "data-blend-error-message": true }, failure?.message ?? ""),
                failure?.hint ? React.createElement("p", { className: "dsh-bp-text" }, failure.hint) : null,
                React.createElement(
                  "button",
                  {
                    type: "button",
                    className: "dsh-bp-button",
                    "data-blend-action": "retry",
                    onClick: () => setAttempt((value) => value + 1),
                  },
                  t("retry")
                ),
                failure?.detail
                  ? React.createElement(
                      "details",
                      { className: "dsh-bp-details" },
                      React.createElement("summary", null, t("details")),
                      React.createElement("pre", null, failure.detail)
                    )
                  : null
              )
            )
          : null;

      const viewport = React.createElement(
        "div",
        { className: "dsh-bp-viewport" },
        React.createElement("canvas", {
          ref: attachCanvas,
          className: "dsh-bp-canvas",
          "data-blend-canvas": true,
          tabIndex: 0,
          "aria-label": name,
        }),
        state === "ready"
          ? React.createElement(
              "div",
              { className: "dsh-bp-badge", "data-blend-badge": true },
              formatCount(triangles) + " " + t("triangles")
            )
          : null,
        state === "ready" ? React.createElement("div", { className: "dsh-bp-hint" }, t("hint")) : null,
        overlay,
        viewerError !== "" && state !== "failed"
          ? React.createElement(
              "div",
              { className: "dsh-bp-overlay" },
              React.createElement(
                "div",
                { className: "dsh-bp-card", "data-tone": "error" },
                React.createElement("p", { className: "dsh-bp-title" }, t("failed")),
                React.createElement("p", { className: "dsh-bp-text" }, t("webglMissing")),
                React.createElement("p", { className: "dsh-bp-code" }, viewerError)
              )
            )
          : null
      );

      const summaryRows = [];
      if (scene !== null) {
        summaryRows.push([t("size"), formatSize(scene.bounds ? scene.bounds.size_mm : null)]);
        summaryRows.push([t("objects"), formatCount(counts ? counts.visible_meshes : objects.length)]);
        summaryRows.push([t("triangles"), formatCount(triangles)]);
        summaryRows.push([t("materials"), formatCount(counts ? counts.materials : materials.length)]);
        if (counts && (counts.cameras > 0 || counts.lights > 0)) {
          summaryRows.push([t("cameras"), formatCount(counts.cameras)]);
          summaryRows.push([t("lights"), formatCount(counts.lights)]);
        }
        summaryRows.push([t("scene"), scene.scene ?? "—"]);
        summaryRows.push([t("unit"), scene.unit ? `${scene.unit.length_unit} (${scene.unit.millimeters_per_unit} mm/unit)` : "—"]);
      }

      const objectRows = objects.map((entry) =>
        React.createElement(
          "tr",
          { key: entry.name, "data-blend-object": entry.name },
          React.createElement(
            "td",
            null,
            React.createElement("span", {
              className: "dsh-bp-swatch",
              style: { background: swatchFor(entry, materials) },
            }),
            entry.name
          ),
          React.createElement("td", { className: "num" }, formatCount(entry.triangles)),
          React.createElement("td", { className: "num" }, formatSize(entry.dims_mm))
        )
      );

      const panel = React.createElement(
        "div",
        { className: "dsh-bp-panel", "data-blend-panel": true, "data-open": panelOpen ? "true" : "false" },
        scene === null
          ? React.createElement("p", { className: "dsh-bp-text" }, t("noSceneInfo"))
          : React.createElement(
              React.Fragment,
              null,
              React.createElement(
                "div",
                { className: "dsh-bp-summary" },
                summaryRows.map(([label, value]) =>
                  React.createElement(
                    "div",
                    { className: "dsh-bp-kv", key: label },
                    React.createElement("span", null, label),
                    React.createElement("span", { title: value }, value)
                  )
                )
              ),
              objectRows.length > 0
                ? React.createElement(
                    "table",
                    { className: "dsh-bp-table" },
                    React.createElement(
                      "thead",
                      null,
                      React.createElement(
                        "tr",
                        null,
                        React.createElement("th", null, t("objects")),
                        React.createElement("th", { className: "num" }, t("triangles")),
                        React.createElement("th", { className: "num" }, t("size"))
                      )
                    ),
                    React.createElement("tbody", null, objectRows)
                  )
                : null,
              materials.length > 0
                ? React.createElement(
                    "div",
                    { className: "dsh-bp-materials" },
                    materials.map((material) =>
                      React.createElement(
                        "span",
                        { className: "dsh-bp-chip", key: material.name, title: material.name },
                        React.createElement("span", {
                          className: "dsh-bp-swatch",
                          style: { background: material.hex || "#8a94a6", marginRight: "0" },
                        }),
                        material.name
                      )
                    )
                  )
                : null,
              React.createElement(
                "div",
                { className: "dsh-bp-footer" },
                React.createElement(
                  "span",
                  null,
                  fill(t("exportMeta"), {
                    blender: payload && payload.blender ? payload.blender : scene.blender ?? "Blender",
                    size: formatBytes(payload && payload.cache ? payload.cache.glbBytes : 0),
                    time:
                      payload && payload.cache && payload.cache.cached
                        ? t("cached")
                        : fill(t("exportedIn"), {
                            seconds:
                              payload && payload.cache && typeof payload.cache.elapsedMs === "number"
                                ? (payload.cache.elapsedMs / 1000).toFixed(1)
                                : "?",
                          }),
                  })
                ),
                counts !== null && typeof counts.collections === "number"
                  ? React.createElement("span", null, `${t("collections")}: ${formatCount(counts.collections)}`)
                  : null
              )
            )
      );

      return React.createElement(
        "div",
        {
          "data-blend-preview": true,
          "data-blend-state": state,
          "data-blend-triangles": String(triangles),
        },
        toolbar,
        viewport,
        panel
      );
    }

    const inject = ["slots", "locale", "resources", "documentPreviews"];

    /**
     * Register the Blender renderer and its body for the plugin's lifetime.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      installStyle();
      const t = ctx.locale.bind(NS);
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "blend-preview: dictionaries");
      const config = configuredConfig();
      const bodyInject = () => ({ routePath: config.routePath, t });
      ctx.effect(
        () =>
          ctx.documentPreviews.register({
            id: BODY_ID,
            extensions: config.extensions,
            binaryExtensions: config.extensions,
            priority: "extension",
            title: () => t("blender"),
            loading: "renderer",
            wrap: false,
          }),
        "blend-preview: metadata"
      );
      ctx.effect(
        () =>
          ctx.slots.inject("sidebar.right.tab.document", () =>
            ctx.slots.register(
              {
                name: "sidebar.right.tab.document",
                key: BODY_ID,
                locale: NS,
                inject: bodyInject,
              },
              BlendBody
            )
          ),
        "blend-preview: body"
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.__createViewer = createViewer;
    return module.exports;
  },
});
