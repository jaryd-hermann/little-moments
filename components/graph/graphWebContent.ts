/**
 * Generates the HTML document rendered inside the Graph WebView.
 *
 * Globals set before the script runs:
 *   window.__GRAPH_DATA__      — { nodes, edges }
 *   window.__GRAPH_THEME__     — palette + light/dark colours
 *   window.__GRAPH_INTRO__     — boolean, show Ellie first-open overlay
 *   window.__GRAPH_POSITIONS__ — optional { [id]: { x, y } } seed layout
 *   window.__GRAPH_HULL_MODE__ — 'theme' | 'person'
 *
 * WebView exposes after load:
 *   window.__applyFilter(f)        — dim non-matching nodes/edges
 *   window.__setHullMode(mode)     — 'theme' | 'person' | 'none'
 *   window.__exportSnapshot()      — renders SVG to PNG, posts dataUrl
 *   window.__playYearInReview()    — progressively reveals nodes/edges by date
 *
 * Posts back to RN via window.ReactNativeWebView:
 *   { type: 'nodeTap', id }
 *   { type: 'edgeTap', id }
 *   { type: 'dismissIntro' }
 *   { type: 'ready' }
 *   { type: 'settled', positions }
 *   { type: 'snapshot', dataUrl }
 *   { type: 'reviewDone' }
 */

import type { GraphNode, GraphEdge } from "@/hooks/useGraph";
import {
  CONNECTION_TYPE_STYLE,
  nodeColor,
  THEME_COLORS,
  type Theme,
} from "@/constants/GraphPalette";

export type HullMode = "theme" | "person" | "none";

export interface GraphWebContentOpts {
  nodes: GraphNode[];
  edges: GraphEdge[];
  theme: "light" | "dark";
  showIntro: boolean;
  d3Source: string;
  /** Seed positions for warm-start (from previous settled layout). */
  cachedPositions?: Record<string, { x: number; y: number }>;
  hullMode: HullMode;
}

interface SerializedNode {
  id: string;
  title: string | null;
  degree: number;
  color: string;
  lonely: boolean;
  primary_theme: string | null;
  canonicalPeople: string[];
  canonicalPlaces: string[];
  created_at: string;
}

interface SerializedEdge {
  id: string;
  source: string;
  target: string;
  color: string;
  dash: string | null;
  confidence: number;
}

