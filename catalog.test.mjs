import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCatalog,catalogCapabilities,FILE_MUTATIONS,EXECUTION_MUTATIONS} from './catalog.mjs';

test('compact descriptors preserve schema, names and independent catalog sources',()=>{
 const original=[
  {name:'write_file',description:'word '.repeat(2000),inputSchema:{type:'object',properties:{path:{type:'string'}}},
   annotations:{openWorldHint:false,readOnlyHint:true},_meta:{'ui/resourceUri':'ui://desktop-commander/test',custom:'retained'}},
  {name:'read_file',description:'word '.repeat(2000),inputSchema:{type:'object',properties:{offset:{type:'integer'}}}},
  {name:'set_config_value',description:'blocked'}
 ];
 const out=prepareCatalog(original,new Set(['set_config_value']));
 assert.equal(out.length,2);
 assert.equal(out[0].name,'write_file');
 assert.equal(out[0].inputSchema,original[0].inputSchema);
 assert.equal(out[1].inputSchema,original[1].inputSchema);
 assert.equal(out[0].annotations.readOnlyHint,false);
 assert.equal(out[0].annotations.openWorldHint,false);
 assert.equal(out[0]._meta.custom,'retained');
 assert.equal(out[0]._meta['ui/resourceUri'],undefined);
 assert.ok(out[0].description.length<300);
 assert.ok(out[1].description.length<300);
 assert.equal(original[0].annotations.readOnlyHint,true);
 assert.match(original[0].description,/word word/);
});test('status reports server capabilities without claiming client exposure or authorization',()=>{
 const tools=[{name:'desksom_status'}, ...FILE_MUTATIONS.map(name=>({name})),
   ...EXECUTION_MUTATIONS.map(name=>({name})), {name:'read_file'}];
 const status=catalogCapabilities(tools);
 assert.equal(status.toolCount,tools.length);
 assert.equal(status.advertisesFileWrites,true);
 assert.equal(status.advertisesHostExecution,true);
 assert.deepEqual(status.fileMutationTools,FILE_MUTATIONS);
 assert.equal(status.clientVisibility,'NOT_OBSERVABLE_FROM_DESKSOM_SERVER');
 assert.equal(status.permissions,'NOT_PROVEN_BY_TOOL_DISCOVERY');
 const reduced=catalogCapabilities([{name:'desksom_status'},{name:'read_file'}]);
 assert.equal(reduced.advertisesFileWrites,false);
 assert.equal(reduced.advertisesHostExecution,false);
});
test('unknown tools preserve full descriptions; duplicate names fail closed',()=>{
 const orig=[{name:'future_tool',description:'preserved',inputSchema:{type:'object'}}];
 assert.equal(prepareCatalog(orig)[0].description,'preserved');
 assert.throws(()=>prepareCatalog([...orig,...orig]),/Duplicate tool name/);
});
