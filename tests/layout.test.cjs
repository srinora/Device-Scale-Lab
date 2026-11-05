// SPDX-License-Identifier: GPL-3.0-only
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../layout-engine.js');

const rect = (id, more = {}) => ({ id, type: 'rectangle', name: id, description: '', x: 0, y: 0,
  w: 40, h: 20, posUnit: 'px', sizeUnit: 'px', widthMode: 'fixed', heightMode: 'fixed', ...more });
const group = (id, children = [], more = {}) => ({ id, type: 'container', name: id, x: 0, y: 0,
  w: 200, h: 100, posUnit: 'px', sizeUnit: 'px', widthMode: 'fixed', heightMode: 'fixed',
  layout: 'free', padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 8,
  alignX: 'leading', alignY: 'top', children, ...more });
const box = item => ({ x: item.x, y: item.y, w: item.w, h: item.h });
const metric = text => Array.from(text).length * 10;

test('legacy percentage and pixel rectangles keep exact logical geometry without mutation', () => {
  const nodes = [
    { id: 'legacy', x: 10, y: 20, w: 80, h: 15, posUnit: '%', sizeUnit: '%' },
    rect('fixed', { x: -20, y: 100, w: 100, h: 25 }),
  ];
  const snapshot = JSON.stringify(nodes);
  for (const [w, h] of [[375, 667], [667, 375], [1032, 1376]]) {
    const result = L.resolve(nodes, w, h);
    assert.deepEqual(box(result.byId.get('legacy')), { x: w / 10, y: h / 5, w: .8 * w, h: .15 * h });
    assert.deepEqual(box(result.byId.get('fixed')), { x: -20, y: 100, w: 100, h: 25 });
    assert.equal(result.byId.get('fixed').overflow, true);
  }
  assert.equal(JSON.stringify(nodes), snapshot);
});

test('nested groups resolve percentages and edge offsets against padded parent content', () => {
  const nodes = [group('parent', [
    rect('percent', { x: 10, y: 25, w: 50, h: 50, posUnit: '%', sizeUnit: '%' }),
    rect('pinned', { anchorX: 'trailing', anchorY: 'bottom', x: 7, y: 9, w: 30, h: 15 }),
    rect('centered', { anchorX: 'center', anchorY: 'center', x: 3, y: -4, w: 20, h: 10 }),
  ], { x: 10, y: 20, w: 200, h: 100, padding: { top: 5, right: 20, bottom: 15, left: 10 } })];
  const result = L.resolve(nodes, 400, 600);
  assert.deepEqual(box(result.byId.get('percent')), { x: 37, y: 45, w: 85, h: 40 });
  assert.deepEqual(box(result.byId.get('pinned')), { x: 153, y: 81, w: 30, h: 15 });
  assert.deepEqual(box(result.byId.get('centered')), { x: 98, y: 56, w: 20, h: 10 });
  assert.equal(result.byId.get('parent').contentW, 170);
  assert.equal(result.byId.get('parent').contentH, 80);
  assert.deepEqual(result.warnings, []);
});

test('horizontal Fill divides remaining space after fixed siblings and gaps', () => {
  const nodes = [group('row', [rect('fixed', { w: 60 }), rect('a', { widthMode: 'fill' }), rect('b', { widthMode: 'fill' })],
    { layout: 'horizontal', w: 300, h: 100, gap: 10, alignY: 'center', padding: { top: 10, right: 10, bottom: 10, left: 10 } })];
  const result = L.resolve(nodes, 400, 500);
  assert.deepEqual(box(result.byId.get('fixed')), { x: 10, y: 40, w: 60, h: 20 });
  assert.deepEqual(box(result.byId.get('a')), { x: 80, y: 40, w: 100, h: 20 });
  assert.deepEqual(box(result.byId.get('b')), { x: 190, y: 40, w: 100, h: 20 });
});

test('vertical Fill distributes height and cross-axis Fill follows viewport changes', () => {
  const nodes = [group('column', [rect('header', { h: 20, widthMode: 'fill' }), rect('body', { widthMode: 'fill', heightMode: 'fill' }), rect('footer', { h: 30, widthMode: 'fill' })],
    { layout: 'vertical', widthMode: 'fill', heightMode: 'fill', gap: 5, padding: { top: 10, right: 10, bottom: 10, left: 10 } })];
  for (const [w, h] of [[375, 667], [667, 375]]) {
    const result = L.resolve(nodes, w, h);
    assert.deepEqual(box(result.byId.get('header')), { x: 10, y: 10, w: w - 20, h: 20 });
    assert.deepEqual(box(result.byId.get('body')), { x: 10, y: 35, w: w - 20, h: h - 80 });
    assert.deepEqual(box(result.byId.get('footer')), { x: 10, y: h - 40, w: w - 20, h: 30 });
  }
});

