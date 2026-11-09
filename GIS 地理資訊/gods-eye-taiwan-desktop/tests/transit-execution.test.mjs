import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTraRateRules,estimateTraFare,estimateFromAdult} from '../overlay/server/providers/fareEstimates.js';
import {distinctTransitColor} from '../overlay/src/taiwan/routeColors.js';
import {buildTransitPlanConfirmation,buildTransitRecovery} from '../overlay/src/taiwan/transitRecovery.js';
import {createFareService} from '../overlay/server/providers/fareEngine.js';
import {finalizePlan} from '../overlay/server/providers/tdxTrip.js';
const page='<h2>票價計算原則（乘車日114年6月23日生效）</h2>起碼里程為10公里<table><tr><th>車種</th><th>50公里</th><th>50.1-100公里</th><th>100.1-200公里</th><th>200.1-300公里</th><th>300.1公里以上</th></tr><tr><td>區間車</td><td>2.18</td><td>1.92</td><td>1.81</td><td>1.53</td><td>1.42</td></tr><tr><td>莒光號</td><td>2.61</td><td>2.30</td><td>2.17</td><td>1.83</td><td>1.70</td></tr><tr><td>自強號</td><td>3.39</td><td>2.98</td><td>2.81</td><td>2.37</td><td>2.20</td></tr></table>孩童票價按成人票價半數';
const segment={mode:'TRA',trainClassStatus:'matched',transportType:'區間車',distanceMeters:60000,departureTime:'2026-10-07T09:00:00+08:00'};
test('official rates are parsed, not supplied by a language model',()=>{const rules=parseTraRateRules(page);assert.equal(rules.effectiveFrom,'2025-06-23');assert.equal(estimateTraFare(segment,{type:'adult'},'normal',rules).amount,128);const child=estimateTraFare(segment,{type:'child'},'normal',rules);assert.equal(child.amount,64);assert.equal(child.confidence,'estimated');assert.match(child.estimateBasis,/里程|資格/);});
test('invalid or changed official markup does not invent rates',()=>{assert.equal(parseTraRateRules(page.replace('3.39','999')),null);assert.equal(parseTraRateRules('2.18'),null);});
test('estimates require distance, matched class, current rules and ordinary seating',()=>{const rules=parseTraRateRules(page);for(const s of [{...segment,distanceMeters:null},{...segment,trainClassStatus:'unverified'},{...segment,departureTime:'2025-01-01T09:00:00+08:00'}])assert.equal(estimateTraFare(s,{type:'adult'},'normal',rules),null);assert.equal(estimateTraFare(segment,{type:'adult'},'premium',rules),null);});
test('adult reference is explicitly conservative, not a guessed discount',()=>{const q=estimateFromAdult({amount:50,confidence:'verified',sourceUrl:'https://tdx.transportdata.tw'}, {type:'child'});assert.equal(q.amount,50);assert.equal(q.estimated,true);assert.match(q.estimateBasis,/不扣減/);assert.equal(estimateFromAdult({amount:50,confidence:'unavailable'},{type:'child'}),null);});
test('mixed estimates are never promoted to a verified total',()=>{const p=finalizePlan({segments:[{fare:{amount:50}},{fare:{amount:64,estimated:true}}],notices:[]});assert.equal(p.totalFare,null);assert.equal(p.estimatedTotal,114);assert.equal(p.knownFare,50);assert.equal(p.fareComplete,false);});
test('transport and driving colours remain visibly different including saved collisions',()=>{for(const driving of ['#369cff','#ffac45','#ffffff'])assert.notEqual(distinctTransitColor(driving,driving),driving);assert.equal(distinctTransitColor('#ffac45','#369cff'),'#ffac45');});
test('three plan suggestions include one-click execution without changing passengers',()=>{const request={origin:'A',destination:'B',farePreference:{passengerProfiles:[{type:'adult',quantity:1},{type:'child',quantity:1}]}},r=buildTransitPlanConfirmation({request,plans:[{id:'one',departureTime:'9:00',arrivalTime:'10:00'}]});assert.equal(r.suggestions.length,3);assert.equal(r.suggestions[0].label,'按你建議執行');assert.equal(r.suggestions[0].action,'execute');assert.deepEqual(r.request.farePreference.passengerProfiles,request.farePreference.passengerProfiles);assert.equal(buildTransitRecovery(request,'查無班次').suggestions[0].action,'execute');});

test('repeated fare finalization distinguishes a complete estimate budget and does not duplicate warnings',()=>{
 const p={segments:[{fare:{amount:50}},{fare:{amount:64,estimated:true}}],notices:[]};finalizePlan(p);finalizePlan(p);assert.equal(p.notices.length,1);assert.match(p.notices[0],/官方費率估算/);assert.equal(p.totalFare,null);
});

test('each estimated passenger quote keeps its own ticket label and quantity',async()=>{
 const service=createFareService({basic:async()=>[],stations:async()=>[],fetcher:async()=>new Response(page),checkPolicy:false,now:()=>Date.parse('2026-10-07T00:00:00Z')});
 const q=await service.quoteSegment({...segment,from:{name:'A'},to:{name:'B'}},{passengerProfiles:[{type:'adult',quantity:1},{type:'child',quantity:1},{type:'student',quantity:2}]},{allowEstimates:true});
 assert.equal(q.quotes.length,3);assert.match(q.quotes[0].ticketType,/成人/);assert.match(q.quotes[1].ticketType,/兒童/);assert.match(q.quotes[2].ticketType,/學生/);assert.equal(q.quotes[2].quantity,2);assert.equal(q.quotes[2].amount,q.quotes[0].amount*2);assert.equal(q.complete,false);
});
