// r13_film_audio.mjs — assemble the Round 13 film narration (hybrid method),
// then build the emotional score + foley and mix/master to the measured targets.
import fs from 'node:fs';
import * as D from '../src/voicedir.mjs';
import * as VK from '../src/voicekit.mjs';
import * as P from '../src/prosody.mjs';
import * as AP from '../src/audiopipe.mjs';
import { SR } from '../src/sfxkit.mjs';
const R='research/artifacts/round13', F=`${R}/film`;
const script=fs.readFileSync(`${R}/script.txt`,'utf8');
const plan=D.direct(script,{keywords:['Vellara','Nora','bell','tower','sixty','bronze','silent','stone','four','three','rang'],leadIn:1.0});
fs.writeFileSync(`${F}/plan.json`,JSON.stringify(plan,null,2));
fs.writeFileSync(`${F}/direction.txt`,D.formatPlan(plan));
// trim the contextual take, align, restructure
const take=VK.loadVoice(`${F}/narration-take.wav`,SR);
const tr=VK.trimEdges(take,SR,{thrDb:-58});
VK.writeWav('/tmp/r13film-take.wav',tr.samples,SR);
const words=await AP.alignWords('/tmp/r13film-take.wav',script,{lang:'en'});
console.log('take trimmed to',(tr.samples.length/SR).toFixed(2),'s; words aligned:',words.length,'of',script.trim().split(/\s+/).length);
const asm=await VK.restructureTake(tr.samples,SR,words,plan,{leadIn:1.0,breaths:true,applyDsp:true});
VK.writeAssembly(asm,`${F}/narration`);
console.log('narration:',asm.durationSec,'s,',asm.beats.length,'beats,',asm.words.length,'words');
const m=P.analyzeTake(asm.samples,SR,{words:asm.words,label:'R13 film narration'});
const per=P.analyzeBeats(asm.samples,SR,asm.beats);
const v=P.beatVariation(per);
fs.writeFileSync(`${F}/narration-prosody.json`,JSON.stringify({global:m,perBeat:per,variation:v},null,2));
console.log('\nbeat  emotion      t0     dur   f0Hz rangeSt centroid');
for(const b of per) if(!b.skipped) console.log(`${b.id}  ${b.emotion.padEnd(11)} ${String(asm.beats.find(x=>x.id===b.id).t0).padStart(6)} ${String(b.dur).padStart(6)} ${String(b.f0MedianHz).padStart(5)} ${String(b.pitchRangeSt).padStart(7)} ${String(b.centroidHz).padStart(8)}`);
console.log('\nbetween-beat variation:',JSON.stringify(v));
console.log('\nglobal:',JSON.stringify({dur:m.durationSec,f0:m.f0MedianHz,rangeSt:m.pitchRangeSt,dyn:m.dynamicRangeDb,pauseMax:m.pauseMaxSec,centroid:m.centroidHz}));