test('nested Fit stacks measure padding, gaps and wrapped text after resolving Fill widths', () => {
  const nodes = [group('column', [
    rect('heading', { description: 'hello world', widthMode: 'fill', heightMode: 'fit' }),
    group('row', [rect('a', { w: 25, h: 20 }), rect('b', { w: 35, h: 30 })],
      { layout: 'horizontal', widthMode: 'fit', heightMode: 'fit', padding: { top: 2, right: 3, bottom: 4, left: 5 }, gap: 7 }),
  ], { layout: 'vertical', w: 96, heightMode: 'fit', gap: 6, padding: { top: 5, right: 5, bottom: 5, left: 5 } })];
  const result = L.resolve(nodes, 400, 600, { measureText: metric });
  assert.deepEqual(box(result.byId.get('heading')), { x: 5, y: 5, w: 86, h: 52 });
  assert.deepEqual(box(result.byId.get('row')), { x: 5, y: 63, w: 75, h: 36 });
  assert.deepEqual(box(result.byId.get('column')), { x: 0, y: 0, w: 96, h: 104 });
});

test('rectangle Fit width uses longest line and Fit height keeps explicit line breaks', () => {
  const nodes = [rect('text', { description: 'abc\r\ndefgh', widthMode: 'fit', heightMode: 'fit' }),
    rect('empty', { description: '', widthMode: 'fit', heightMode: 'fit' })];
  const result = L.resolve(nodes, 300, 500, { measureText: metric });
  assert.deepEqual(box(result.byId.get('text')), { x: 0, y: 0, w: 66, h: 52 });
  assert.deepEqual(box(result.byId.get('empty')), { x: 0, y: 0, w: 16, h: 16 });
  assert.deepEqual(L.textLines('abcde', 36, metric), ['ab', 'cd', 'e']);
  assert.deepEqual(L.textLines('a\nb', 100, metric), ['a', 'b']);
});

test('overlay order remains depth-first and offsets respect alignment and anchor override', () => {
  const nodes = [group('overlay', [
    rect('back', { w: 100, h: 40, x: 3, y: 4 }),
    group('nested', [rect('inner')], { x: 7, y: 9, w: 40, h: 20, anchorX: 'trailing', anchorY: 'bottom' }),
    rect('front', { w: 10, h: 10, anchorX: 'leading', anchorY: 'top' }),
  ], { layout: 'overlay', alignX: 'center', alignY: 'center', w: 200, h: 100 })];
  const result = L.resolve(nodes, 400, 600);
  assert.deepEqual(result.items.map(item => item.id), ['overlay', 'back', 'nested', 'inner', 'front']);
  assert.deepEqual(box(result.byId.get('back')), { x: 53, y: 34, w: 100, h: 40 });
  assert.deepEqual(box(result.byId.get('nested')), { x: 153, y: 71, w: 40, h: 20 });
  assert.deepEqual(box(result.byId.get('front')), { x: 0, y: 0, w: 10, h: 10 });
});

test('Fit overlays use maximum child sizes; Free Fit uses far edges', () => {
  const overlay = group('overlay', [rect('wide', { w: 120, h: 20 }), rect('tall', { w: 40, h: 80 })],
    { layout: 'overlay', widthMode: 'fit', heightMode: 'fit', alignX: 'center', alignY: 'bottom', padding: { top: 2, right: 3, bottom: 4, left: 5 } });
  const free = group('free', [rect('offset', { x: 25, y: 30, w: 70, h: 40 })], { widthMode: 'fit', heightMode: 'fit' });
  const result = L.resolve([overlay, free], 400, 600);
  assert.deepEqual(box(result.byId.get('overlay')), { x: 0, y: 0, w: 128, h: 86 });
  assert.deepEqual(box(result.byId.get('wide')), { x: 5, y: 62, w: 120, h: 20 });
  assert.deepEqual(box(result.byId.get('free')), { x: 0, y: 0, w: 95, h: 70 });
});

