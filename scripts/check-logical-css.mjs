#!/usr/bin/env node
/**
 * Fails when physical (left/right) layout utilities or CSS properties are used.
 * RTL/LTR mirroring relies on logical properties only: ms-/me-/ps-/pe-/start-/end-,
 * text-start/text-end, border-s/border-e, rounded-s/rounded-e, margin-inline-start, ...
 *
 * Usage: node scripts/check-logical-css.mjs <dir> [<dir> ...]
 * Suppress a deliberate exception with a trailing `logical-css-ignore` comment.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const TAILWIND_PHYSICAL =
  /(?<=^|[\s"'`:{(])-?(?:m[lr]|p[lr]|left|right|border-[lr]|rounded-(?:[lr]|[tb][lr])|scroll-[mp][lr]|inset-[lr])-[\w.[\]/%-]+|(?<=^|[\s"'`:{(])(?:text|float|clear)-(?:left|right)(?=$|[\s"'`}])/g;
const CSS_PHYSICAL =
  /(?:^|[\s;{])(?:margin|padding|border)-(?:left|right)\s*:|(?:^|[\s;{])(?:left|right)\s*:\s*[^;]+;|text-align\s*:\s*(?:left|right)|float\s*:\s*(?:left|right)/g;

const EXTENSIONS = new Set(['.ts', '.tsx', '.css']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '.turbo']);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (EXTENSIONS.has(extname(full)) && !/\.(test|spec)\.tsx?$/.test(full)) yield full;
  }
}

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error('usage: check-logical-css.mjs <dir> [...]');
  process.exit(2);
}

const problems = [];
for (const root of roots) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      const isComment = trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
      if (isComment || line.includes('logical-css-ignore')) return;
      const pattern = extname(file) === '.css' ? CSS_PHYSICAL : TAILWIND_PHYSICAL;
      for (const match of line.matchAll(pattern)) {
        problems.push(`${file}:${i + 1}: physical direction "${match[0].trim()}" (use a logical equivalent)`);
      }
    });
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} physical-direction usage(s) found.`);
  process.exit(1);
}
console.log(`logical-css: OK (${roots.join(', ')})`);
