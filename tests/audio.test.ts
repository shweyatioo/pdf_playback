import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NARRATORS, normalizeWav } from '../server/audio.ts';

function wav(samples: number[]) {
  const bytes = Buffer.alloc(44 + samples.length * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length-8,4); bytes.write('WAVEfmt ',8);
  bytes.writeUInt32LE(16,16); bytes.writeUInt16LE(1,20); bytes.writeUInt16LE(1,22);
  bytes.writeUInt32LE(22050,24); bytes.writeUInt32LE(44100,28); bytes.writeUInt16LE(2,32); bytes.writeUInt16LE(16,34);
  bytes.write('data',36); bytes.writeUInt32LE(samples.length*2,40);
  samples.forEach((s,i)=>bytes.writeInt16LE(s,44+i*2)); return bytes;
}
test('quiet and loud speech reach the same level without counting silence',()=>{
  const quiet = wav([2000,-2000,0,0]), loud = wav([16000,-16000,0,0]);
  assert.equal(normalizeWav(quiet),4/22050); normalizeWav(loud);
  assert.equal(quiet.readInt16LE(44),loud.readInt16LE(44));
  assert.equal(quiet.readInt16LE(48),0);
  assert.ok(quiet.readInt16LE(44)>2000);
});
test('normalization preserves headroom and limits extreme amplification',()=>{
  const peak = wav([32767,...Array(1000).fill(1000)]); normalizeWav(peak);
  assert.ok(peak.readInt16LE(44)<=Math.ceil(32767*.95));
  const quiet=wav([10,-10]);normalizeWav(quiet);assert.equal(quiet.readInt16LE(44),40);
});
test('empty, silent, truncated, and unsupported audio fail instead of being cached',()=>{
  assert.throws(()=>normalizeWav(wav([])));
  assert.throws(()=>normalizeWav(wav([0,0])));
  assert.throws(()=>normalizeWav(wav([500]).subarray(0,45)));
  const compressed=wav([500]);compressed.writeUInt16LE(3,20);
  assert.throws(()=>normalizeWav(compressed));
});
test('only three supported narrators are exposed',()=>assert.deepEqual(NARRATORS,['Samantha','Daniel','Karen']));
