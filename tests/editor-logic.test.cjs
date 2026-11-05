// SPDX-License-Identifier: GPL-3.0-only
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\ninit\(\);\s*$/, '\n');
const STORAGE_KEY = 'devicescale-lab-v1';
function app(saved) {
  const storage = new Map(saved === undefined ? [] : [[STORAGE_KEY, saved]]), elements = new Map();
  const context = vm.createContext({
    window: { devicePixelRatio: 1 }, URL,
    DeviceScaleLayout: require('../layout-engine.js'), DeviceScaleProject: require('../project-model.js'),
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, { textContent: '', classList: { add() {}, remove() {}, toggle() {} } });return elements.get(id); } },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  });
  vm.runInContext(script, context);
  vm.runInContext(`measureLayoutText=t=>t.length*7;closeRectPopup=()=>{};showToast=()=>{};render=()=>{};renderRectList=()=>{};renderRectEditor=()=>{};updateRectVisuals=()=>{};`, context);
  return { run: code => vm.runInContext(code, context), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, context)), storage };
}
const bounds = id => `(()=>{const g=referenceLayout().byId.get('${id}');return {x:g.x,y:g.y,w:g.w,h:g.h}})()`;

test('grouping and ungrouping inside centered overlays preserve active-device geometry', () => {
  const a = app();
  a.run(`state.rectangles=[{...newContainer(),id:'outer',x:0,y:0,w:400,h:300,layout:'overlay',alignX:'center',alignY:'center',children:[{...newRectangle(),id:'child',x:0,y:0,w:100,h:100}]}];state.rectSelected='child';rectSelection=new Set(['child']);`);
  const before = a.json(bounds('child'));
  assert.deepEqual(before, { x: 150, y: 100, w: 100, h: 100 });
  a.run('groupRectangles()');
  assert.deepEqual(a.json(bounds('child')), before);
  assert.equal(a.run('currentRect().anchorX'), 'leading');
  assert.equal(a.run('currentRect().anchorY'), 'top');
  a.run('ungroupRectangle()');
  assert.deepEqual(a.json(bounds('child')), before);
  assert.equal(a.run('state.rectangles[0].children.length'), 1);
});

test('moving into padded trailing/bottom overlays and back preserves geometry; cycles are refused', () => {
  const a = app();
  a.run(`state.rectangles=[{...newContainer(),id:'target',x:10,y:20,w:300,h:250,layout:'overlay',alignX:'trailing',alignY:'bottom',padding:{top:12,right:15,bottom:20,left:8},children:[]},{...newRectangle(),id:'child',x:35,y:45,w:80,h:60}];state.rectSelected='child';rectSelection=new Set(['child']);`);
  const before = a.json(bounds('child'));
  a.run("moveToContainer('target')");
  assert.deepEqual(a.json(bounds('child')), before);
  assert.equal(a.run('currentRect().anchorX'), 'leading');
  assert.equal(a.run('currentRect().anchorY'), 'top');
  a.run("moveToContainer('')");
  assert.deepEqual(a.json(bounds('child')), before);
  a.run(`state.rectangles=[{...newContainer(),id:'outer',children:[{...newContainer(),id:'inner',children:[]}]}];state.rectSelected='outer';rectSelection=new Set(['outer']);`);
  const tree = a.json('state.rectangles');
  a.run("moveToContainer('inner')");
  assert.deepEqual(a.json('state.rectangles'), tree);
});

test('unreadable autosave data remains untouched after restore and subsequent save attempts', () => {
  for (const saved of ['{broken', 'null', '42', '[]', '{"layoutVersion":3,"rectangles":{}}', '{"layoutVersion":999,"rectangles":[]}']) {
    const a = app(saved);a.run('restore()');
    assert.equal(a.run('autosaveRestoreError'), true, saved);
    assert.equal(a.run('save()'), false, saved);
    assert.equal(a.storage.get(STORAGE_KEY), saved);
  }
});

test('autosave rejects transient invalid layouts without replacing the last valid snapshot', () => {
  const a = app();
  assert.equal(a.run('save()'), true);
  const before = a.storage.get(STORAGE_KEY);
  a.run(`state.rectangles=[{...newContainer(),id:'fit-parent',widthMode:'fit',children:[{...newRectangle(),id:'child',sizeUnit:'%',w:50}]}]`);
  assert.equal(a.run('save()'), false);
  assert.equal(a.storage.get(STORAGE_KEY), before);
});
