// One test inventory for development, CI and installed qualification.
export const coreTests=Object.freeze([
  "security.test.mjs",
  "file-operation-guard.test.mjs",
  "concurrency.test.mjs",
  "markdown-patch.test.mjs",
  "modern.test.mjs",
  "catalog.test.mjs",
  "discovery.integration.test.mjs",
  "scripts/tests/installer.test.mjs",
  "scripts/tests/roots.test.mjs",
  "scripts/tests/gui.test.mjs",
  "scripts/tests/wizard.test.mjs",
  "quiesce.disabled.integration.test.mjs",
  "project-inspect.test.mjs",
  "project-inspect.review-regression.test.mjs",
  "project-inspect.r3-boundaries.test.mjs",
  "project-inspect.r4-boundaries.test.mjs",
  "project-inspect.r5-ordinary.test.mjs",
  "project-inspect.integration.test.mjs",
  "unified.settings.test.mjs",
  "scripts/tests/test-selection.test.mjs",
  "scripts/tests/inspection-control.test.mjs",
  "inspection-owner.integration.test.mjs"
]);
export const indexTests=Object.freeze([
  "scripts/tests/index-feature.test.mjs",
  "scripts/tests/index-control.test.mjs",
  "scripts/tests/index-acl.test.mjs",
  "scripts/tests/index-review-repair.test.mjs",
  "scripts/tests/index-r10-health.test.mjs",
  "scripts/tests/index-stop-proof.test.mjs",
  "quiesce.race.integration.test.mjs",
  "quiesce.retained-lease.integration.test.mjs",
  "unified.integration.test.mjs",
  "prior-boot-recovery.test.mjs",
  "self-healing.test.mjs",
  "self-healing.release.test.mjs",
  "self-healing.integration.test.mjs",
  "index-resilience.test.mjs",
  "filename-query.test.mjs",
  "index-resilience.integration.test.mjs"
]);
export function selectTests(version=process.versions.node,mode='auto'){
 const major=Number(String(version).replace(/^v/,'').split('.')[0]);
 if(!Number.isInteger(major)||major<22)throw Error('DeskSom core requires Node.js 22 or newer');
 if(!['auto','core','index','all'].includes(mode))throw Error('Unknown test mode');
 if(['index','all'].includes(mode)&&major<25)throw Error('Indexed-search tests require Node.js 25 or newer');
 const withIndex=mode!=='core'&&major>=25;
 return {files:mode==='index'?[...indexTests]:[...coreTests,...(withIndex?indexTests:[])],
  coreIncluded:mode!=='index',indexIncluded:withIndex,indexReason:withIndex?'SELECTED':'NODE_BASELINE_OR_CORE_ONLY'};
}
