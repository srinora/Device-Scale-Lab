// SPDX-License-Identifier: GPL-3.0-only
// Run with: node --test tests/project.test.cjs (no dependencies required).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\ninit\(\);\s*$/, '\n');
function app() {
  const context = vm.createContext({window: {devicePixelRatio: 2}});
  vm.runInContext(script, context);
  return {
    run: code => vm.runInContext(code, context),
    json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, context))
  };
}

test('calibration corrects a measured 80 mm line to 100 mm without changing device dimensions', () => {
  const a = app();
  assert.equal(a.run('calibratedDensity(96,80)'), 120);
  assert.ok(Math.abs(a.run('millimetersToCss(25.4,96)') - 96) < 1e-9);
  const before = a.json('dimensions(state.devices[0])');
  a.run('state.cssPpi=calibratedDensity(96,80)');
  assert.deepEqual(a.json('dimensions(state.devices[0])'), before);
  assert.ok(Math.abs(a.run('millimetersToCss(100)') - 472.4409448818898) < 1e-9);
  for (const input of [0, -1, NaN, Infinity, 9, 501]) {
    assert.throws(() => a.run(`calibratedDensity(96,${input})`));
  }
});

test('project round trip preserves names, IDs, mixed units, layers, custom devices, and view settings', () => {
  const a = app();
  a.run(`
    state.devices.push({id:'user',name:'Review monitor',family:'Custom',w:2560,h:1440,diag:27,dpr:1.25,cutout:'none',orientation:'landscape',instance:uid()});
    state.rectangles[0].name='Header <review> & notes';
    state.rectangles[0].description='First line\\nDescription <b>stays plain text</b> 🎨';
    state.workspaceName='Tablet comparison';
    state.rectangles[0].posUnit='px';state.rectangles[0].x=-12.5;
    state.rectangles[1].sizeUnit='px';state.rectangles[1].w=180;state.rectangles[1].opacity=35;
    state.rectangles.reverse();state.mode='physical';state.safe=false;state.frame=false;state.rectBg='#aabbcc';
    globalThis.project=createProject();
    globalThis.imported=projectWorkspace(JSON.parse(JSON.stringify(project)));
  `);
  assert.deepEqual(a.json('createProject(imported)'), a.json('project'));
  assert.notEqual(a.run('imported.devices[0].instance'), a.run('state.devices[0].instance'));
  assert.equal(a.run('imported.source'), 'rectangles');
  assert.equal(a.run('imported.rectSelected'), a.run('project.rectangles[0].id'));
});

test('handoff excludes source monitor calibration and private mockup content', () => {
  const a = app();
  a.run(`state.cssPpi=123.45;state.calibrated=true;state.imageSrc='blob:private';state.html='<h1>Private</h1>';state.url='https://private.invalid';globalThis.project=createProject()`);
  const project = a.json('project');
  for (const key of ['cssPpi', 'calibrated', 'monitorW', 'monitorH', 'monitorDiag', 'monitorDpr', 'imageSrc', 'html', 'url']) {
    assert.equal(key in project, false);
  }
  assert.equal(JSON.stringify(project).includes('private'), false);
  a.run(`globalThis.recipient={...defaults(),cssPpi:88.8,calibrated:true,monitorW:3840,monitorH:2160,monitorDiag:32,monitorDpr:2,showRuler:false};globalThis.imported=projectWorkspace(project,recipient)`);
  for (const key of ['cssPpi','calibrated','monitorW','monitorH','monitorDiag','monitorDpr','showRuler']) {
    assert.equal(a.run(`imported.${key}`), a.run(`recipient.${key}`));
  }
  assert.equal(a.run('imported.html'), '');
  assert.equal(a.run('imported.imageSrc'), null);
});

