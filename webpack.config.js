/**
 * `nest build cli` bundles everything into a single dist/apps/cli/main.js via
 * webpack. That breaks `require.resolve('uiohook-napi')` in
 * UiohookInputLogger — webpack rewrites `require.resolve(<literal>)` into an
 * internal numeric module id instead of leaving it as a real filesystem path,
 * so the resolved "path" handed to the isolated input-logger child process
 * (which is NOT bundled — see input-logger-worker-script.ts) was garbage,
 * and `require(process.env.MT_UIOHOOK_PATH)` failed inside that child.
 * Marking the package external keeps webpack from touching it at all: the
 * bundle still does a normal `require('uiohook-napi')`/`require.resolve(...)`
 * against the real node_modules at runtime, same as an unbundled Node app.
 *
 * uiohook-napi is a native addon (ships a compiled .node binary per
 * platform/arch) — bundling that with the rest of the app was never going to
 * work regardless of this specific bug, so this is the correct fix in
 * general, not just a one-off patch.
 */
module.exports = (options) => ({
  ...options,
  externals: [...(options.externals ?? []), 'uiohook-napi', 'blessed'],
});
