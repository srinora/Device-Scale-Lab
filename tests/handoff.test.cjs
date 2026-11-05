// SPDX-License-Identifier: GPL-3.0-only
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../project-model.js');
const layout = require('../layout-engine.js');

const rectangle = (id = 'title', extra = {}) => ({ id, type: 'rectangle', name: 'Title', description: 'Hello', x: 10, y: 20, w: 80, h: 30, posUnit: '%', sizeUnit: '%', fill: '#123456', opacity: 90, ...extra });
const container = (id = 'group', children = [rectangle()], extra = {}) => ({ id, type: 'container', name: 'Group', x: 0, y: 0, w: 300, h: 200, posUnit: 'px', sizeUnit: 'px', layout: 'vertical', children, padding: { top: 8, right: 12, bottom: 8, left: 12 }, gap: 8, ...extra });
const project = (objects = [rectangle()]) => ({ format: 'devicescale-lab', version: 3, appVersion: '0.01.261105.02', workspaceName: 'Review', devices: [{ id: 'se', name: 'iPhone SE', family: 'iPhone', w: 750, h: 1334, diag: 4.7, dpr: 2, cutout: 'home', orientation: 'portrait' }], objects, rectBg: '#f5f7fb', view: { mode: 'fit', safe: true, frame: true, dimensions: true, duoSeam: true } });

test('v1 and v2 flat projects migrate without changing legacy geometry, units, content or order', () => {
  const current = project([rectangle('one'), rectangle('two', { posUnit: 'px', sizeUnit: 'px', x: -2, y: 4, w: 50, h: 30 })]);
  for (const version of [1, 2]) {
    const old = { ...current, version, rectangles: current.objects };delete old.objects;
    if (version === 1) { delete old.workspaceName;delete old.appVersion;old.rectangles = old.rectangles.map(({ description, ...node }) => node); }
    const migrated = model.validateProject(old);
    assert.equal(migrated.version, 3);assert.equal(migrated.objects.length, 2);
    assert.equal(migrated.workspaceName, version === 1 ? 'Imported workspace' : 'Review');
    assert.deepEqual(migrated.objects.map(n => n.id), ['one', 'two']);
    for (const n of migrated.objects) {
      assert.equal(n.widthMode, 'fixed');assert.equal(n.heightMode, 'fixed');assert.equal(n.anchorX, 'free');assert.equal(n.anchorY, 'free');
      assert.equal(n.description, version === 1 ? '' : 'Hello');
    }
    const legacyBounds = current.objects.map(n => ({ x: n.posUnit === '%' ? n.x * 375 / 100 : n.x, y: n.posUnit === '%' ? n.y * 667 / 100 : n.y, w: n.sizeUnit === '%' ? n.w * 375 / 100 : n.w, h: n.sizeUnit === '%' ? n.h * 667 / 100 : n.h }));
    assert.deepEqual(layout.resolve(migrated.objects, 375, 667).items.map(({ x, y, w, h }) => ({ x, y, w, h })), legacyBounds);
  }
});

test('v3 hierarchy round trips with sizing modes, anchors, padding and literal descriptions', () => {
  const data = project([container('outer', [container('inner', [rectangle('text', { description: 'Text\n<b>literal</b>', posUnit: 'px', sizeUnit: 'px', widthMode: 'fit', heightMode: 'fit' })], { layout: 'overlay', anchorX: 'center', anchorY: 'bottom' })], { widthMode: 'fill' })]);
  const validated = model.validateProject(data);
  assert.deepEqual(model.validateProject(JSON.parse(JSON.stringify(validated))), validated);
  assert.equal(validated.objects[0].children[0].children[0].description, 'Text\n<b>literal</b>');
  assert.equal(validated.objects[0].children[0].anchorY, 'bottom');
  assert.equal(validated.objects[0].gap, 8);
});