test('validation rejects malformed projects atomically', () => {
  const mutations = [
    'p.version=99', 'p.format="other"', 'p.devices={}', 'p.rectangles=null',
    'p.rectangles[1].id=p.rectangles[0].id', 'p.rectangles[0].id="<bad>"',
    'p.rectangles[0].w=0', 'p.rectangles[0].h=-1', 'p.rectangles[0].x=Infinity',
    'p.rectangles[0].y="10"', 'p.rectangles[0].opacity=101',
    'p.rectangles[0].fill="red;background:url(x)"', 'p.rectangles[0].posUnit="mm"',
    'p.rectangles[0].name="x".repeat(57)', 'p.devices[0].dpr=0',
    'p.devices[0].diag=NaN', 'p.devices[0].orientation="upside-down"',
    'p.devices[0].family="unknown"', 'p.devices[0].safeTop=-1',
    'p.devices[0].cutout="bad"', 'p.rectBg="#abc"', 'p.view.safe="true"',
    'p.rectangles[0].description="x".repeat(1001)', 'delete p.rectangles[0].description',
    'p.rectangles[0].description={}', 'p.workspaceName=" "',
    'p.workspaceName="x".repeat(65)', 'delete p.appVersion'
  ];
  const a = app(), before = a.json('state');
  for (const mutation of mutations) {
    assert.throws(() => a.run(`{const p=createProject();${mutation};projectWorkspace(p)}`), mutation);
    assert.deepEqual(a.json('state'), before, mutation);
  }
});

test('empty projects and limits round-trip; excess objects or devices are rejected', () => {
  const a = app();
  a.run('globalThis.p=createProject();p.devices=[];p.rectangles=[]');
  assert.equal(a.run('projectWorkspace(p).rectSelected'), null);
  a.run(`p=createProject();p.devices=Array.from({length:12},()=>({...p.devices[0]}));p.rectangles=Array.from({length:80},(_,i)=>({...p.rectangles[0],id:'r'+i}))`);
  assert.equal(a.run('validateProject(p).rectangles.length'), 80);
  assert.throws(() => a.run('validateProject({...p,devices:[...p.devices,p.devices[0]]})'));
  assert.throws(() => a.run('validateProject({...p,rectangles:[...p.rectangles,{...p.rectangles[0],id:"extra"}]})'));
});

test('unknown fields are stripped while names remain plain data', () => {
  const a = app();
  a.run(`globalThis.p=createProject();p.rectangles[0].name='<img src=x onerror=alert(1)>';p.rectangles[0].onclick='evil()';p.devices[0].instance='unsafe-instance';p.cssPpi=999`);
  const validated = a.json('validateProject(p)');
  assert.equal(validated.rectangles[0].name, '<img src=x onerror=alert(1)>');
  assert.equal('onclick' in validated.rectangles[0], false);
  assert.equal('instance' in validated.devices[0], false);
  assert.equal('cssPpi' in validated, false);
});

test('legacy saved workspaces restore with calibration and without requiring new fields', () => {
  const a = app();
  a.run(`globalThis.saved=JSON.stringify({...defaults(),cssPpi:92,calibrated:true,rectangles:[{id:'legacy',name:'Existing name',x:10,y:20,w:30,h:40,posUnit:'%',sizeUnit:'px',fill:'#123456',opacity:50}]});globalThis.localStorage={getItem:()=>saved};restore()`);
  assert.equal(a.run('state.cssPpi'), 92);
  assert.equal(a.run('state.calibrated'), true);
  assert.equal(a.run('state.rectangles[0].name'), 'Existing name');
  assert.equal(a.run('state.rectangles[0].description'), '');
  assert.equal(a.run('createProject().rectangles[0].sizeUnit'), 'px');
});

test('v1 handoffs migrate to v2 and remain editable and exportable', () => {
  const a = app();
  a.run(`globalThis.old=createProject();old.version=1;delete old.workspaceName;delete old.appVersion;old.rectangles.forEach(r=>delete r.description);globalThis.migrated=validateProject(old)`);
  assert.equal(a.run('migrated.version'), 2);
  assert.equal(a.run('migrated.workspaceName'), 'Imported workspace');
  assert.equal(a.run('migrated.appVersion'), '0.01.261105.01');
  assert.ok(a.run('migrated.rectangles.every(r=>r.description==="")'));
  assert.deepEqual(a.json('createProject(projectWorkspace(old))'), a.json('migrated'));
});

