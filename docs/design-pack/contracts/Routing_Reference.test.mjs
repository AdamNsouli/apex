import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectPair} from './Routing_Reference.mjs';
const c=(model,rawScore,costUpperUsd,latencyMs)=>({model,effort:'high',rawScore,costUpperUsd,latencyMs,benchmarkVersion:'fictional-v1'});
test('quality selects strongest comparable evidence',()=>assert.equal(selectPair([c('a',40,.01,1),c('b',60,.2,20)],'quality').selected.model,'b'));
test('sports rejects fast option outside raw evidence floor',()=>assert.equal(selectPair([c('a',40,.01,1),c('b',60,.2,20)],'sports').selected.model,'b'));
test('unknown eligible cost is not free and disables cost dimension',()=>{const r=selectPair([c('a',59,.2,1),c('b',60,null,20)],'eco');assert.equal(r.effectiveWeights[1],0)});
test('methodology mismatch holds',()=>{const a=c('a',40,.1,2),b={...c('b',50,.1,3),benchmarkVersion:'other'};assert.equal(selectPair([a,b],'balanced').kind,'hold')});
test('equal top scores have candidates and retain current on tie',()=>{const r=selectPair([c('a',60,.1,2),c('b',60,.1,2)],'quality','b|high');assert.equal(r.selected.model,'b')});
test('missing evidence holds',()=>assert.equal(selectPair([c('a',null,.1,2)],'eco').kind,'hold'));
test('bad estimate rejected',()=>assert.throws(()=>selectPair([c('a',1,-1,1)],'eco')));
test('empty candidates holds',()=>assert.equal(selectPair([],'balanced').kind,'hold'));
test('non-positive benchmark avoids meaningless ratio',()=>assert.equal(selectPair([c('a',-1,.01,1),c('b',0,.2,20)],'sports',undefined,false).selected.model,'b'));

test('sports chooses faster option within near-best evidence',()=>{const r=selectPair([c('a',40,.03,1500),c('b',58,.09,2200),c('c',59,.20,3200),c('d',60,.28,5000)],'sports');assert.equal(r.selected.model,'c')});