function safeJSON(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function palette(theme: "light" | "dark") {
  if (theme === "light") {
    return {
      bg: "#FFFFFF",
      nodeStroke: "rgba(0,0,0,0.25)",
      edgeBase: "rgba(0,0,0,0.25)",
      hullLabelFill: "rgba(0,0,0,0.55)",    // subtle — node title labels
      hullLabelStrong: "rgba(0,0,0,0.82)", // bold — cluster/theme labels
      hullOpacity: 0.03,                   // hulls are labels-only by default
      introBg: "rgba(255,255,255,0.95)",
      introText: "#1A1A1A",
      introAvatarBg: "#F0D7FF",
    };
  }
  return {
    bg: "#000000",
    nodeStroke: "rgba(255,255,255,0.2)",
    edgeBase: "rgba(255,255,255,0.25)",
    hullLabelFill: "rgba(255,255,255,0.6)",
    hullLabelStrong: "rgba(255,255,255,0.92)",
    hullOpacity: 0.04,  // labels-only — fills barely register
    introBg: "rgba(0,0,0,0.92)",
    introText: "#FFFFFF",
    introAvatarBg: "#F0D7FF",
  };
}

export function graphWebContent(opts: GraphWebContentOpts): string {
  const p = palette(opts.theme);

  const serialNodes: SerializedNode[] = opts.nodes.map((n) => ({
    id: n.id,
    title: n.title,
    degree: n.degree,
    color: nodeColor(n.primary_theme, n.primary_emotion),
    lonely: n.degree === 0,
    primary_theme: n.primary_theme,
    canonicalPeople: n.canonicalPeople,
    canonicalPlaces: n.canonicalPlaces,
    created_at: n.created_at,
  }));

  const serialEdges: SerializedEdge[] = opts.edges.map((e) => {
    const style =
      CONNECTION_TYPE_STYLE[e.connection_type] ??
      CONNECTION_TYPE_STYLE.thematic;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      color: style.color,
      dash: style.dash ?? null,
      confidence: e.confidence,
    };
  });

  const dataJSON = safeJSON({ nodes: serialNodes, edges: serialEdges });
  const themeJSON = safeJSON(p);
  const themeColorsJSON = safeJSON(THEME_COLORS as Record<Theme, string>);
  const positionsJSON = safeJSON(opts.cachedPositions ?? null);
  const hullModeJSON = safeJSON(opts.hullMode);
  const introFlag = opts.showIntro ? "true" : "false";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      background: ${p.bg}; overflow: hidden; overscroll-behavior: none;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
    svg#graph { display: block; width: 100vw; height: 100vh; touch-action: none; }
    circle.node { transition: r 160ms ease-out, opacity 0.25s ease; }
    line.edge  { transition: stroke-opacity 0.25s ease; }

    #intro {
      position: fixed; inset: 0; display: ${opts.showIntro ? "flex" : "none"};
      align-items: center; justify-content: center;
      background: ${p.introBg};
      z-index: 10; padding: 24px;
    }
    #intro-card { max-width: 320px; text-align: center; color: ${p.introText}; }
    #intro-avatar {
      width: 48px; height: 48px; border-radius: 12px;
      background: ${p.introAvatarBg};
      margin: 0 auto 14px;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px;
    }
    #intro-title { font-size: 17px; font-weight: 600; margin-bottom: 10px; }
    #intro-body  { font-size: 15px; line-height: 22px; opacity: 0.85; margin-bottom: 20px; }
    #intro-button {
      display: inline-block; padding: 10px 22px; border-radius: 999px;
      background: ${p.introAvatarBg}; color: #1A1A1A;
      font-size: 14px; font-weight: 500; border: 2px solid #000; cursor: pointer;
    }

    #empty {
      position: fixed; inset: 0; display: none;
      align-items: center; justify-content: center;
      color: ${p.introText}; opacity: 0.5;
      font-size: 14px; text-align: center; padding: 24px;
    }
  </style>
