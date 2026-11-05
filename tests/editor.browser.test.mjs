// SPDX-License-Identifier: GPL-3.0-only
// Isolated Chrome profiles; the application itself runs directly from file://.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const select = (page, id) => page.locator('[data-rect-select="' + id + '"]').click();
async function number(page, id, value) { await page.locator('#' + id).fill(String(value));await page.locator('#' + id).press('Tab'); }
async function bounds(page, ids) {
  return page.evaluate(ids => ids.map(id => { const g=referenceLayout().byId.get(id);return {id,x:g.x,y:g.y,w:g.w,h:g.h}; }), ids);
}
async function renderedBounds(page, ids) {
  return page.evaluate(ids=>{
    const layer=document.querySelector('.shape-layer'), parent=layer.getBoundingClientRect();
    return ids.map(id=>{const box=layer.querySelector('[data-rect-id="'+id+'"]').getBoundingClientRect();return {x:box.x-parent.x,y:box.y-parent.y,w:box.width,h:box.height};});
  },ids);
}
function closeEnough(actual, expected) {
  for (const key of ['x','y','w','h']) assert.ok(Math.abs(actual[key]-expected[key])<.001, key + ': ' + actual[key] + ' != ' + expected[key]);
}
async function download(page, selector) {
  const event=page.waitForEvent('download');await page.click(selector);const result=await event;
  return { name:result.suggestedFilename(), data:await readFile(await result.path()) };
}

