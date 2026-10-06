import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
class Node {
  constructor(){this.hidden=false;this.style={};this.dataset={};this.nodes=new Map();this.events=new Map();this.classList={add(){},remove(){}};}
  querySelector(key){if(!this.nodes.has(key))this.nodes.set(key,new Node());return this.nodes.get(key);}
  querySelectorAll(){return [];}
  setAttribute(){} replaceChildren(){} append(){} appendChild(){} remove(){}
  addEventListener(k,f){this.events.set(k,f);} removeEventListener(k){this.events.delete(k);}
}
test('third person reuses tracker visual across cockpit switches without adding aircraft',async()=>{
 let added=0,refocused=0,stopped=0,cockpit=false,mode='normal',tracked=true;
 const entity={show:true},subject={id:'fixture-aircraft',label:'TEST594'};
 const tracker={getTrackedSubject:()=>tracked?subject:null,getTrackedInfo:()=>({altitudeM:11000}),trackById:()=>{tracked=true;viewer.trackedEntity=entity;return true;},refocusTrackedById:()=>{refocused++;return true;},stopTracking:()=>{tracked=false;stopped++;viewer.trackedEntity=null;}};
 const viewer={trackedEntity:entity,scene:{requestRender(){}},entities:{add(){added++;},remove(){}}};
 const window=new EventTarget(),context=vm.createContext({console,AbortController,window,document:{createElement:()=>new Node()},setInterval:()=>1,clearInterval(){}});
 const source=await readFile(new URL('../overlay/src/taiwan/flightObservation.js',import.meta.url),'utf8');
 const mod=new vm.SourceTextModule(source,{context});
 await mod.link(id=>{const exports=id==='cesium'?{Cartesian3:class{constructor(x,y,z){Object.assign(this,{x,y,z});}}}:{makePanelDraggable:()=>()=>{}};return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context});});await mod.evaluate();
 const assistant=mod.namespace.createFlightObservation({root:new Node(),viewer,dataManager:{layers:new Map([['flights',{module:tracker}]]),isEnabled:()=>true},styleManager:{getCockpitState:()=>({active:cockpit,subject:{...subject,layerId:'flights'}}),getContextModeState:()=>({mode,active:true}),setContextMode:async value=>{mode=value;return {ok:true};},controlCockpit:async action=>{cockpit=action==='enter';if(!cockpit)viewer.trackedEntity=null;return {ok:true};}}});
 await assistant.setView('third');assert.equal(added,0);assert.equal(viewer.trackedEntity,entity);assert.equal(entity.viewFrom.y,-2200);
 await assistant.setView('first');assert.equal(cockpit,true);
 await assistant.setView('third');assert.equal(cockpit,false);assert.equal(viewer.trackedEntity,entity);assert.equal(added,0);assert.equal(refocused,2);
 await assistant.stop();assert.equal(stopped,1);assert.equal(viewer.trackedEntity,null);assistant.destroy();
});