test('strict validation rejects malformed hierarchy, sizing cycles, invalid metadata and excess depth atomically', () => {
  const data = project([container()]);
  const before = JSON.stringify(data);
  const mutations = [
    p => p.version = 99,
    p => p.objects = {},
    p => p.objects[0].children = null,
    p => p.objects[0].children[0].id = 'group',
    p => p.objects[0].layout = 'grid',
    p => p.objects[0].widthMode = 'auto',
    p => p.objects[0].padding.left = -1,
    p => p.objects[0].gap = Infinity,
    p => p.objects[0].children[0].opacity = 101,
    p => p.objects[0].children[0].fill = 'red',
    p => p.objects[0].children[0].description = {},
    p => p.objects[0].widthMode = 'fit',
    p => p.devices[0].dpr = 0,
    p => p.workspaceName = ' ',
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(data);mutate(candidate);
    assert.throws(() => model.validateProject(candidate));
  }
  let deep = rectangle();
  for (let i = 0; i < 9; i++) deep = container('g' + i, [deep]);
  assert.throws(() => model.validateProject(project([deep])), /nesting|depth/i);
  const recursive = container();recursive.children = [recursive];
  assert.throws(() => model.validateProject(project([recursive])), /unique/);
  assert.equal(JSON.stringify(data), before);
});

test('validation strips source, calibration, device instances and unknown object fields', () => {
  const data = project([rectangle('safe', { cookie: 'secret-cookie', onclick: 'evil' })]);
  Object.assign(data, { cookies: 'secret-cookie', html: 'secret-html', url: 'https://private.invalid', cssPpi: 999, imageSrc: 'secret-image' });
  data.devices[0].instance = 'private-instance';data.view.monitorDpr = 2;
  const encoded = JSON.stringify(model.validateProject(data));
  for (const forbidden of ['secret-', 'private.invalid', 'private-instance', 'cssPpi', 'onclick', 'monitorDpr']) assert.equal(encoded.includes(forbidden), false);
});

test('Markdown handoff includes neutral rules, exact data, reference geometry and safe literal content', () => {
  const data = project([container('group', [rectangle('text', { name: 'Name | [link](bad)', description: '# Heading\n```json\n</script><img src=x>\n``````', posUnit: 'px', sizeUnit: 'px', x: 0, y: 0, w: 100, h: 20 })])]);
  data.workspaceName = 'A | <review>';data.appVersion = 'older';data.cssPpi = 999;
  const output = model.markdown(data, { measureText: text => text.length * 7 });
  assert.ok(output.includes('0.01.261105.02'));
  assert.ok(output.includes('375 × 667'));
  assert.ok(output.includes('## Object hierarchy'));
  assert.ok(output.includes('## Reference geometry'));
  assert.ok(output.includes('A \\| &lt;review&gt;'));
  assert.ok(output.includes('Name \\| \\[link\\]\\(bad\\)'));
  assert.ok(output.includes('&lt;/script&gt;&lt;img src=x&gt;'));
  const match = output.match(/\n(`{7,})json\n([\s\S]*?)\n\1\n$/);
  assert.ok(match, 'JSON appendix fence must exceed the longest backtick sequence in content');
  const decoded = JSON.parse(match[2]);
  assert.deepEqual(decoded, { ...model.validateProject(data), appVersion: model.APP_VERSION });
  assert.equal('cssPpi' in decoded, false);
  assert.equal(decoded.objects[0].children[0].description, data.objects[0].children[0].description);
  assert.ok(output.includes('| text | 12 | 8 | 100 | 20 |'));
});

test('Markdown supports empty projects and resolves the selected reference orientation', () => {
  const empty = project([]);empty.devices = [];
  const output = model.markdown(empty);
  assert.ok(output.includes('No objects.'));assert.ok(output.includes('No devices selected'));
  assert.equal(output.includes('## Reference geometry'), false);
  const data = project();data.devices.push({ ...data.devices[0], name: 'Landscape reference', orientation: 'landscape' });
  const landscape = model.markdown(data, { referenceDeviceIndex: 1 });
  assert.ok(landscape.includes('**Landscape reference** (667 × 375 CSS px, landscape)'));
});
