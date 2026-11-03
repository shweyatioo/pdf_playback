import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanItems, buildSentences, type Item } from '../src/document.ts';
const item = (id: string,text: string,page: number,y: number,height=12): Item => ({id,text,page,y,height,x:40,width:300,font:'serif'});
const pages = [{width:600,height:800},{width:600,height:800}];
test('repeated margins are removed, but genuine headings survive',()=>{
  const cleaned = cleanItems([item('h1','Article name',0,20),item('h2','Article name',1,20),item('title','Article name',0,150,28),item('b','A useful article body with sufficient length to establish the body font.',0,230),item('f1','Page 1 of 2',0,770),item('f2','Page 2 of 2',1,770)],pages);
  assert.ok(cleaned[0].skipped);assert.ok(cleaned[1].skipped);assert.equal(cleaned[2].skipped,undefined);assert.ok(cleaned[4].skipped);assert.ok(cleaned[5].skipped);
});
test('cross-page sentences preserve source references',()=>{
  const sentences=buildSentences([item('a','This sentence crosses',0,720),item('b','a page boundary. Another sentence.',1,90)]);
  assert.equal(sentences[0].text,'This sentence crosses a page boundary.');
  assert.deepEqual(sentences[0].refs.map(r=>r.id),['a','b']);
  assert.equal(sentences[1].text,'Another sentence.');
  assert.equal(sentences[1].refs[0].start,17);
});
test('related content stops narration and restoring fragments restores their mapping',()=>{
  const cleaned=cleanItems([item('body','Main article.',0,100),item('related','Recommended For You',1,500),item('link','Other article',1,540)],pages);
  assert.equal(buildSentences(cleaned).length,1);
  cleaned[2].skipped=undefined;
  assert.equal(buildSentences(cleaned).at(-1)?.refs[0].id,'link');
});
test('author initials remain a single narration clip and biography is excluded',()=>{
  const cleaned=cleanItems([item('author','by James R. Detert',0,100),item('body','The article begins here.',0,180),item('bio','James R. Detert is the author of a book.',1,500),item('bio2','He works at a university.',1,520)],pages);
  const sentences=buildSentences(cleaned);
  assert.equal(sentences[0].text,'by James R. Detert');
  assert.equal(sentences.length,2);
  assert.equal(cleaned[2].skipped,'Author biography');
});
test('summary cleanup stops at the more control',()=>{
  const cleaned=cleanItems([item('s','Summary. A short preview...',0,100),item('m','more',0,120),item('b','The actual article starts here.',0,160)],pages);
  assert.equal(cleaned[0].skipped,'Article summary');
  assert.equal(cleaned[2].skipped,undefined);
});
