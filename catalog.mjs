// Discovery resilience: preserve tool names, schemas and operation semantics.
 // Only descriptions, truthful annotations, and status diagnostics are changed.
const descriptions = {
  get_config: 'Read DeskSom configuration: allowed directories, command blocklist, shell, versions, usage and client context. No changes.',
  read_file: 'Read a file inside configured allowed directories. Absolute path recommended. offset/length paginate text; PDFs, DOCX, images, and spreadsheets supported.',
  read_multiple_files: 'Read several authorized files by absolute path in one request.',
  write_file: 'Create, replace, or append a file under an allowed directory. Use mode rewrite or append; keep chunks small. For unknown outcomes, check the file before retrying.',
  write_pdf: 'Create or revise a PDF inside allowed directories. For edits, use a distinct outputPath; do not overwrite the original.',
  create_directory: 'Create a directory (including parents) under an allowed root.',
  list_directory: 'List files and folders under an allowed root. Optional depth controls recursion.',
  move_file: 'Move or rename a file/directory; source and destination must be within allowed roots.',
  start_search: 'Search file paths or content in an authorized directory. Call get_more_search_results to paginate.',
  get_more_search_results: 'Read additional matches for an active search session.',
  stop_search: 'Cancel an active search session.',
  list_searches: 'List active search sessions.',
  get_file_info: 'Get metadata, permissions, timestamps and optional line counts for an authorized path.',
  edit_block: 'Edit existing content using exact old_string/new_string replacement, or spreadsheet range. Verify exact matches; do not blindly retry.',
  start_process: 'Execute a shell command on the trusted Windows host. NOT a sandbox; subject to Windows account permissions and blocked commands. Returns PID for long jobs.',
  read_process_output: 'Read output of a process started with start_process, by PID. Use short timeouts and bounded output.',
  interact_with_process: 'Send input to a running process or REPL by PID. May change host state; verify before retrying.',
  force_terminate: 'Force-stop a DeskSom process session by PID.',
  list_sessions: 'List DeskSom process sessions and their state.',
  list_processes: 'List running Windows processes, including PID and resource use.',
  kill_process: 'Terminate a Windows process by PID. Destructive; verify identity first.',
  get_usage_stats: 'Read aggregate usage, success rates, and tool counts.',
  get_recent_tool_calls: 'Read recent bounded DeskSom call history, filtered by time/tool. May contain sensitive project paths and contents.',
  get_prompts: 'Retrieve one of the built-in Desktop Commander onboarding prompts by promptId.'
};
export const FILE_MUTATIONS = Object.freeze(['create_directory','edit_block','move_file','write_file','write_pdf']);
export const EXECUTION_MUTATIONS = Object.freeze(['start_process','interact_with_process','force_terminate','kill_process']);
const mutations = new Set([...FILE_MUTATIONS, ...EXECUTION_MUTATIONS]);
export function prepareCatalog(upstream, disabled = new Set()) {
  if (!Array.isArray(upstream)) throw new TypeError('Upstream tools must be an array');
  const names = new Set();
  const catalog = upstream.filter(t => !disabled.has(t.name)).map(t => {
    if (names.has(t.name)) throw new Error('Duplicate tool name: '+t.name);
    names.add(t.name);
    const result = { ...t };
    if (Object.hasOwn(descriptions,t.name)) result.description = descriptions[t.name];
    if (mutations.has(t.name)) result.annotations = { ...t.annotations, readOnlyHint:false };
    if (t._meta && typeof t._meta==='object' && !Array.isArray(t._meta)) {
      const meta={...t._meta};
      for (const key of ['ui/resourceUri','openai/outputTemplate','openai/widgetAccessible','ui']) delete meta[key];
      if (Object.keys(meta).length) result._meta=meta; else delete result._meta;
    }
    return result;
  });
  if (catalog.some(t=>JSON.stringify(t).includes('ui://desktop-commander/'))) {
    throw Error('Unserved Desktop Commander UI resource in advertised catalog');
  }
  return catalog;
}
export function catalogCapabilities(tools) {
  const names = tools.map(t => t.name);
  const advertised = new Set(names);
  const fileWrites=FILE_MUTATIONS.filter(x=>advertised.has(x));
  const hostExecution=EXECUTION_MUTATIONS.filter(x=>advertised.has(x));
  return {
    toolCount: names.length,
    toolNames: names,
    fileMutationTools: fileWrites,
    hostExecutionTools: hostExecution,
    advertisesFileWrites: fileWrites.includes('write_file') && fileWrites.includes('edit_block'),
    advertisesHostExecution: hostExecution.includes('start_process'),
    clientVisibility: 'NOT_OBSERVABLE_FROM_DESKSOM_SERVER',
    permissions: 'NOT_PROVEN_BY_TOOL_DISCOVERY',
    interpretation: 'This is the server-advertised catalog. A ChatGPT conversation may receive a subset of tools. Test actual access in that conversation.'
  };
}
