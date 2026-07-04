/**
 * Reproducible Lambda bundler for OpenDraft (services/api).
 *
 * Compiles the three TypeScript handler entrypoints into Lambda-ready ESM
 * bundles under ./dist, one directory per artifact. Terraform then zips each
 * dist directory via `archive_file` (see ../modules/lambda). This script does
 * NOT touch app source — it only reads services/api/src/handlers/*.
 *
 *   dist/ws/index.mjs        -> ws-connect / ws-disconnect / ws-action lambdas
 *                               (handlers: index.connect / index.disconnect / index.action)
 *   dist/http/index.mjs      -> http lambda            (handler: index.handler)
 *   dist/autopick/index.mjs  -> autopick lambda        (handler: index.handler)
 *
 * The @aws-sdk/* packages are marked external: they are provided by the AWS
 * Lambda `nodejs20.x` runtime, so bundling them would only bloat cold starts.
 * Everything else (workspace packages, bcryptjs) is bundled in.
 */
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const handlers = resolve(repoRoot, 'services', 'api', 'src', 'handlers');
const outDir = resolve(here, 'dist');

/**
 * The api source is authored in NodeNext style: relative imports carry a `.js`
 * extension even though the files on disk are `.ts`. esbuild does not remap
 * that by default, so this resolver rewrites relative `*.js` specifiers to the
 * matching `*.ts` (or index) when only the TypeScript source exists.
 */
const tsExtensionResolver = {
  name: 'ts-js-extension-resolver',
  setup(build) {
    build.onResolve({ filter: /^\.\.?\// }, (args) => {
      if (!args.importer) return null;
      const abs = resolve(dirname(args.importer), args.path);
      if (args.path.endsWith('.js')) {
        const asTs = abs.replace(/\.js$/, '.ts');
        if (existsSync(asTs)) return { path: asTs };
        const asTsx = abs.replace(/\.js$/, '.tsx');
        if (existsSync(asTsx)) return { path: asTsx };
      }
      return null;
    });
  },
};

const targets = [
  { name: 'ws', entry: resolve(handlers, 'ws.ts') },
  { name: 'http', entry: resolve(handlers, 'http.ts') },
  { name: 'autopick', entry: resolve(handlers, 'autopick.ts') },
];

// createRequire banner: bcryptjs is CommonJS and may reach for `require`/
// `__dirname` at runtime; provide them in the ESM output.
const banner = {
  js: [
    "import { createRequire as __createRequire } from 'node:module';",
    "import { fileURLToPath as __fileURLToPath } from 'node:url';",
    "import { dirname as __pathDirname } from 'node:path';",
    'const require = __createRequire(import.meta.url);',
    'const __filename = __fileURLToPath(import.meta.url);',
    'const __dirname = __pathDirname(__filename);',
  ].join('\n'),
};

async function main() {
  await rm(outDir, { recursive: true, force: true });
  for (const t of targets) {
    await mkdir(resolve(outDir, t.name), { recursive: true });
    await esbuild.build({
      entryPoints: [t.entry],
      outfile: resolve(outDir, t.name, 'index.mjs'),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      sourcemap: false,
      minify: false,
      legalComments: 'none',
      external: ['@aws-sdk/*'],
      banner,
      plugins: [tsExtensionResolver],
      logLevel: 'info',
    });
    console.log(`built ${t.name} -> dist/${t.name}/index.mjs`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