test('description layout handles line breaks, wrapping, clipping and Unicode without HTML interpretation', () => {
  const a = app();
  // A fixed-width measure makes wrap expectations independent of installed fonts.
  assert.deepEqual(a.json(`layoutDescription('hello world',76,100,s=>s.length*10).map(l=>l.text)`), ['hello', 'world']);
  assert.deepEqual(a.json(`layoutDescription('a\\r\\nb\\nc',100,52,s=>s.length*10).map(l=>l.text)`), ['a', 'b']);
  assert.deepEqual(a.json(`layoutDescription('abcdefgh',46,100,s=>s.length*10).map(l=>l.text)`), ['abc', 'def', 'gh']);
  assert.deepEqual(a.json(`layoutDescription('👨‍👩‍👧‍👦👨‍👩‍👧‍👦',26,100,s=>Array.from(descriptionGraphemes.segment(s)).length*10).map(l=>l.text)`), ['👨‍👩‍👧‍👦', '👨‍👩‍👧‍👦']);
  assert.deepEqual(a.json(`layoutDescription('<b>plain</b>',500,100,s=>s.length).map(l=>l.text)`), ['<b>plain</b>']);
  assert.deepEqual(a.json(`layoutDescription('hidden',16,100,s=>s.length)`), []);
  assert.deepEqual(a.json(`layoutDescription('hidden',100,16,s=>s.length)`), []);
  assert.equal(a.run(`descriptionColor('#ffffff')`), '#000000');
  assert.equal(a.run(`descriptionColor('#000000')`), '#ffffff');
});

function withStorage() {
  const a = app();
  a.run(`
    globalThis.memory=new Map();globalThis.failWrites=false;
    globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>{if(failWrites)throw Error('Storage full');memory.set(key,value)}};
  `);
  return a;
}

test('named workspaces are independent snapshots with unique names and explicit update/delete', () => {
  const a = withStorage();
  a.run(`globalThis.first=saveNamedWorkspace('  Review A  ',createProject());state.rectangles[0].description='Edited after saving';globalThis.second=saveNamedWorkspace('Review B',createProject())`);
  assert.equal(a.run('first.entry.project.workspaceName'), 'Review A');
  assert.equal(a.run('readWorkspaceLibrary().entries[0].project.rectangles[0].description'), '');
  assert.equal(a.run('readWorkspaceLibrary().entries[1].project.rectangles[0].description'), 'Edited after saving');
  const before = a.run('localStorage.getItem(WORKSPACE_STORAGE_KEY)');
  assert.throws(() => a.run(`saveNamedWorkspace(' review a ',createProject())`), /already used/);
  assert.throws(() => a.run(`saveNamedWorkspace('Review A',createProject(),second.entry.id)`), /already used/);
  assert.equal(a.run('localStorage.getItem(WORKSPACE_STORAGE_KEY)'), before);
  a.run(`globalThis.updated=saveNamedWorkspace('Review renamed',createProject(),first.entry.id)`);
  assert.equal(a.run('updated.entry.id'), a.run('first.entry.id'));
  assert.equal(a.run('readWorkspaceLibrary().entries.length'), 2);
  assert.equal(a.run('readWorkspaceLibrary().entries[0].project.rectangles[0].description'), 'Edited after saving');
  const working = a.json('state');
  a.run('deleteNamedWorkspace(first.entry.id)');
  assert.equal(a.run('readWorkspaceLibrary().entries.length'), 1);
  assert.deepEqual(a.json('state'), working);
});