</head>
<body>
  <svg id="graph"></svg>

  <div id="intro">
    <div id="intro-card">
      <div id="intro-avatar">✦</div>
      <div id="intro-title">Your memory map</div>
      <div id="intro-body">
        Each dot is a moment you've logged. Lines connect the ones I've found are related.
        The bigger the dot, the more it's woven into the rest of your story. Tap anything to explore.
      </div>
      <div id="intro-button" onclick="__dismissIntro()">Got it</div>
    </div>
  </div>

  <div id="empty">No moments to map yet — keep logging.</div>

  <script>${opts.d3Source}</script>
  <script>
    window.__GRAPH_DATA__      = ${dataJSON};
    window.__GRAPH_THEME__     = ${themeJSON};
    window.__GRAPH_THEME_COLORS__ = ${themeColorsJSON};
    window.__GRAPH_POSITIONS__ = ${positionsJSON};
    window.__GRAPH_INTRO__     = ${introFlag};
    window.__GRAPH_HULL_MODE__ = ${hullModeJSON};

    function post(msg) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      }
    }

    function __dismissIntro() {
      var el = document.getElementById('intro');
      if (el) el.style.display = 'none';
      post({ type: 'dismissIntro' });
    }
    window.__dismissIntro = __dismissIntro;

    (function() {
      var data = window.__GRAPH_DATA__;
      var theme = window.__GRAPH_THEME__;
      var themeColors = window.__GRAPH_THEME_COLORS__;
      var cachedPositions = window.__GRAPH_POSITIONS__;
      var hullMode = window.__GRAPH_HULL_MODE__;

      if (!data.nodes.length) {
        document.getElementById('empty').style.display = 'flex';
        post({ type: 'ready' });
        return;
      }

      var svg = d3.select('#graph');
      var width = window.innerWidth;
      var height = window.innerHeight;
      svg.attr('viewBox', '0 0 ' + width + ' ' + height);

      var g = svg.append('g').attr('class', 'viewport');

      // Layers — stacked bottom to top:
      //   hulls        → (unused, kept for potential future fill)
      //   spokes       → faint lines from each node to its cluster centroid
      //   links (glow) → wide translucent halos under thread edges
      //   links        → sharp core thread edges
      //   nodes        → the dots
      //   hull-labels  → bold cluster names
      //   node-labels  → entry titles (focus-gated)
      var hullLayer = g.append('g').attr('class', 'hulls');
      var spokeLayer = g.append('g').attr('class', 'spokes');
      var linkLayer = g.append('g').attr('class', 'links');
      var nodeLayer = g.append('g').attr('class', 'nodes');
      var hullLabelLayer = g.append('g').attr('class', 'hull-labels');
      var nodeLabelLayer = g.append('g').attr('class', 'node-labels');

      // Pan + pinch zoom. Label visibility is handled inside applyFocal
      // (via scheduleFocal) since it's per-node and driven by screen
      // position, not global zoom level. Hull labels are counter-scaled
      // to stay a constant size on screen.
      var zoom = d3.zoom()
        .scaleExtent([0.25, 4])
        .on('zoom', function(event) {
          g.attr('transform', event.transform);
          lastTransform = event.transform;
          scheduleFocal();
          updateHullLabelSize();
        });
      svg.call(zoom);

      function nodeRadius(d) {
        // Small default — the focal effect inflates them to ~current
        // size when they're under the user's gaze. Hubs still stand
        // out via degree scaling.
        return Math.min(8, 4 + d.degree * 0.35);
      }

      // Seed positions from cache if present — warm-start the simulation.
      if (cachedPositions) {
        data.nodes.forEach(function(n) {
          var cp = cachedPositions[n.id];
          if (cp) { n.x = cp.x; n.y = cp.y; }
        });
      }

      // Fit every node into the viewport. Force springs pull lonely
      // nodes into the main mass so excluding them is no longer needed
      // — and excluding them was leaving them invisibly off-screen.
      function fitToView(animate) {
        if (!data.nodes.length) return;

        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        data.nodes.forEach(function(n) {
          if (n.x < minX) minX = n.x;
          if (n.y < minY) minY = n.y;
          if (n.x > maxX) maxX = n.x;
          if (n.y > maxY) maxY = n.y;
        });
        var dx = Math.max(maxX - minX, 1);
        var dy = Math.max(maxY - minY, 1);
        var cx = (maxX + minX) / 2;
        var cy = (maxY + minY) / 2;
        var padding = 16;
        var scale = Math.min(
          (width  - padding * 2) / dx,
          (height - padding * 2) / dy
        );
        // Then tighten further — the fit should feel confidently filled,
        // not cautiously framed.
        scale *= 1.15;
        // Clamp to our scaleExtent: 0.25x..4x.
        scale = Math.max(0.25, Math.min(scale, 4));
        var tx = width / 2 - scale * cx;
        var ty = height / 2 - scale * cy;
        var t = d3.zoomIdentity.translate(tx, ty).scale(scale);
        if (animate) {
          svg.transition().duration(550).ease(d3.easeCubicOut).call(zoom.transform, t);
        } else {
          svg.call(zoom.transform, t);
        }
      }

      // ── Focal effect ─────────────────────────────────────────────
      // Nodes closer to the viewport center render slightly larger and
      // more opaque. Gives the map a sense of depth — the thing you're
      // looking at right now feels in focus, everything else recedes.
      // Called on every zoom change; throttled via rAF.
      var lastTransform = d3.zoomIdentity;
      var focalFramePending = false;

      // Labels are keyed to entry id so we can find the matching SVG
      // for a node in O(1) when updating focus-based label visibility.
      var labelByEntryId = {};
      function buildLabelIndex() {
        labels.each(function(d) {
          labelByEntryId[d.id] = this;
        });
      }

      function applyFocal() {
        focalFramePending = false;
        var t = lastTransform;
        var cx = width / 2;
        var cy = height / 2;
        var focusRadius = Math.min(width, height) * 0.38;

        node.each(function(d) {
          var sx = d.x * t.k + t.x;
          var sy = d.y * t.k + t.y;
          var dist = Math.hypot(sx - cx, sy - cy);
          var focus = Math.max(0, 1 - dist / focusRadius);  // 1 at centre, 0 at edge

          // Bubble effect — focused nodes inflate ~90%, giving them a
          // gentle pop feel as the user pans across the graph. CSS
          // transition on the radius smooths the change.
          var baseR = nodeRadius(d);
          d3.select(this).attr('r', baseR * (1 + focus * 0.9));

          // Labels appear purely based on focus. Positioned near the
          // (now larger) focused node's right edge so they don't sit
          // on top of the dot.
          var labelEl = labelByEntryId[d.id];
          if (!labelEl) return;
          if (focus > 0.22) {
            var lo = Math.min(1, (focus - 0.22) / 0.35);
            var focusedR = baseR * (1 + focus * 0.9);
            labelEl.setAttribute('x', d.x + focusedR + 3);
            labelEl.setAttribute('y', d.y);
            labelEl.setAttribute('opacity', lo);
          } else {
            labelEl.setAttribute('opacity', 0);
          }
        });
      }

      function scheduleFocal() {
        if (focalFramePending) return;
        focalFramePending = true;
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(applyFocal);
        } else {
          setTimeout(applyFocal, 16);
        }
      }

      // ── Cluster force: pulls every membership-key of each node
      //    toward its respective centroid. Nodes in multiple clusters
      //    (e.g. a moment mentioning two people) get pulled toward
      //    each of those centroids, naturally landing between them.
      //    Centroids are recomputed every tick so groups migrate
      //    organically rather than being pinned in place.
      var clusterMode = hullMode;           // mirrors __GRAPH_HULL_MODE__
      var clusterCenters = {};

      function clusterKeysFor(n) {
        if (clusterMode === 'theme') {
          return n.primary_theme ? [n.primary_theme] : [];
        }
        if (clusterMode === 'person') {
          return (n.canonicalPeople || []).slice();
        }
        return [];
      }

      function recomputeClusterCenters() {
        clusterCenters = {};
        if (clusterMode === 'none') return;
        var sums = {};
        var counts = {};
        data.nodes.forEach(function(n) {
          var keys = clusterKeysFor(n);
          for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (!sums[k]) { sums[k] = [0, 0]; counts[k] = 0; }
            sums[k][0] += n.x || 0;
            sums[k][1] += n.y || 0;
            counts[k] += 1;
          }
        });
        Object.keys(sums).forEach(function(k) {
          clusterCenters[k] = [sums[k][0] / counts[k], sums[k][1] / counts[k]];
        });
      }

      var CLUSTER_STRENGTH = 0.14;

      function forceCluster(alpha) {
        if (clusterMode === 'none') return;
        recomputeClusterCenters();
        data.nodes.forEach(function(n) {
          var keys = clusterKeysFor(n);
          if (!keys.length) return;
          // Divide pull across memberships — multi-cluster nodes sit
          // between their clusters instead of being yanked to just one.
          var pull = (CLUSTER_STRENGTH * alpha) / keys.length;
          for (var i = 0; i < keys.length; i++) {
            var c = clusterCenters[keys[i]];
            if (!c) continue;
            n.vx += (c[0] - (n.x || 0)) * pull;
            n.vy += (c[1] - (n.y || 0)) * pull;
          }
        });
      }

      // Dense "brain" layout: weak charge so nodes don't fling apart,
      // tight collision so they pack without overlap, soft x/y springs
      // pulling every node toward centre, and a cluster force pulling
      // same-theme / same-person nodes toward one another.
      var sim = d3.forceSimulation(data.nodes)
        .force('link', d3.forceLink(data.edges).id(function(d) { return d.id; }).distance(40).strength(0.65))
        .force('charge', d3.forceManyBody().strength(-65))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('x', d3.forceX(width  / 2).strength(0.04))
        .force('y', d3.forceY(height / 2).strength(0.04))
        .force('cluster', forceCluster)
        .force('collision', d3.forceCollide().radius(function(d) { return nodeRadius(d) + 3; }))
        .alpha(cachedPositions ? 0.4 : 1)
        .alphaDecay(0.028);

      // Thread edges — solid white, bright, visible against the dark
      // canvas. No glow layer: halos were spilling past node edges and
      // reading as "lines covering dots." Nodes render on a layer above
      // these, so line endpoints are fully tucked under each dot.
      var linkGlow = linkLayer.selectAll('line.link-glow')
        .data([])                 // glow retired; keep handle so filter / tick code stays consistent
        .enter()
        .append('line');

      var link = linkLayer.selectAll('line.edge')
        .data(data.edges)
        .enter()
        .append('line')
        .attr('class', 'edge')
        .attr('stroke', '#FFFFFF')
        .attr('stroke-width', function(d) { return 1.1 + (d.confidence || 0.5) * 0.9; })
        .attr('stroke-opacity', 0.85)
        .attr('stroke-linecap', 'butt')
        .style('cursor', 'pointer')
        .on('click', function(event, d) {
          event.stopPropagation();
          post({ type: 'edgeTap', id: d.id });
        });

      // ── Cluster spokes: one line from each node to each of its
      // cluster centroids. Multi-cluster nodes (e.g. a moment mentioning
      // two people, in person mode) get multiple spokes — visually
      // stitching them into every group they belong to.
      var spokes = spokeLayer.selectAll('line');

      function generateSpokeData() {
        var out = [];
        data.nodes.forEach(function(n) {
          var keys = clusterKeysFor(n);
          for (var i = 0; i < keys.length; i++) {
            out.push({ key: 'spoke:' + n.id + '|' + keys[i], node: n, clusterKey: keys[i] });
          }
        });
        return out;
      }

      function rebindSpokes() {
        var data2 = generateSpokeData();
        spokes = spokeLayer.selectAll('line').data(data2, function(d) { return d.key; });
        spokes.exit().remove();
        spokes = spokes.enter()
          .append('line')
          .attr('stroke', '#FFFFFF')
          .attr('stroke-width', 0.5)
          .attr('stroke-opacity', 0.2)
          .attr('stroke-linecap', 'butt')
          .attr('pointer-events', 'none')
          .merge(spokes);
      }

      function positionSpokes() {
        if (!spokes || !spokes.size()) return;
        spokes
          .attr('x1', function(d) { return d.node.x; })
          .attr('y1', function(d) { return d.node.y; })
          .attr('x2', function(d) {
            var c = clusterCenters[d.clusterKey];
            return c ? c[0] : d.node.x;
          })
          .attr('y2', function(d) {
            var c = clusterCenters[d.clusterKey];
            return c ? c[1] : d.node.y;
          });
      }

      rebindSpokes();

      // Nodes — no entrance transition on radius because the focal
      // effect updates it every rAF; the two would fight and the
      // stagger would flicker. Nodes appear at their sized radius
      // while the force sim spreads them into position. All nodes
      // render at full opacity; the filter path is the only thing
      // that dims them.
      var node = nodeLayer.selectAll('circle')
        .data(data.nodes)
        .enter()
        .append('circle')
        .attr('class', 'node')
        .attr('r', function(d) { return nodeRadius(d); })
        .attr('fill', function(d) { return d.color; })
        .attr('stroke', theme.nodeStroke)
        .attr('stroke-width', 1)
        .attr('opacity', 1)
        .style('cursor', 'pointer')
        .on('click', function(event, d) {
          event.stopPropagation();
          post({ type: 'nodeTap', id: d.id });
        });

      // ── Node labels ─────────────────────────────────────────────
      // Title sits to the right of each node. Hidden when the camera is
      // zoomed well out (would be illegible noise anyway), fades in as
      // soon as the user starts zooming in. Position writes are skipped
      // while invisible to keep the tick cheap on 500+ node archives.
      function truncateTitle(t) {
        if (!t) return '';
        var s = String(t);
        // Strip any stray HTML tags.
        s = s.replace(/<[^>]*>/g, '');
        // DECODE entities rather than strip them — some LLM-generated
        // titles stored letters as numeric entities (e.g. "Fir&#115;t"
        // for "First"), and stripping was replacing them with spaces.
        s = s.replace(/&#(\d+);/g, function(_, n) {
          var code = parseInt(n, 10);
          return isFinite(code) ? String.fromCharCode(code) : '';
        });
        s = s.replace(/&#x([0-9a-f]+);/gi, function(_, h) {
          var code = parseInt(h, 16);
          return isFinite(code) ? String.fromCharCode(code) : '';
        });
        s = s.replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, function(_, name) {
          var map = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
          return map[name.toLowerCase()];
        });
        s = s.trim();
        return s.length > 32 ? s.slice(0, 32) + '…' : s;
      }

      var labels = nodeLabelLayer.selectAll('text')
        .data(data.nodes.filter(function(d) { return !!d.title; }))
        .enter()
        .append('text')
        .attr('class', 'node-label')
        .attr('font-size', 6)
        .attr('font-family', 'Helvetica, Arial, sans-serif')
        .attr('fill', '#FFFFFF')
        .attr('fill-opacity', 0.7)
        .attr('opacity', 0)
        .attr('pointer-events', 'none')
        .attr('dominant-baseline', 'middle')
        .text(function(d) { return truncateTitle(d.title); });

      buildLabelIndex();

      // ── Cluster force + floating group labels ──────────────────
      // We no longer draw filled hulls — they were visually dominating
      // and ambiguous at screen edges. Instead the force sim pulls
      // same-theme (or same-person) nodes toward a shared centroid so
      // groups emerge spatially. A single bold label floats at each
      // centroid as a navigation cue.
      var hullLabel = null;
      var currentHullMode = hullMode;

      function hullGroups(mode) {
        var bucket = {};
        if (mode === 'theme') {
          data.nodes.forEach(function(n) {
            if (!n.primary_theme) return;
            (bucket[n.primary_theme] = bucket[n.primary_theme] || []).push(n);
          });
        } else if (mode === 'person') {
          data.nodes.forEach(function(n) {
            (n.canonicalPeople || []).forEach(function(p) {
              (bucket[p] = bucket[p] || []).push(n);
            });
          });
        }
        // Filter to groups with at least 2 members — smaller clusters
        // still deserve a label so the user can see what tiny sub-
        // clusters are (wordcloud-style: size scales with membership).
        return Object.keys(bucket)
          .filter(function(k) { return bucket[k].length >= 2; })
          .map(function(k) { return { key: k, nodes: bucket[k] }; });
      }

      function hullColor(group, mode) {
        if (mode === 'theme' && themeColors[group.key]) return themeColors[group.key];
        // Person / place: derive a stable pastel from the key hash.
        var h = 0;
        for (var i = 0; i < group.key.length; i++) {
          h = ((h << 5) - h + group.key.charCodeAt(i)) | 0;
        }
        var hue = Math.abs(h) % 360;
        return 'hsl(' + hue + ', 55%, 65%)';
      }

      function expandHull(pts, pad) {
        // Move each hull point outward from centroid by pad pixels.
        if (!pts || pts.length < 3) return pts;
        var cx = 0, cy = 0;
        pts.forEach(function(p) { cx += p[0]; cy += p[1]; });
        cx /= pts.length; cy /= pts.length;
        return pts.map(function(p) {
          var dx = p[0] - cx, dy = p[1] - cy;
          var len = Math.sqrt(dx*dx + dy*dy) || 1;
          return [p[0] + (dx/len) * pad, p[1] + (dy/len) * pad];
        });
      }

      // Wordcloud-style size mapping: small clusters get small labels,
      // big clusters get large ones. All measured in screen pixels —
      // counter-scaled by zoom below so they stay consistent.
      function hullLabelScreenPx(count) {
        return Math.min(24, Math.max(11, 8 + Math.sqrt(count) * 2.6));
      }

      function renderHulls() {
        var groups = currentHullMode === 'none' ? [] : hullGroups(currentHullMode);

        // Labels only — no paths. Spatial clustering conveys the grouping.
        hullLabel = hullLabelLayer.selectAll('text').data(groups, function(d) { return d.key; });
        hullLabel.exit().remove();
        hullLabel = hullLabel.enter()
          .append('text')
          .attr('text-anchor', 'middle')
          .attr('pointer-events', 'none')
          .attr('fill', theme.hullLabelStrong)
          .attr('font-weight', 700)
          .attr('letter-spacing', 0.4)
          .attr('font-family', 'Helvetica, Arial, sans-serif')
          .merge(hullLabel)
          .text(function(d) { return d.key; });
        updateHullLabelSize();
      }

      function updateHullLabelSize() {
        // Counter-scale font-size to the current zoom so labels stay
        // a consistent screen size whether zoomed out or deep in.
        if (!hullLabel || !hullLabel.size()) return;
        var t = (typeof lastTransform !== 'undefined' && lastTransform) ? lastTransform : { k: 1 };
        var k = Math.max(t.k || 1, 0.25);
        hullLabel.attr('font-size', function(d) {
          return hullLabelScreenPx(d.nodes.length) / k;
        });
      }

      renderHulls();
      window.__setHullMode = function(mode) {
        currentHullMode = mode;
        clusterMode = mode;
        renderHulls();
        rebindSpokes();
        // Wake the sim so the layout re-flows around the new grouping.
        sim.alpha(0.35).restart();
      };

      function positionLinkEnds(sel) {
        sel
          .attr('x1', function(d) { return d.source.x; })
          .attr('y1', function(d) { return d.source.y; })
          .attr('x2', function(d) { return d.target.x; })
          .attr('y2', function(d) { return d.target.y; });
      }

      sim.on('tick', function() {
        positionLinkEnds(linkGlow);
        positionLinkEnds(link);
        positionSpokes();
        node
          .attr('cx', function(d) { return d.x; })
          .attr('cy', function(d) { return d.y; });

        // scheduleFocal also handles label positions/opacity — one pass
        // per rAF keeps the hot loop cheap even on 500+ node archives.
        scheduleFocal();

        if (hullLabel && hullLabel.size()) {
          hullLabel
            .attr('x', function(group) {
              var sx = 0; group.nodes.forEach(function(n) { sx += n.x; });
              return sx / group.nodes.length;
            })
            .attr('y', function(group) {
              var sy = 0; group.nodes.forEach(function(n) { sy += n.y; });
              return sy / group.nodes.length;
            });
        }
      });

      // ── Filter ──────────────────────────────────────────────────
      window.__applyFilter = function(filter) {
        var anyActive = (filter.themes && filter.themes.length) ||
                        (filter.people && filter.people.length) ||
                        (filter.places && filter.places.length) ||
                        (filter.timeRange && filter.timeRange !== 'all');

        if (!anyActive) {
          node.attr('opacity', 1);
          link.attr('stroke-opacity', 0.85);
          return;
        }

        var cutoff = 0;
        if (filter.timeRange === 'year')    cutoff = Date.now() - 365*24*60*60*1000;
        if (filter.timeRange === '3months') cutoff = Date.now() -  90*24*60*60*1000;

        var themesSet = new Set(filter.themes || []);
        var peopleSet = new Set(filter.people || []);
        var placesSet = new Set(filter.places || []);

        var matchSet = new Set();
        data.nodes.forEach(function(n) {
          if (themesSet.size && (!n.primary_theme || !themesSet.has(n.primary_theme))) return;
          if (peopleSet.size && !n.canonicalPeople.some(function(p){ return peopleSet.has(p); })) return;
          if (placesSet.size && !n.canonicalPlaces.some(function(p){ return placesSet.has(p); })) return;
          if (cutoff && new Date(n.created_at).getTime() < cutoff) return;
          matchSet.add(n.id);
        });

        node.attr('opacity', function(d) {
          if (matchSet.has(d.id)) return 1;
          return 0.12;
        });
        function edgeOpacity(d, hi, lo) {
          var sid = typeof d.source === 'object' ? d.source.id : d.source;
          var tid = typeof d.target === 'object' ? d.target.id : d.target;
          return (matchSet.has(sid) && matchSet.has(tid)) ? hi : lo;
        }
        link.attr('stroke-opacity',     function(d) { return edgeOpacity(d, 0.92, 0.07); });
        linkGlow.attr('stroke-opacity', function(d) { return edgeOpacity(d, 0.25, 0.02); });
      };

      // ── Programmatic zoom (used by dev-mode simulator buttons) ─
      window.__zoomBy = function(factor) {
        svg.transition().duration(220).call(zoom.scaleBy, factor);
      };

      // ── Settle → fit to view + post positions back for caching ─
      var settleTimer = null;
      sim.on('end', function() {
        fitToView(true);
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(function() {
          var positions = {};
          data.nodes.forEach(function(n) {
            positions[n.id] = { x: Math.round(n.x * 100) / 100, y: Math.round(n.y * 100) / 100 };
          });
          post({ type: 'settled', positions: positions });
        }, 150);
      });

      // If we warm-started from cached positions, the sim converges fast
      // and we want the fit to kick in immediately.
      if (cachedPositions) {
        setTimeout(function() { fitToView(false); }, 50);
      }

      // ── Export snapshot ─────────────────────────────────────────
      // Inline the SVG, draw onto a @2x canvas, overlay a subtle
      // "Little Moments" watermark, then post the PNG data URL.
      window.__exportSnapshot = function() {
        try {
          var svgEl = document.getElementById('graph');
          var clone = svgEl.cloneNode(true);
          // Force concrete width/height so the serialized SVG rasterises reliably.
          clone.setAttribute('width', width);
          clone.setAttribute('height', height);
          clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          // Paint the page background into the snapshot.
          var bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          bgRect.setAttribute('x', '0');
          bgRect.setAttribute('y', '0');
          bgRect.setAttribute('width', width);
          bgRect.setAttribute('height', height);
          bgRect.setAttribute('fill', '${p.bg}');
          clone.insertBefore(bgRect, clone.firstChild);

          var xml = new XMLSerializer().serializeToString(clone);
          var svg64 = btoa(unescape(encodeURIComponent(xml)));
          var img = new Image();
          img.onload = function() {
            var scale = 2;
            var canvas = document.createElement('canvas');
            canvas.width = width * scale;
            canvas.height = height * scale;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width * scale, height * scale);

            // Watermark (bottom-right).
            ctx.font = (12 * scale) + 'px -apple-system, sans-serif';
            ctx.fillStyle = theme.hullLabelFill;
            ctx.textAlign = 'right';
            ctx.fillText('Little Moments · memory map', (width - 16) * scale, (height - 16) * scale);

            var dataUrl = canvas.toDataURL('image/png');
            post({ type: 'snapshot', dataUrl: dataUrl });
          };
          img.onerror = function() {
            post({ type: 'snapshot', dataUrl: null });
          };
          img.src = 'data:image/svg+xml;base64,' + svg64;
        } catch (e) {
          post({ type: 'snapshot', dataUrl: null });
        }
      };

      // ── Year-in-review: replay nodes + edges in creation order ──
      window.__playYearInReview = function() {
        // Hide everything, then stagger each node + its qualifying
        // edges in according to created_at.
        var sortedNodes = data.nodes.slice().sort(function(a, b) {
          return new Date(a.created_at) - new Date(b.created_at);
        });
        var revealedIds = {};
        node.attr('opacity', 0);
        link.attr('stroke-opacity', 0);

        var dur = Math.max(4000, Math.min(12000, sortedNodes.length * 80));
        var perNodeDelay = dur / Math.max(sortedNodes.length, 1);

        sortedNodes.forEach(function(n, i) {
          setTimeout(function() {
            revealedIds[n.id] = true;
            node.filter(function(d) { return d.id === n.id; })
              .transition().duration(180)
              .attr('opacity', n.degree === 0 ? 0.35 : 1);

            // Light up any edges whose both endpoints are now revealed.
            link.filter(function(d) {
              var sid = typeof d.source === 'object' ? d.source.id : d.source;
              var tid = typeof d.target === 'object' ? d.target.id : d.target;
              return (sid === n.id || tid === n.id) &&
                     revealedIds[sid] && revealedIds[tid];
            })
              .transition().duration(200)
              .attr('stroke-opacity', 0.7);
          }, i * perNodeDelay);
        });

        setTimeout(function() {
          post({ type: 'reviewDone' });
        }, dur + 300);
      };

      post({ type: 'ready' });
    })();
  </script>
</body>
</html>`;
}