test('overflow never shrinks fixed children or wraps; Fill becomes zero', () => {
  const nodes = [group('row', [rect('a', { w: 150 }), rect('b', { w: 100 }), rect('fill', { widthMode: 'fill' })], { layout: 'horizontal', w: 200, gap: 10 })];
  const result = L.resolve(nodes, 400, 600);
  assert.equal(result.byId.get('a').w, 150);
  assert.equal(result.byId.get('b').w, 100);
  assert.equal(result.byId.get('fill').w, 0);
  assert.equal(result.byId.get('fill').x, 270);
  assert.equal(result.byId.get('b').y, 0);
  assert.equal(result.byId.get('b').overflow, true);
  assert.equal(result.byId.get('row').overflow, true);
  assert.ok(result.warnings.length > 0);
  assert.ok(result.items.every(item => ['x', 'y', 'w', 'h'].every(key => Number.isFinite(item[key]))));
});

test('empty Fit containers and excessive padding resolve finite bounds', () => {
  const nodes = [group('empty', [], { layout: 'horizontal', widthMode: 'fit', heightMode: 'fit', padding: { top: 1, right: 2, bottom: 3, left: 4 } }),
    group('tight', [rect('fill', { widthMode: 'fill', heightMode: 'fill' })], { w: 5, h: 5, padding: { top: 10, right: 10, bottom: 10, left: 10 } })];
  const result = L.resolve(nodes, 400, 600);
  assert.deepEqual(box(result.byId.get('empty')), { x: 0, y: 0, w: 6, h: 4 });
  assert.equal(result.byId.get('fill').w, 0);assert.equal(result.byId.get('fill').h, 0);
  assert.equal(result.byId.get('tight').overflow, true);
});

test('validation rejects sizing cycles and allows definite intermediate containers', () => {
  const invalid = [
    group('g', [rect('c', { widthMode: 'fill' })], { layout: 'horizontal', widthMode: 'fit' }),
    group('g', [rect('c', { sizeUnit: '%' })], { layout: 'vertical', heightMode: 'fit' }),
    group('g', [rect('c', { posUnit: '%' })], { widthMode: 'fit' }),
    group('g', [rect('c', { anchorX: 'center' })], { widthMode: 'fit' }),
    group('g', [rect('c', { x: 3 })], { layout: 'overlay', widthMode: 'fit' }),
  ];
  for (const node of invalid) assert.throws(() => L.validateLayout([node]), /Fit/);
  const valid = group('outer', [group('definite', [rect('percent', { sizeUnit: '%' })])], { widthMode: 'fit', heightMode: 'fit' });
  assert.doesNotThrow(() => L.resolve([valid], 400, 600));
});

test('layout limits, cycles, duplicate IDs and invalid structures fail before resolution', () => {
  assert.throws(() => L.validateLayout([rect('a'), rect('a')]), /unique/);
  assert.throws(() => L.validateLayout(Array.from({ length: 81 }, (_, i) => rect('r' + i))), /80 rectangles/);
  assert.throws(() => L.validateLayout(Array.from({ length: 81 }, (_, i) => group('g' + i))), /80 containers/);
  let nested = rect('leaf');
  for (let i = 0; i < 8; i++) nested = group('g' + i, [nested]);
  assert.doesNotThrow(() => L.validateLayout([nested]));
  assert.throws(() => L.validateLayout([group('ninth', [nested])]), /eight/);
  const cycle = group('cycle');cycle.children.push(cycle);
  assert.throws(() => L.validateLayout([cycle]), /ancestors/);
  assert.throws(() => L.validateLayout([rect('leaf', { children: [] })]), /Only containers/);
  assert.throws(() => L.validateLayout([group('g', null)]), /array/);
  assert.throws(() => L.resolve([], Infinity, 10), /finite/);
});

test('tree helpers preserve drawing order and subtree duplication remaps all IDs independently', () => {
  const tree = [group('outer', [rect('a'), group('inner', [rect('b')])]), rect('last')];
  assert.deepEqual(L.walk(tree).map(node => node.id), ['outer', 'a', 'inner', 'b', 'last']);
  const found = L.find(tree, 'b');
  assert.equal(found.parent.id, 'inner');assert.equal(found.index, 0);assert.equal(found.depth, 2);
  assert.equal(found.siblings[0], found.node);assert.equal(L.find(tree, 'missing'), null);
  let count = 0;const copy = L.cloneSubtree(tree[0], () => 'copy' + ++count);
  assert.deepEqual(L.walk([copy]).map(node => node.id), ['copy1', 'copy2', 'copy3', 'copy4']);
  copy.children[1].padding.left = 99;copy.children[0].name = 'changed';
  assert.equal(tree[0].children[1].padding.left, 0);assert.equal(tree[0].children[0].name, 'a');
  assert.doesNotThrow(() => L.validateLayout([...tree, copy]));
});