test('storage quota, corrupt libraries, and stale IDs do not destroy saved copies', () => {
  const a = withStorage();
  a.run(`globalThis.first=saveNamedWorkspace('Review',createProject());failWrites=true`);
  const before = a.run('localStorage.getItem(WORKSPACE_STORAGE_KEY)');
  for (const action of [
    `saveNamedWorkspace('New',createProject())`,
    `saveNamedWorkspace('Changed',createProject(),first.entry.id)`,
    `deleteNamedWorkspace(first.entry.id)`
  ]) {
    assert.throws(() => a.run(action), /Storage full/);
    assert.equal(a.run('localStorage.getItem(WORKSPACE_STORAGE_KEY)'), before);
  }
  a.run('failWrites=false');
  assert.throws(() => a.run(`saveNamedWorkspace('Changed',createProject(),'gone')`), /no longer exists/);
  assert.throws(() => a.run(`deleteNamedWorkspace('gone')`), /no longer exists/);
  for (const contents of ['{', '{"version":99,"entries":[]}', '{"version":1,"entries":[null]}']) {
    a.run(`localStorage.setItem(WORKSPACE_STORAGE_KEY,${JSON.stringify(contents)})`);
    assert.throws(() => a.run(`saveNamedWorkspace('New',createProject())`));
    assert.equal(a.run('localStorage.getItem(WORKSPACE_STORAGE_KEY)'), contents);
  }
});