test('grouped editor preserves active geometry, lays out stacks, constrains Fit dependencies and restores nested edits', {timeout:90000}, async () => {
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
    page.on('pageerror', e=>errors.push(e.message));page.on('console', msg=>{if(msg.type()==='error')errors.push(msg.text());});
    page.on('dialog', dialog=>dialog.accept());
    await page.goto(pathToFileURL(path.resolve('index.html')).href);
    await page.click('[data-source="rectangles"]');
    assert.match(await page.title(), /0\.01\.261105\.02/);
    await select(page,'shape-1');await page.locator('[data-rect-check="shape-2"]').check();
    const before=await bounds(page,['shape-1','shape-2']);
    const beforePixels=await renderedBounds(page,['shape-1','shape-2']);
    await page.click('#groupRectsBtn');
    const group=await page.evaluate(()=>state.rectSelected);
    const after=await bounds(page,['shape-1','shape-2']);
    after.forEach((g,i)=>closeEnough(g,before[i]));
    (await renderedBounds(page,['shape-1','shape-2'])).forEach((g,i)=>closeEnough(g,beforePixels[i]));
    assert.equal(await page.evaluate(id=>DeviceScaleLayout.find(state.rectangles,id).node.children.length,group),2);
    await page.locator('#rectName').fill('Page group');
    await page.selectOption('#containerLayout','horizontal');
    await number(page,'rectW',300);await number(page,'rectH',160);
    for(const [id,value] of [['paddingTop',10],['paddingRight',14],['paddingBottom',16],['paddingLeft',12],['containerGap',9]])await number(page,id,value);
    await page.selectOption('#containerAlignX','center');await page.selectOption('#containerAlignY','bottom');
    await select(page,'shape-1');await number(page,'rectW',60);await number(page,'rectH',40);
    assert.equal(await page.locator('#rectX').isDisabled(),true);
    await select(page,'shape-2');await number(page,'rectW',80);await number(page,'rectH',50);
    const arranged=await bounds(page,['shape-1','shape-2']);
    closeEnough(arranged[0],{x:74.5,y:104,w:60,h:40});closeEnough(arranged[1],{x:143.5,y:94,w:80,h:50});
    await select(page,'shape-1');await page.selectOption('#rectWidthMode','fill');
    assert.equal((await bounds(page,['shape-1']))[0].w,185);
    await select(page,group);
    assert.equal(await page.locator('#rectWidthMode option[value="fit"]').isDisabled(),true);
    await select(page,'shape-1');await page.selectOption('#rectWidthMode','fixed');
    await select(page,group);await page.selectOption('#rectWidthMode','fit');await page.selectOption('#rectHeightMode','fit');
    closeEnough((await bounds(page,[group]))[0],{x:0,y:0,w:175,h:76});
    assert.equal(await page.locator('#rectW').isDisabled(),true);
    await select(page,'shape-1');assert.equal(await page.locator('#rectHeightMode option[value="fill"]').isDisabled(),true);
    await page.click('#rectForwardBtn');
    assert.deepEqual(await page.evaluate(id=>DeviceScaleLayout.find(state.rectangles,id).node.children.map(n=>n.id),group),['shape-2','shape-1']);
    const dragged=page.locator('.shape-layer').first().locator('[data-rect-id="shape-1"]');
    await dragged.scrollIntoViewIfNeeded();const from=await dragged.boundingBox();
    const to=await page.locator('.shape-layer').first().locator('[data-rect-id="shape-2"]').boundingBox();
    // Grab the upper-left corner, outside the visible lower-right resize handle.
    await page.mouse.move(from.x+2,from.y+2);await page.mouse.down();
    assert.equal(await page.evaluate(()=>rectGesture?.action),'reorder');
    await page.mouse.move(to.x+2,from.y+2,{steps:8});await page.mouse.up();
    assert.deepEqual(await page.evaluate(id=>DeviceScaleLayout.find(state.rectangles,id).node.children.map(n=>n.id),group),['shape-1','shape-2']);

    await select(page,group);await page.click('#addGroupBtn');const nested=await page.evaluate(()=>state.rectSelected);
    await page.locator('#rectName').fill('Nested card');await page.selectOption('#containerLayout','vertical');
    await page.click('#addRectBtn');const child=await page.evaluate(()=>state.rectSelected);
    await page.locator('#rectName').fill('Nested label');await page.locator('#rectDescription').fill('A nested description');
    assert.equal(await page.evaluate(id=>DeviceScaleLayout.find(state.rectangles,id).parent.id,child),nested);
    // Keyboard activation opens the same properties editor on a device.
    const shape=page.locator('.shape-layer').first().locator('[data-rect-id="'+child+'"]');
    await shape.focus();await shape.press('Enter');
    assert.equal(await page.locator('#rectPopup').isVisible(),true);
    await page.locator('#popupRectName').fill('Nested label edited');await page.locator('#popupRectName').press('Escape');
    assert.equal(await page.locator('#rectPopup').isVisible(),false);
    assert.equal(await page.evaluate(id=>DeviceScaleLayout.find(state.rectangles,id).node.name,child),'Nested label edited');
    await select(page,child);await page.selectOption('#moveContainer',group);
    assert.equal(await page.evaluate(id=>DeviceScaleLayout.find(state.rectangles,id).parent.id,child),group);
    await page.selectOption('#moveContainer',nested);
    assert.equal(await page.evaluate(id=>DeviceScaleLayout.find(state.rectangles,id).parent.id,child),nested);
    await select(page,group);await page.click('#duplicateRectBtn');const copy=await page.evaluate(()=>state.rectSelected);
    const copied=await page.evaluate(id=>DeviceScaleLayout.walk([DeviceScaleLayout.find(state.rectangles,id).node]).map(n=>n.id),copy);
    assert.equal(copied.length,5);
    assert.ok(!copied.includes(child)&&!copied.includes(nested));
    assert.equal(await page.evaluate(()=>new Set(allObjects().map(n=>n.id)).size===allObjects().length),true);
    await page.click('#deleteRectBtn');assert.equal(await page.evaluate(id=>!!DeviceScaleLayout.find(state.rectangles,id),copy),false);
    await select(page,child);
    await page.click('#workspacesBtn');await page.locator('#workspaceName').fill('Nested review');await page.click('#saveWorkspaceBtn');
    assert.equal(await page.locator('#savedWorkspaceSelect option:checked').textContent(),'Nested review');
    assert.equal(await page.locator('#savedWorkspaceSummary').textContent(),'3 devices · 8 objects');
    await page.click('#closeWorkspacesBtn');
    const project=await page.evaluate(()=>createProject());
    await page.reload();await page.click('[data-source="rectangles"]');
    assert.deepEqual(await page.evaluate(()=>createProject()),project);
    assert.equal(await page.evaluate(id=>DeviceScaleLayout.find(state.rectangles,id).node.name,child),'Nested label edited');
    await page.screenshot({path:path.join(os.tmpdir(),'devicescale-nested-editor.png')});
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});

