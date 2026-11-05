/* SPDX-License-Identifier: GPL-3.0-only */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DeviceScaleLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TEXT_STYLE = Object.freeze({ padding: 8, fontSize: 14, lineHeight: 18,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' });
  const words = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;
  const graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  const container = node => node.type === 'container';
  const mode = (node, axis) => node[axis === 'x' ? 'widthMode' : 'heightMode'] || 'fixed';
  const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const positive = value => Math.max(0, finite(value));
  const splitGraphemes = text => graphemes ? Array.from(graphemes.segment(text), part => part.segment) : Array.from(text);
  const defaultMeasure = text => splitGraphemes(text).length * TEXT_STYLE.fontSize / 2;
  const paddingOf = node => ({ top: positive(node.padding?.top), right: positive(node.padding?.right),
    bottom: positive(node.padding?.bottom), left: positive(node.padding?.left) });
  const gapOf = node => positive(node.gap === undefined ? 8 : node.gap);
  const layoutOf = node => node.layout || 'free';
  const anchorOf = (node, axis) => node[axis === 'x' ? 'anchorX' : 'anchorY'] || 'free';
  const offsetOf = (node, axis, available) => finite(node[axis]) * (node.posUnit === '%' ? available / 100 : 1);
  const label = node => node.name || node.id || 'Object';

  // Return strings at logical coordinates, without a height limit. The renderer
  // can clip these same lines; Fit height includes all of them.
  function textLines(text, width, measureText = defaultMeasure) {
    text = String(text || '');
    const available = positive(width) - 2 * TEXT_STYLE.padding, lines = [];
    if (!text || available <= 0) return lines;
    const measure = value => positive(measureText(value));
    for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
      const tokens = words ? Array.from(words.segment(paragraph), part => part.segment) : paragraph.match(/\s+|\S+/gu) || [];
      let line = '';
      for (const word of tokens) {
        if (measure(line + word) <= available) { line += word; continue; }
        if (line) { lines.push(line.trimEnd()); line = ''; }
        for (const character of splitGraphemes(word.trimStart())) {
          if (line && measure(line + character) > available) { lines.push(line); line = ''; }
          line += character;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  function validateLayout(nodes) {
    if (!Array.isArray(nodes)) throw Error('Layout objects must be an array.');
    const ids = new Set(), ancestors = new Set();
    let rectangleCount = 0, containerCount = 0;
    function visit(list, nesting) {
      for (const node of list) {
        if (!node || typeof node !== 'object' || Array.isArray(node)) throw Error('Every layout object must be an object.');
        if (ancestors.has(node)) throw Error('A container cannot contain itself or its ancestors.');
        if (typeof node.id !== 'string' || !node.id || ids.has(node.id)) throw Error('Layout object IDs must be present and unique.');
        ids.add(node.id);
        if (node.type !== undefined && !['rectangle', 'container'].includes(node.type)) throw Error('Unsupported layout object type.');
        for (const axis of ['x', 'y']) if (!['fixed', 'fill', 'fit'].includes(mode(node, axis))) throw Error('Unsupported size mode.');
        if (!container(node)) {
          if (++rectangleCount > 80) throw Error('A project supports up to 80 rectangles.');
          if (node.children !== undefined) throw Error('Only containers can have children.');
          continue;
        }
        if (++containerCount > 80) throw Error('A project supports up to 80 containers.');
        if (nesting >= 8) throw Error('Containers support up to eight nesting levels.');
        if (!Array.isArray(node.children)) throw Error('Container children must be an array.');
        if (!['free', 'horizontal', 'vertical', 'overlay'].includes(layoutOf(node))) throw Error('Unsupported container layout.');
        for (const axis of ['x', 'y']) {
          if (mode(node, axis) !== 'fit') continue;
          const dimension = axis === 'x' ? 'width' : 'height';
          for (const child of node.children) {
            if (!child || typeof child !== 'object') throw Error('Every layout object must be an object.');
            if (mode(child, axis) === 'fill' || (mode(child, axis) === 'fixed' && child.sizeUnit === '%')) {
              throw Error(label(node) + ': Fit ' + dimension + ' cannot contain a child using Fill or percentage ' + dimension + '.');
            }
            if (layoutOf(node) === 'free' && (child.posUnit === '%' || !['free', axis === 'x' ? 'leading' : 'top'].includes(anchorOf(child, axis)))) {
              throw Error(label(node) + ': Fit ' + dimension + ' in a Free group requires pixel positions and leading/top anchors.');
            }
            if (layoutOf(node) === 'overlay' && (child.posUnit === '%' || finite(child[axis]) !== 0)) {
              throw Error(label(node) + ': Fit ' + dimension + ' in an Overlay stack requires zero pixel offsets.');
            }
          }
        }
        ancestors.add(node);visit(node.children, nesting + 1);ancestors.delete(node);
      }
    }
    visit(nodes, 0);
    return { rectangles: rectangleCount, containers: containerCount };
  }

  function walk(nodes) {
    const entries = [];
    function visit(siblings) {
      siblings.forEach(node => {
        entries.push(node);
        if (container(node)) visit(node.children || []);
      });
    }
    visit(nodes);return entries;
  }

  function find(nodes, id) {
    function visit(siblings, parent, depth) {
      for (let index = 0; index < siblings.length; index++) {
        const node = siblings[index];
        if (node.id === id) return { node, parent, index, siblings, depth };
        if (container(node)) { const match = visit(node.children || [], node, depth + 1);if (match) return match; }
      }
      return null;
    }
    return visit(nodes, null, 0);
  }

  function cloneSubtree(node, uid) {
    if (typeof uid !== 'function') throw Error('A new-ID function is required to duplicate objects.');
    const clone = { ...node, id: uid() };
    if (node.padding) clone.padding = { ...node.padding };
    if (container(node)) clone.children = node.children.map(child => cloneSubtree(child, uid));
    return clone;
  }

  function resolve(nodes, width, height, options = {}) {
    validateLayout(nodes);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) throw Error('Viewport dimensions must be finite and nonnegative.');
    const measureText = options.measureText || defaultMeasure;
    const items = [], byId = new Map(), warnings = [];
    const epsilon = 0.000001;

    function fixed(node, axis, available) {
      return positive(node[axis === 'x' ? 'w' : 'h']) * (node.sizeUnit === '%' ? available / 100 : 1);
    }
    function widthOf(node, available) {
      if (mode(node, 'x') === 'fixed') return fixed(node, 'x', available);
      if (mode(node, 'x') === 'fill') return positive(available);
      if (!container(node)) {
        const lines = String(node.description || '').replace(/\r\n?/g, '\n').split('\n');
        return Math.max(0, ...lines.map(line => positive(measureText(line)))) + 2 * TEXT_STYLE.padding;
      }
      const p = paddingOf(node), layout = layoutOf(node);
      const values = node.children.map(child => widthOf(child, 0));
      let content = 0;
      if (layout === 'horizontal') content = values.reduce((sum, value) => sum + value, 0) + gapOf(node) * Math.max(0, values.length - 1);
      else if (layout === 'free') content = Math.max(0, ...values.map((value, index) => finite(node.children[index].x) + value));
      else content = Math.max(0, ...values);
      return content + p.left + p.right;
    }
    function childWidths(node, innerWidth) {
      const values = node.children.map(child => mode(child, 'x') === 'fill' && layoutOf(node) === 'horizontal' ? 0 : widthOf(child, innerWidth));
      if (layoutOf(node) === 'horizontal') {
        const fillCount = node.children.filter(child => mode(child, 'x') === 'fill').length;
        const remaining = Math.max(0, innerWidth - values.reduce((sum, value) => sum + value, 0) - gapOf(node) * Math.max(0, values.length - 1));
        if (fillCount) node.children.forEach((child, index) => { if (mode(child, 'x') === 'fill') values[index] = remaining / fillCount; });
      }
      return values;
    }
    function heightOf(node, available, resolvedWidth) {
      if (mode(node, 'y') === 'fixed') return fixed(node, 'y', available);
      if (mode(node, 'y') === 'fill') return positive(available);
      if (!container(node)) return textLines(node.description, resolvedWidth, measureText).length * TEXT_STYLE.lineHeight + 2 * TEXT_STYLE.padding;
      const p = paddingOf(node), layout = layoutOf(node);
      const widths = childWidths(node, Math.max(0, resolvedWidth - p.left - p.right));
      const values = node.children.map((child, index) => heightOf(child, 0, widths[index]));
      let content = 0;
      if (layout === 'vertical') content = values.reduce((sum, value) => sum + value, 0) + gapOf(node) * Math.max(0, values.length - 1);
      else if (layout === 'free') content = Math.max(0, ...values.map((value, index) => finite(node.children[index].y) + value));
      else content = Math.max(0, ...values);
      return content + p.top + p.bottom;
    }
    function childSizes(node, innerWidth, innerHeight) {
      const widths = childWidths(node, innerWidth);
      const heights = node.children.map((child, index) => mode(child, 'y') === 'fill' && layoutOf(node) === 'vertical' ? 0 : heightOf(child, innerHeight, widths[index]));
      if (layoutOf(node) === 'vertical') {
        const fillCount = node.children.filter(child => mode(child, 'y') === 'fill').length;
        const remaining = Math.max(0, innerHeight - heights.reduce((sum, value) => sum + value, 0) - gapOf(node) * Math.max(0, heights.length - 1));
        if (fillCount) node.children.forEach((child, index) => { if (mode(child, 'y') === 'fill') heights[index] = remaining / fillCount; });
      }
      return node.children.map((child, index) => ({ w: widths[index], h: heights[index] }));
    }
    function aligned(alignment, available, size, offset = 0) {
      if (alignment === 'center') return (available - size) / 2 + offset;
      if (alignment === 'trailing' || alignment === 'bottom') return available - size - offset;
      return offset;
    }
    function place(node, x, y, w, h, parentId, depth, bounds, localX, localY) {
      const outside = x < bounds.x - epsilon || y < bounds.y - epsilon || x + w > bounds.x + bounds.w + epsilon || y + h > bounds.y + bounds.h + epsilon;
      const item = { id: node.id, node, x, y, w, h, parentId, depth, localX, localY, overflow: outside };
      items.push(item);byId.set(node.id, item);
      if (outside) warnings.push(label(node) + ' extends outside ' + (parentId ? 'its parent content area.' : 'the device viewport.'));
      if (!container(node)) return item;
      const p = paddingOf(node), layout = layoutOf(node), gap = gapOf(node);
      const inner = { x: x + p.left, y: y + p.top, w: Math.max(0, w - p.left - p.right), h: Math.max(0, h - p.top - p.bottom) };
      Object.assign(item, { contentX: inner.x, contentY: inner.y, contentW: inner.w, contentH: inner.h });
      const sizes = childSizes(node, inner.w, inner.h);
      const totalWidth = sizes.reduce((sum, size) => sum + size.w, 0) + gap * Math.max(0, sizes.length - 1);
      const totalHeight = sizes.reduce((sum, size) => sum + size.h, 0) + gap * Math.max(0, sizes.length - 1);
      let cursor = layout === 'horizontal' ? aligned(node.alignX || 'leading', inner.w, totalWidth) : aligned(node.alignY || 'top', inner.h, totalHeight);
      node.children.forEach((child, index) => {
        const size = sizes[index];let cx, cy;
        if (layout === 'horizontal') {
          cx = cursor;cy = aligned(node.alignY || 'top', inner.h, size.h);cursor += size.w + gap;
        } else if (layout === 'vertical') {
          cx = aligned(node.alignX || 'leading', inner.w, size.w);cy = cursor;cursor += size.h + gap;
        } else if (layout === 'overlay') {
          const ax = anchorOf(child, 'x'), ay = anchorOf(child, 'y');
          cx = aligned(ax === 'free' ? node.alignX || 'leading' : ax, inner.w, size.w, offsetOf(child, 'x', inner.w));
          cy = aligned(ay === 'free' ? node.alignY || 'top' : ay, inner.h, size.h, offsetOf(child, 'y', inner.h));
        } else {
          cx = aligned(anchorOf(child, 'x'), inner.w, size.w, offsetOf(child, 'x', inner.w));
          cy = aligned(anchorOf(child, 'y'), inner.h, size.h, offsetOf(child, 'y', inner.h));
        }
        const childItem = place(child, inner.x + cx, inner.y + cy, size.w, size.h, node.id, depth + 1, inner, cx, cy);
        if (childItem.overflow) item.overflow = true;
      });
      if (p.left + p.right > w + epsilon || p.top + p.bottom > h + epsilon) {
        item.overflow = true;warnings.push(label(node) + ' padding exceeds its size.');
      }
      return item;
    }
    const viewport = { x: 0, y: 0, w: width, h: height };
    for (const node of nodes) {
      const w = widthOf(node, width), h = heightOf(node, height, w);
      const x = aligned(anchorOf(node, 'x'), width, w, offsetOf(node, 'x', width));
      const y = aligned(anchorOf(node, 'y'), height, h, offsetOf(node, 'y', height));
      place(node, x, y, w, h, null, 0, viewport, x, y);
    }
    return { items, byId, warnings };
  }

  return Object.freeze({ TEXT_STYLE, textLines, validateLayout, resolve, walk, find, cloneSubtree });
});