test('monitor catalog filters distinguish marketed sizes and actual diagonals', () => {
  const a = app(), models = a.json('MONITOR_CATALOG');
  assert.equal(new Set(models.map(m=>m.id)).size, models.length);
  for (const m of models) {
    assert.ok(m.nativeW>0 && m.nativeH>0 && m.diag>0, m.id);
    assert.match(m.source, /^https:\/\/(?:[^/]+\.)?(?:apple\.com|aoc\.com|dell\.com|delltechnologies\.com)\//, m.id);
    if (m.kind==='Monitor') assert.ok(m.sizeClass>=27, m.id);
  }
  assert.equal(a.run(`filteredMonitorModels('AOC','32').find(m=>m.id==='aoc-q32p2c').diag`), 31.5);
  assert.ok(a.run(`filteredMonitorModels('Dell','34').every(m=>m.brand==='Dell'&&m.sizeClass===34)`));
  assert.ok(a.run(`filteredMonitorModels('Apple','13').some(m=>m.id==='mba13-m1')`));
  for (const chip of ['m2','m3','m4','m5']) {
    for (const size of [13,15]) assert.ok(models.some(m=>m.id===`mba${size}-${chip}`));
  }
  for (const chip of ['m1','m2','m3','m4','m5']) {
    for (const size of [14,16]) assert.ok(models.some(m=>m.id===`mbp${size}-${chip}pro`));
  }
});

test('choosing a viewing model fills only diagonal and preserves recipient resolution/DPR on handoff', () => {
  const a = app();
  a.run(`state.monitorW=3000;state.monitorH=2000;state.monitorDpr=1.75;state.cssPpi=110;state.calibrated=true;globalThis.chosen=withViewingMonitorModel('dell-u3225qe')`);
  assert.equal(a.run('chosen.monitorDiag'), 31.5);
  assert.equal(a.run('chosen.monitorModelId'), 'dell-u3225qe');
  assert.equal(a.run('chosen.monitorW'), 3000);
  assert.equal(a.run('chosen.monitorH'), 2000);
  assert.equal(a.run('chosen.monitorDpr'), 1.75);
  assert.equal(a.run('chosen.cssPpi'), null);
  assert.equal(a.run('chosen.calibrated'), false);
  a.run(`globalThis.imported=projectWorkspace(createProject(),chosen)`);
  for (const key of ['monitorW','monitorH','monitorDiag','monitorDpr','monitorModelId','monitorBrand','monitorSize']) {
    assert.equal(a.run(`imported.${key}`), a.run(`chosen.${key}`));
    assert.equal(key in a.json('createProject(chosen)'), false);
  }
  assert.throws(() => a.run(`withViewingMonitorModel('nonexistent')`));
});

test('autosave restores the latest named working copy and local monitor without updating its snapshot', () => {
  const a = withStorage();
  a.run(`
    globalThis.document={getElementById:()=>({textContent:'',classList:{remove(){},add(){}}})};
    globalThis.first=saveNamedWorkspace('First',createProject());
    state=withViewingMonitorModel('mba15-m4');state.monitorBrand='Apple';state.monitorSize='15';
    state.workspaceName='First';state.savedWorkspaceId=first.entry.id;state.source='rectangles';
    state.rectangles[1].description='Latest unsnapshotted edit';state.cssPpi=119.5;state.calibrated=true;
    save();state=defaults();restore();
  `);
  assert.equal(a.run('state.rectangles[1].description'), 'Latest unsnapshotted edit');
  assert.equal(a.run('readWorkspaceLibrary().entries[0].project.rectangles[1].description'), '');
  assert.equal(a.run('state.workspaceName'), 'First');
  assert.equal(a.run('state.savedWorkspaceId'), a.run('first.entry.id'));
  assert.equal(a.run('state.monitorModelId'), 'mba15-m4');
  assert.equal(a.run('state.monitorSize'), '15');
  assert.equal(a.run('state.cssPpi'), 119.5);
  assert.equal(a.run('state.calibrated'), true);
});

test('leaving captures uncommitted monitor numbers, ignores incomplete values, and preserves unchanged calibration', () => {
  const a = withStorage();
  a.run(`
    globalThis.nodes=Object.fromEntries([
      ['monitorW',640,16000],['monitorH',480,10000],['monitorDiag',8,120],['monitorDpr',.5,5]
    ].map(([id,min,max])=>[id,{value:String(state[id]),min:String(min),max:String(max)}]));
    globalThis.document={getElementById:id=>nodes[id]||{textContent:'',classList:{remove(){},add(){}}}};
    render=()=>{};state.cssPpi=120;state.calibrated=true;saveBeforeLeaving();
  `);
  assert.equal(a.run('state.cssPpi'), 120);
  assert.equal(a.run('state.calibrated'), true);
  a.run(`nodes.monitorDiag.value='29.5';nodes.monitorW.value='0';nodes.monitorDpr.value='';saveBeforeLeaving();state=defaults();restore()`);
  assert.equal(a.run('state.monitorDiag'), 29.5);
  assert.equal(a.run('state.monitorW'), 1920);
  assert.equal(a.run('state.monitorDpr'), 2);
  assert.equal(a.run('state.calibrated'), false);
});

test('live calibration changes physical scale without changing browser viewports or physical dimensions', () => {
  const a = app();
  a.run('queueRender=()=>{};state.cssPpi=96;state.calibrated=true');
  const dimensions = a.json('state.devices.map(dimensions)');
  const specs = a.json(`browserPageSpecs(state.devices,'https://example.com/')`);
  const before = a.run('millimetersToCss(100)');
  assert.equal(a.run('setLiveCalibration(120)'), true);
  assert.ok(Math.abs(a.run('millimetersToCss(100)') / before - 1.25) < 1e-9);
  assert.deepEqual(a.json('state.devices.map(dimensions)'), dimensions);
  assert.deepEqual(a.json(`browserPageSpecs(state.devices,'https://example.com/')`), specs);
  assert.deepEqual(a.json('calibrationSliderBounds(120)'), { min: 25, max: 400 });
  assert.deepEqual(a.json('calibrationSliderBounds(1)'), { min: 1, max: 400 });
  assert.deepEqual(a.json('calibrationSliderBounds(4500)'), { min: 25, max: 4500 });
  for (const input of ['', 'NaN', '0', '5001']) assert.equal(a.run(`setLiveCalibration(${JSON.stringify(input)})`), false);
  assert.equal(a.run('state.cssPpi'), 120);
});