test('editor exports Markdown, editable v3 projects and PNG from the same shared hierarchy', {timeout:60000}, async () => {
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve('index.html')).href);await page.click('[data-source="rectangles"]');
    await select(page,'shape-1');await page.locator('.shape-layer').first().locator('[data-rect-id="shape-2"]').click({modifiers:['Shift']});
    assert.equal(await page.locator('[data-rect-check="shape-1"]').isChecked(),true);
    assert.equal(await page.locator('[data-rect-check="shape-2"]').isChecked(),true);
    await page.click('#groupRectsBtn');
    const group=await page.evaluate(()=>state.rectSelected);
    await page.locator('#rectName').fill('Header | <literal>');
    await page.selectOption('#containerLayout','horizontal');await page.selectOption('#rectWidthMode','fill');await number(page,'rectH',160);
    for(const id of ['paddingTop','paddingRight','paddingBottom','paddingLeft'])await number(page,id,10);
    await select(page,'shape-2');await number(page,'rectW',80);await number(page,'rectH',50);
    await page.locator('#rectDescription').fill('Line one | <literal>\n```json\nnot executable\n```');
    await select(page,'shape-1');await page.click('#groupRectsBtn');
    await page.selectOption('#rectWidthMode','fill');await page.selectOption('#rectHeightMode','fill');
    await select(page,'shape-1');await page.selectOption('#rectWidthMode','fill');await page.selectOption('#rectHeightMode','fill');
    await page.locator('[data-act="rotate"]').nth(1).click();
    const project=await page.evaluate(()=>createProject());
    assert.equal(new Set(project.devices.map(d=>d.orientation)).size,2);
    const md=await download(page,'#exportMarkdownBtn');assert.match(md.name,/\.md$/);
    const text=md.data.toString();assert.match(text,/0\.01\.261105\.02/);assert.match(text,/## Reference geometry/);
    const appendix=text.slice(text.indexOf('## Exact project data'));
    const match=appendix.match(/\n(`{3,})json\n([\s\S]*?)\n\1(?:\n|$)/);
    assert.ok(match,'Markdown has a complete JSON fence');assert.deepEqual(JSON.parse(match[2]),project);
    assert.ok(text.includes('Header \\| &lt;literal&gt;'));
    assert.equal('cssPpi' in JSON.parse(match[2]),false);
    const reference=await page.evaluate(()=>referenceLayout().items.map(({id,x,y,w,h})=>({id,x,y,w,h})));
    const rows=text.split('## Reference geometry')[1].split('## Exact project data')[0].split('\n').filter(line=>line.startsWith('|')).map(line=>line.split('|').slice(1,-1).map(s=>s.trim())).filter(cells=>Number.isFinite(Number(cells[1])));
    assert.equal(rows.length,reference.length);
    rows.forEach((cells,i)=>{assert.equal(cells[0].replace(/\\(.)/g,'$1'),reference[i].id);closeEnough({x:Number(cells[1]),y:Number(cells[2]),w:Number(cells[3]),h:Number(cells[4])},reference[i]);});
    const handoff=await download(page,'#exportProjectBtn');assert.match(handoff.name,/\.dslab$/);
    assert.deepEqual(JSON.parse(handoff.data.toString()),project);assert.equal(project.version,3);
    await page.evaluate(()=>{
      window.__exportDraws=[];window.__originalFillRect=CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect=function(x,y,w,h){window.__exportDraws.push({color:this.fillStyle,x,y,w,h});return window.__originalFillRect.call(this,x,y,w,h);};
    });
    let png;
    try{png=await download(page,'#exportBtn');}
    finally{await page.evaluate(()=>{CanvasRenderingContext2D.prototype.fillRect=window.__originalFillRect;delete window.__originalFillRect;});}
    assert.match(png.name,/\.png$/);
    assert.deepEqual([...png.data.subarray(0,8)],[137,80,78,71,13,10,26,10]);
    assert.ok(png.data.length>1000);
    const drawing=await page.evaluate(()=>({draws:window.__exportDraws,background:state.rectBg,devices:state.devices.map(d=>{const m=dimensions(d);return {width:m.logicalW,height:m.logicalH,items:layoutFor(m).items.filter(g=>g.node.type!=='container').map(g=>({id:g.id,color:g.node.fill,x:g.x,y:g.y,w:g.w,h:g.h}))};})}));
    const backgrounds=drawing.draws.map((draw,index)=>draw.color===drawing.background?index:-1).filter(index=>index>=0);
    assert.equal(backgrounds.length,drawing.devices.length);
    // Only the canvas, device backgrounds, and rectangle leaves use fillRect.
    // An accidentally painted container would add a draw call here.
    assert.equal(drawing.draws.length,1+drawing.devices.reduce((sum,d)=>sum+2+d.items.length,0));
    const colors=new Set(drawing.devices[0].items.map(item=>item.color));
    for(let i=0;i<drawing.devices.length;i++){
      const device=drawing.devices[i],background=drawing.draws[backgrounds[i]],scale=background.w/device.width;
      assert.ok(Math.abs(background.h/device.height-scale)<.00001);
      const shapes=drawing.draws.slice(backgrounds[i]+1,backgrounds[i+1]??drawing.draws.length).filter(draw=>colors.has(draw.color));
      assert.deepEqual(shapes.map(draw=>draw.color),device.items.map(item=>item.color));
      shapes.forEach((draw,j)=>closeEnough({x:(draw.x-background.x)/scale,y:(draw.y-background.y)/scale,w:draw.w/scale,h:draw.h/scale},device.items[j]));
    }
    assert.notEqual(drawing.devices[0].items.find(n=>n.id==='shape-1').w,drawing.devices[1].items.find(n=>n.id==='shape-1').w);
    // Ungroup restores children to the viewport and retains an editable layout.
    await select(page,group);await page.click('#ungroupRectsBtn');
    assert.equal(await page.evaluate(id=>!!DeviceScaleLayout.find(state.rectangles,id),group),false);
    assert.equal(await page.evaluate(()=>DeviceScaleLayout.find(state.rectangles,'shape-2').parent),null);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});

test('anchored dragging preserves edge offsets and resize handles turn Fit dimensions into fixed sizes', {timeout:45000}, async () => {
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1800,height:1300}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve('index.html')).href);await page.click('[data-source="rectangles"]');
    await page.locator('[data-act="remove"]').last().click();await page.locator('[data-act="remove"]').last().click();
    await page.click('#addRectBtn');const id=await page.evaluate(()=>state.rectSelected);
    await page.selectOption('#rectAnchorX','trailing');await page.selectOption('#rectAnchorY','bottom');
    const shape=page.locator('.shape-layer').first().locator('[data-rect-id="'+id+'"]');
    await shape.scrollIntoViewIfNeeded();const before=await renderedBounds(page,[id]),box=await shape.boundingBox();
    await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();
    assert.equal(await page.evaluate(()=>rectGesture?.action),'move');
    await page.mouse.move(box.x+5,box.y+10,{steps:8});await page.mouse.up();
    const moved=(await renderedBounds(page,[id]))[0];
    assert.ok(Math.abs(moved.x-before[0].x+15)<.02);assert.ok(Math.abs(moved.y-before[0].y+10)<.02);
    const anchors=await page.evaluate(()=>({anchorX:currentRect().anchorX,anchorY:currentRect().anchorY,x:currentRect().x,y:currentRect().y}));
    assert.equal(anchors.anchorX,'trailing');assert.equal(anchors.anchorY,'bottom');assert.ok(anchors.x>0&&anchors.y>0);
    await page.locator('#rectDescription').fill('Resize label');await page.selectOption('#rectWidthMode','fit');await page.selectOption('#rectHeightMode','fit');
    const fitted=(await bounds(page,[id]))[0];const handle=shape.locator('.shape-resize');await handle.scrollIntoViewIfNeeded();const grip=await handle.boundingBox();
    await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();
    assert.equal(await page.evaluate(()=>rectGesture?.action),'resize');
    await page.mouse.move(grip.x+grip.width/2+12,grip.y+grip.height/2+8,{steps:8});await page.mouse.up();
    const resized=(await bounds(page,[id]))[0];assert.ok(resized.w>fitted.w&&resized.h>fitted.h);
    assert.equal(await page.evaluate(()=>currentRect().widthMode),'fixed');assert.equal(await page.evaluate(()=>currentRect().heightMode),'fixed');
    assert.ok(Math.abs(resized.x+resized.w-fitted.x-fitted.w)<.01);assert.ok(Math.abs(resized.y+resized.h-fitted.y-fitted.h)<.01);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
