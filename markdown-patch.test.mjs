import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {performance} from 'node:perf_hooks';
const require=createRequire(import.meta.url),MarkdownIt=require('markdown-it');
test('reviewed markdown patch renders ordinary content and keeps HTML disabled by default',()=>{
 assert.equal(require('markdown-it/package.json').version,'14.3.3');
 const md=new MarkdownIt();assert.equal(md.render('# Title\n'),'<h1>Title</h1>\n');
 assert.equal(md.render('**bold** and *italic*'),'<p><strong>bold</strong> and <em>italic</em></p>\n');
 assert.match(md.render('| A | B |\n|---|---|\n|1|2|'),/<table>/);
 assert.match(md.render('[link](https://example.invalid)'),/href="https:\/\/example.invalid"/);
 assert.match(md.render('```js\nconst a=1;\n```'),/<code class="language-js">const a=1;/);
 assert.match(md.render('<script>alert(1)</script>'),/&lt;script&gt;/);
 assert.match(md.render('café 日本語'),/café 日本語/);
});
test('bounded malformed Markdown smoke covers both patched parser paths',{timeout:10000},()=>{
 const payloads=[{md:new MarkdownIt(),text:'[reference]: /example "unfinished\n'+'continuation text\n'.repeat(4000)},
  {md:new MarkdownIt({html:true}),text:'prefix '+'<!--'.repeat(10000)}];
 for(const {md,text}of payloads){const t=performance.now(),html=md.render(text);assert.equal(typeof html,'string');assert.ok(performance.now()-t<5000,'Bounded parser smoke exceeded five seconds')}
});
