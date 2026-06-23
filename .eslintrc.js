module.exports = {
  extends: ['next'],
  rules: {
    '@next/next/no-html-link-for-pages': 'off',
  },
  overrides: [
    {
      // Nothing under src/app (routes AND Server Component pages) may import a
      // repository implementation directly. Use a controller (XController.fromDb(db)),
      // a service, or the DAL/page access guards. Repos are import-private to the
      // server layer — they live only behind src/server/{api,services,dal} (purses-25ca).
      files: ['src/app/**/*.ts', 'src/app/**/*.tsx'],
      excludedFiles: ['src/app/**/*.test.ts', 'src/app/**/*.test.tsx'],
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
  ],
};