test('Fit width and Fill height remain independent through nested column sizing', () => {
  const nodes = [group('outer', [
    rect('heading', { description: '12345', widthMode: 'fit', heightMode: 'fit' }),
    group('body', [rect('content', { widthMode: 'fill', heightMode: 'fill' })],
      { w: 100, heightMode: 'fill', padding: { top: 5, right: 5, bottom: 5, left: 5 } }),
  ], { layout: 'vertical', widthMode: 'fit', h: 160, gap: 6, alignX: 'center' })];
  const result = L.resolve(nodes, 375, 667, { measureText: metric });
  assert.deepEqual(box(result.byId.get('outer')), { x: 0, y: 0, w: 100, h: 160 });
  assert.deepEqual(box(result.byId.get('heading')), { x: 17, y: 0, w: 66, h: 34 });
  assert.deepEqual(box(result.byId.get('body')), { x: 0, y: 40, w: 100, h: 120 });
  assert.deepEqual(box(result.byId.get('content')), { x: 5, y: 45, w: 90, h: 110 });
  assert.equal(result.warnings.length, 0);
});

test('horizontal Fill allocation reaches nested text before a fitted ancestor measures height', () => {
  const nodes = [group('row', [
    rect('sidebar', { w: 100, h: 20 }),
    group('column', [rect('text', { widthMode: 'fill', heightMode: 'fit', description: 'abcdefghi' })],
      { layout: 'vertical', widthMode: 'fill', heightMode: 'fit', padding: { top: 4, right: 10, bottom: 6, left: 10 } }),
  ], { layout: 'horizontal', w: 190, heightMode: 'fit', gap: 10, alignY: 'bottom' })];
  const result = L.resolve(nodes, 375, 667, { measureText: metric });
  // 80px column minus 20px padding gives a 60px text box: 44px text width,
  // four characters per line, therefore three lines and 70px text height.
  assert.deepEqual(box(result.byId.get('text')), { x: 120, y: 4, w: 60, h: 70 });
  assert.deepEqual(box(result.byId.get('column')), { x: 110, y: 0, w: 80, h: 80 });
  assert.deepEqual(box(result.byId.get('row')), { x: 0, y: 0, w: 190, h: 80 });
  assert.deepEqual(box(result.byId.get('sidebar')), { x: 0, y: 60, w: 100, h: 20 });
});

test('negative Free positions remain outside rather than shifting children during Fit measurement', () => {
  const nodes = [group('fit', [rect('negative', { x: -30, y: -15, w: 10, h: 10 }), rect('positive', { x: 20, y: 10, w: 40, h: 25 })],
    { x: 12, y: 8, widthMode: 'fit', heightMode: 'fit', padding: { top: 2, right: 3, bottom: 4, left: 5 } })];
  const result = L.resolve(nodes, 375, 667);
  assert.deepEqual(box(result.byId.get('fit')), { x: 12, y: 8, w: 68, h: 41 });
  assert.deepEqual(box(result.byId.get('negative')), { x: -13, y: -5, w: 10, h: 10 });
  assert.equal(result.byId.get('negative').overflow, true);
  assert.equal(result.byId.get('fit').overflow, true);
  assert.equal(result.byId.get('positive').overflow, false);
});

test('maximum normalized dimensions and eight percentage levels stay finite without shrinking', () => {
  const extremes = { x: 50000, y: -50000, w: 50000, h: 50000, posUnit: '%', sizeUnit: '%' };
  let nested = rect('leaf', { ...extremes, fill: '#000000', opacity: 100 });
  for (let i = 0; i < 8; i++) nested = group('level' + i, [nested], extremes);
  const model = require('../project-model.js');
  const normalized = model.normalizeObjects([nested]);
  const result = L.resolve(normalized, 32000, 32000);
  assert.ok(result.items.every(item => ['x', 'y', 'w', 'h', 'localX', 'localY'].every(key => Number.isFinite(item[key]))));
  assert.ok(Math.abs(result.byId.get('leaf').w / (32000 * 500 ** 9) - 1) < 1e-12);
  assert.equal(result.byId.get('leaf').overflow, true);
  assert.deepEqual(result.items.map(item => item.id), ['level7', 'level6', 'level5', 'level4', 'level3', 'level2', 'level1', 'level0', 'leaf']);
});
