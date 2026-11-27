// r13_abc.mjs — three-way: A isolated per-beat, B raw single take, C hybrid
// (contextual take cut + directed). Same voice, same story.
import fs from 'node:fs';
import * as VK from '../src/voicekit.mjs';
import * as P from '../src/prosody.mjs';
import { SR } from '../src/sfxkit.mjs';
const R='research/artifacts/round13', AB=`${R}/ab`;
const plan=JSON.parse(fs.readFileSync(`${R}/arc-plan.json`,'utf8'));
const cmp=JSON.parse(fs.readFileSync(`${AB}/comparison.json`,'utf8'));
const takeRaw=VK.loadVoice(`${AB}/B-baseline-single.wav`,SR);
const trimmed=VK.trimEdges(takeRaw,SR,{thrDb:-58});
// align the TRIMMED take so word times match the samples we cut from
const AP=await import('../src/audiopipe.mjs');
fs.writeFileSync('/tmp/r13take.wav',''); VK.writeWav('/tmp/r13take.wav',trimmed.samples,SR);
const scenes=JSON.parse(fs.readFileSync(`${R}/test-scenes.json`,'utf8')).scenes;
const words=await AP.alignWords('/tmp/r13take.wav',scenes.find(s=>s.id==='arc').script,{lang:'en'});
console.log('trimmed take words:',words.length,'dur',(trimmed.samples.length/SR).toFixed(2));
const C=await VK.restructureTake(trimmed.samples,SR,words,plan,{leadIn:0.8,breaths:true,applyDsp:true});
VK.writeAssembly(C,`${AB}/C-hybrid`);
const cPer=P.analyzeBeats(C.samples,SR,C.beats);
const vC=P.beatVariation(cPer);
const mA=P.analyzeTake(VK.loadVoice(`${AB}/A-directed.wav`,SR),SR,{label:'A isolated'});
const mB=P.analyzeTake(VK.loadVoice(`${AB}/B-baseline.wav`,SR),SR,{label:'B single'});
const mC=P.analyzeTake(C.samples,SR,{words:C.words,label:'C hybrid'});
fs.writeFileSync(`${AB}/three-way.json`,JSON.stringify({A:mA,B:mB,C:mC,perBeatC:cPer,variationC:vC},null,2));
const f=(v,d=2)=>v==null?'-':Number(v).toFixed(d);
console.log('\n════ THREE-WAY GLOBAL ════');
console.log('  metric                    A(isolated)   B(single)   C(hybrid)');
for(const k of ['durationSec','f0MedianHz','pitchRangeSt','pitchStdSt','gesturesPer10s','dynamicRangeDb','pauseMeanSec','pauseMaxSec','silenceFrac','centroidHz'])
  console.log('  '+k.padEnd(24)+String(mA[k]??'-').padStart(10)+String(mB[k]??'-').padStart(12)+String(mC[k]??'-').padStart(12));
console.log('\n════ C PER-BEAT ════');
console.log('  beat emotion     f0Hz rangeSt  w/s  centroid  dynDb');
for(const b of cPer) if(!b.skipped) console.log(`  ${b.id} ${b.emotion.padEnd(10)} ${String(b.f0MedianHz).padStart(5)} ${f(b.pitchRangeSt).padStart(7)} ${f(b.wordsPerSec).padStart(5)} ${String(b.centroidHz).padStart(8)} ${f(b.dynamicRangeDb).padStart(7)}`);
console.log('\n════ BETWEEN-BEAT STD (emotional travel) ════');
console.log('  metric            A(isolated)  B(single)  C(hybrid)');
for(const k of ['f0MedianHz','pitchRangeSt','wordsPerSec','dynamicRangeDb','centroidHz']){
  const a=cmp.variationFinalA[k]?.std, b=cmp.variationB[k]?.std, c=vC[k]?.std;
  console.log('  '+k.padEnd(17)+f(a).padStart(11)+f(b).padStart(11)+f(c).padStart(11));
}
console.log('\nC report:'); for(const r of C.report) console.log('  ',JSON.stringify(r));
