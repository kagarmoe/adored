import next from 'eslint-config-next';

// Flat config (ESLint 9). eslint-config-next@16 ships a native flat-config
// array (no FlatCompat bridge needed). This replaces the former .eslintrc.js
// (extends: ['next'] + the src/app repository import-boundary override,
// purses-25ca).

// Match the former `eslint . --ext .ts,.tsx`: only TypeScript sources are
// linted. `--ext` is gone in flat config, so we scope every config object to
// these globs instead (otherwise flat config would also lint .mjs/.js and
// surface warnings that ESLint 8 never checked).
const TS_FILES = ['**/*.ts', '**/*.tsx'];

const eslintConfig = [
  // Build output / generated files. Flat config only auto-ignores node_modules
  // and .git.
  {
    ignores: ['.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts'],
  },

  // ESLint 9 defaults reportUnusedDisableDirectives to "warn"; eslintrc (and
  // thus the prior config) defaulted it to "off". Preserve the prior behavior
  // so the pre-existing eslint-disable comments don't become new warnings.
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },

  // eslint-config-next@16's native flat-config array: the `next` base config
  // (react, react-hooks, @next/next, jsx-a11y, import), the `next/typescript`
  // parser setup, and a trailing global-ignores object. Scope the rule-bearing
  // configs to TS/TSX to match the former --ext; the ignores object must pass
  // through untouched (adding `files` to a global-ignores object would demote
  // it to a scoped no-op and un-ignore .next/ etc.).
  ...next.map((config) =>
    config.ignores ? config : { ...config, files: TS_FILES },
  ),

  // Project rule override (formerly the top-level `rules` block).
  {
    files: TS_FILES,
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  // eslint-config-next@16 (eslint-plugin-react-hooks@7) newly enables the
  // React Compiler lint rules as errors; the previous gate (eslint-config-next
  // @14 via FlatCompat) only ran rules-of-hooks + exhaustive-deps. Three of
  // the new rules fire on ~25 pre-existing call sites (setState inside an
  // effect, Date.now()/refs read during render) that the Next 16 config
  // migration must not rewrite. Keep exactly those three off until the
  // findings are fixed and they can be re-enabled; every other new compiler
  // rule stays active — the codebase already passes them.
  {
    files: TS_FILES,
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
    },
  },

  // Repository import-boundary (purses-25ca). Nothing under src/app (routes AND
  // Server Component pages) may import a repository implementation directly.
  // Use a controller (XController.fromDb(db)), a service, or the DAL/page access
  // guards. Repos are import-private to the server layer — they live only behind
  // src/server/{api,services,dal}. Test files are excluded via `ignores`.
  {
    files: ['src/app/**/*.ts', 'src/app/**/*.tsx'],
    ignores: ['src/app/**/*.test.ts', 'src/app/**/*.test.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/server/repositories/implementations/*',
                '**/server/repositories/implementations/*',
              ],
              message:
                'src/app must not import repositories directly — use a controller (XController.fromDb(db)), a service, or the DAL/page access guards. Repos are import-private to the server layer (purses-25ca).',
            },
          ],
        },
      ],
    },
  },

  // Raw-error leak guard. A route that reads `error.message` echoes Postgres driver text
  // (relation names, constraint names, sometimes values) straight to the caller. Every
  // catch under src/app/api returns errorResponse(error) instead — that mapper is the ONLY
  // place allowed to read .message, and it echoes it only for typed domain errors whose
  // message is curated copy. The rule is absolute, so it has no false positives.
  {
    files: ['src/app/api/**/*.ts'],
    ignores: ['src/app/api/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[property.name="message"]',
          message:
            'API routes must not read error.message — it leaks driver text to the caller. Return errorResponse(error) from the catch (src/server/api/http-errors.ts); add a typed error there if you need curated copy or a specific status.',
        },
        // The rule above bans one spelling; this one bans the SHAPE. Inside a catch, an
        // `error:` body value that is not a string literal is derived from the caught
        // error — String(e), `${e}`, e.toString(), a destructured `message`, or bare
        // `{ error }` (whose pg fields code/detail/table/constraint serialize too).
        // Curated literals stay legal, so the 413/generic-copy catches still pass.
        {
          selector:
            'CatchClause Property[key.name="error"]:not([value.type="Literal"])',
          message:
            'API routes must not derive the error body from the caught error — it leaks driver text to the caller. Return errorResponse(error) (src/server/api/http-errors.ts), or use a curated string literal.',
        },
      ],
    },
  },

  // Same leak, one layer down: helpers outside src/app/api also build the route's
  // response body (src/lib/photo-serving.ts serves /file; src/server/dal/collection-access.ts
  // returns the 403/404 a route hands straight back), so the guard has to follow them.
  // Only the SHAPE rule applies here — this layer legitimately reads .message (db-error-log,
  // the repository constraint sniffers, and errorResponse itself, which is the sanctioned mapper).
  {
    files: ['src/lib/**/*.ts', 'src/server/**/*.ts'],
    ignores: ['**/*.test.ts', 'src/server/api/http-errors.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CatchClause CallExpression[callee.object.name="NextResponse"][callee.property.name="json"] Property[key.name="error"]:not([value.type="Literal"])',
          message:
            'Do not derive an HTTP error body from the caught error — it leaks driver text to the caller. Return errorResponse(error) (src/server/api/http-errors.ts), or use a curated string literal.',
        },
      ],
    },
  },
];

export default eslintConfig;
