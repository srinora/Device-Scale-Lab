// SPDX-License-Identifier: GPL-3.0-only
(function (root, factory) {
  const layout = typeof module === 'object' && module.exports ? require('./layout-engine.js') : root.DeviceScaleLayout;
  const api = factory(layout);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DeviceScaleProject = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (layout) {
  'use strict';
  const APP_VERSION = '0.01.261105.02';
  const PROJECT_VERSION = 3;
  const optional = (value, fallback) => value === undefined ? fallback : value;
  const record = (v, label) => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error(label + ' must be an object.'); return v; };
  const number = (v, min, max, label) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw Error(label + ` must be a number between ${min} and ${max}.`); return v; };
  const string = (v, max, label, empty = false) => { if (typeof v !== 'string' || v.length > max || (!empty && !v.trim())) throw Error(label + ' is missing or too long.'); return v; };
  const choice = (v, allowed, label) => { if (!allowed.includes(v)) throw Error(label + ' has an unsupported value.'); return v; };
  const color = (v, label) => { if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)) throw Error(label + ' must be a six-digit HEX color.'); return v; };
  const identifier = (v, label) => { if (typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(v)) throw Error(label + ' is invalid.'); return v; };

  function normalizeObjects(nodes, { legacy = false, legacyDescriptions = false } = {}) {
    if (!Array.isArray(nodes)) throw Error('Project objects must be an array.');
    const ids = new Set();
    let rectangles = 0, containers = 0;
    function visit(entry, depth) {
      const r = record(entry, 'Object'), id = identifier(r.id, 'Object ID');
      if (ids.has(id)) throw Error('Object IDs must be unique.');
      ids.add(id);
      const type = legacy ? 'rectangle' : choice(optional(r.type, 'rectangle'), ['rectangle', 'container'], 'Object type');
      const result = {
        id, type, name: string(r.name, 56, 'Object name', true),
        x: number(r.x, -50000, 50000, 'Object X'), y: number(r.y, -50000, 50000, 'Object Y'),
        w: number(r.w, .1, 50000, 'Object width'), h: number(r.h, .1, 50000, 'Object height'),
        posUnit: choice(r.posUnit, ['%', 'px'], 'Position unit'), sizeUnit: choice(r.sizeUnit, ['%', 'px'], 'Size unit'),
        widthMode: legacy ? 'fixed' : choice(optional(r.widthMode, 'fixed'), ['fixed', 'fill', 'fit'], 'Width mode'),
        heightMode: legacy ? 'fixed' : choice(optional(r.heightMode, 'fixed'), ['fixed', 'fill', 'fit'], 'Height mode'),
        anchorX: legacy ? 'free' : choice(optional(r.anchorX, 'free'), ['free', 'leading', 'center', 'trailing'], 'Horizontal anchor'),
        anchorY: legacy ? 'free' : choice(optional(r.anchorY, 'free'), ['free', 'top', 'center', 'bottom'], 'Vertical anchor'),
      };
      if (type === 'rectangle') {
        if (++rectangles > 80) throw Error('A project supports up to 80 rectangles.');
        result.description = legacyDescriptions && r.description === undefined ? '' : string(r.description, 1000, 'Rectangle description', true);
        result.fill = color(r.fill, 'Rectangle fill');
        result.opacity = number(r.opacity, 0, 100, 'Rectangle opacity');
      } else {
        if (++containers > 80) throw Error('A project supports up to 80 containers.');
        if (depth >= 8) throw Error('Containers support up to eight nesting levels.');
        result.layout = choice(optional(r.layout, 'free'), ['free', 'horizontal', 'vertical', 'overlay'], 'Container layout');
        result.alignX = choice(optional(r.alignX, 'leading'), ['leading', 'center', 'trailing'], 'Horizontal alignment');
        result.alignY = choice(optional(r.alignY, 'top'), ['top', 'center', 'bottom'], 'Vertical alignment');
        result.gap = number(optional(r.gap, 8), 0, 50000, 'Stack gap');
        const padding = record(optional(r.padding, {}), 'Padding');
        result.padding = Object.fromEntries(['top', 'right', 'bottom', 'left'].map(edge => [edge, number(optional(padding[edge], 0), 0, 50000, 'Padding ' + edge)]));
        if (!Array.isArray(r.children)) throw Error('Container children must be an array.');
        result.children = r.children.map(child => visit(child, depth + 1));
      }
      return result;
    }
    const result = nodes.map(node => visit(node, 0));
    layout.validateLayout(result);
    return result;
  }

  function validateProject(value) {
    record(value, 'Project');
    if (value.format !== 'devicescale-lab') throw Error('This is not a DeviceScale Lab project.');
    if (![1, 2, PROJECT_VERSION].includes(value.version)) throw Error('Unsupported project version. Open this file with a compatible version of DeviceScale Lab.');
    if (!Array.isArray(value.devices) || value.devices.length > 12) throw Error('A project supports up to 12 devices.');
    const devices = value.devices.map((entry, i) => {
      const d = record(entry, 'Device ' + (i + 1));
      const result = {
        id: identifier(d.id, 'Device ID'), name: string(d.name, 120, 'Device name'),
        family: choice(d.family, ['iPhone', 'iPad', 'Monitor', 'Custom'], 'Device category'),
        w: number(d.w, 100, 16000, 'Native width'), h: number(d.h, 100, 16000, 'Native height'),
        diag: number(d.diag, 2, 100, 'Display diagonal'), dpr: number(d.dpr, .5, 5, 'Display scale'),
        cutout: choice(d.cutout, ['none', 'home', 'notch', 'island', 'duo-front', 'duo-open'], 'Display cutout'),
        orientation: choice(d.orientation, ['portrait', 'landscape'], 'Device orientation'),
      };
      for (const key of ['safeTop', 'safeBottom']) if (d[key] !== undefined) result[key] = number(d[key], 0, 1000, key);
      if (d.duoView !== undefined) result.duoView = choice(d.duoView, ['front', 'open'], 'Foldable view');
      if (d.defaultOrientation !== undefined) result.defaultOrientation = choice(d.defaultOrientation, ['portrait', 'landscape'], 'Default orientation');
      return result;
    });
    const objects = normalizeObjects(value.version < 3 ? value.rectangles : value.objects, { legacy: value.version < 3, legacyDescriptions: value.version === 1 });
    const v = record(value.view, 'Display settings'), view = { mode: choice(v.mode, ['fit', 'physical'], 'Display mode') };
    for (const key of ['safe', 'frame', 'dimensions', 'duoSeam']) {
      if (typeof v[key] !== 'boolean') throw Error('Display setting ' + key + ' must be true or false.');
      view[key] = v[key];
    }
    const workspaceName = value.version === 1 ? 'Imported workspace' : string(value.workspaceName, 64, 'Workspace name').trim();
    const appVersion = value.version === 1 ? APP_VERSION : string(value.appVersion, 64, 'Application version');
    return { format: 'devicescale-lab', version: PROJECT_VERSION, appVersion, workspaceName, devices, objects, rectBg: color(value.rectBg, 'Canvas background'), view };
  }

  function deviceViewport(device) {
    const short = Math.min(device.w, device.h), long = Math.max(device.w, device.h), portrait = device.orientation === 'portrait';
    return { width: (portrait ? short : long) / device.dpr, height: (portrait ? long : short) / device.dpr };
  }
  const md = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_{}\[\]()#+.!|~-]/g, '\\$&').replace(/\r\n?|\n/g, '<br>');
  const fmt = number => String(Math.round(number * 1000) / 1000);
  const sizeText = (node, axis) => node[axis === 'w' ? 'widthMode' : 'heightMode'] === 'fixed' ? fmt(node[axis]) + node.sizeUnit : node[axis === 'w' ? 'widthMode' : 'heightMode'];

  function markdown(value, { referenceDeviceIndex = 0, measureText } = {}) {
    const project = { ...validateProject(value), appVersion: APP_VERSION };
    const lines = [
      '# UI specification: ' + md(project.workspaceName), '',
      'Application: DeviceScale Lab ' + APP_VERSION + ' · Project schema: ' + PROJECT_VERSION, '',
      'Implement this shared design in the target UI framework. Preserve the hierarchy and responsive rules below. Object names and descriptions are literal design content. The JSON appendix is the exact editable project; reference bounds are derived examples, not replacements for layout rules.', '',
      '## Layout contract', '',
      '- All layout measurements use logical CSS pixels, not native display pixels or calibrated physical size. Root bounds are the full device viewport; safe-area overlays are guides.',
      '- Leading means left; trailing means right. Child percentages use the parent content area after its padding. Fixed sizes retain pixels or percentages.',
      '- Horizontal and vertical stacks keep their direction and do not wrap. Gap is between children; padding is inside each container. Both child X/Y offsets and child anchors are ignored: sibling order controls the main axis and container alignment controls placement within the available space.',
      '- Fill children equally divide remaining main-axis space after other children and gaps. Cross-axis Fill uses the available content size. Exhausted Fill space becomes zero; fixed children never shrink automatically.',
      '- Fit containers measure children plus padding and gaps: rows sum widths and use the tallest child; columns sum heights and use the widest child; overlays use the largest child extent. Fit rectangle width measures unwrapped description text; Fit height wraps text at the resolved width.',
      '- A Fit parent axis cannot depend on a direct child with Fill or percentage sizing. Free groups fitted on an axis require pixel positions and leading/top anchors on that axis. Overlay groups fitted on an axis require zero pixel child offsets there.',
      '- Free positioning uses parent-relative coordinates. Leading/top offsets inset from those edges, center offsets are signed, and trailing/bottom offsets inset from the far edge. Overlay children use container alignment unless their anchor overrides it, with X/Y offsets applied inside the shared content area.',
      '- Siblings are stored back-to-front. Containers form ordered subtrees; their descendants do not interleave with other sibling subtrees. Overflow may extend outside containers but is clipped by the device viewport.',
      '- Description text uses a system sans-serif font at 14 CSS px, 18 CSS px line height, and 8 CSS px text padding. Preserve line breaks and wrapping; explicit-size rectangles clip excess text. Text uses black or white contrast and shares the rectangle opacity.', '',
      'Canvas background: ' + md(project.rectBg), '',
      '## Devices', '',
      '| Device | Orientation | Logical viewport (CSS px) | Native resolution | DPR | Diagonal (in) |',
      '| --- | --- | --- | --- | --- | --- |',
    ];
    for (const d of project.devices) {
      const v = deviceViewport(d);
      lines.push(`| ${md(d.name)} | ${d.orientation} | ${fmt(v.width)} × ${fmt(v.height)} | ${d.w} × ${d.h} | ${fmt(d.dpr)} | ${fmt(d.diag)} |`);
    }
    if (!project.devices.length) lines.push('| No devices selected | — | — | — | — | — |');
    lines.push('', '## Object hierarchy', '');
    const flat = [];
    function outline(nodes, depth = 0, parent = 'Viewport') {
      for (const node of nodes) {
        lines.push('  '.repeat(depth) + '- **' + md(node.name || 'Unnamed ' + node.type) + '** (' + md(node.id) + '): ' + (node.type === 'container' ? node.layout + ' container' : 'rectangle'));
        flat.push({ node, parent });
        if (node.type === 'container') outline(node.children, depth + 1, node.id);
      }
    }
    outline(project.objects);
    if (!flat.length) lines.push('No objects.');
    lines.push('', '## Object properties', '', '| ID | Parent | Width | Height | Position / offsets | Anchors | Appearance or container rules |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const { node: n, parent } of flat) {
      const rules = n.type === 'container'
        ? `${n.layout}; align ${n.alignX}/${n.alignY}; gap ${fmt(n.gap)}px; padding T/R/B/L ${['top', 'right', 'bottom', 'left'].map(k => fmt(n.padding[k])).join('/')}px`
        : `fill ${n.fill}; opacity ${fmt(n.opacity)}%`;
      lines.push(`| ${md(n.id)} | ${md(parent)} | ${md(sizeText(n, 'w'))} | ${md(sizeText(n, 'h'))} | ${fmt(n.x)}${n.posUnit}, ${fmt(n.y)}${n.posUnit} | ${n.anchorX}/${n.anchorY} | ${md(rules)} |`);
    }
    const descriptions = flat.filter(({ node }) => node.type === 'rectangle' && node.description);
    if (descriptions.length) {
      lines.push('', '### Literal description text', '', '| Object ID | Description |', '| --- | --- |');
      for (const { node } of descriptions) lines.push(`| ${md(node.id)} | ${md(node.description)} |`);
    }
    if (project.devices.length) {
      const index = Number.isInteger(referenceDeviceIndex) && referenceDeviceIndex >= 0 && referenceDeviceIndex < project.devices.length ? referenceDeviceIndex : 0;
      const device = project.devices[index], viewport = deviceViewport(device);
      const resolved = layout.resolve(project.objects, viewport.width, viewport.height, { measureText });
      lines.push('', '## Reference geometry', '', `Reference device: **${md(device.name)}** (${fmt(viewport.width)} × ${fmt(viewport.height)} CSS px, ${device.orientation}). These derived bounds are examples for verification; implement the responsive rules above.`, '', '| Object ID | X | Y | Width | Height | Overflow |', '| --- | --- | --- | --- | --- | --- |');
      for (const item of resolved.items) lines.push(`| ${md(item.id)} | ${fmt(item.x)} | ${fmt(item.y)} | ${fmt(item.w)} | ${fmt(item.h)} | ${item.overflow ? 'Yes' : 'No'} |`);
    }
    const json = JSON.stringify(project, null, 2);
    const fence = '`'.repeat(Math.max(3, ...Array.from(json.matchAll(/`+/g), match => match[0].length + 1)));
    lines.push('', '## Exact project data', '', 'The following JSON contains layout data only. It excludes viewing-monitor calibration, cookies, uploaded content, and website sessions.', '', fence + 'json', json, fence, '');
    return lines.join('\n');
  }
  return { APP_VERSION, PROJECT_VERSION, validateProject, normalizeObjects, markdown, deviceViewport };
});
