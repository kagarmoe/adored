module.exports = {
  extends: ['next'],
  rules: {
    '@next/next/no-html-link-for-pages': 'off',
  },
  overrides: [
    {
      // Routes must not import repository implementations directly.
      // Use a controller (XController.fromDb(db)), a service, or the DAL
      // capability guards. Repos are import-private to the server layer (purses-25ca).
      files: ['src/app/api/**/*.ts'],
      excludedFiles: ['src/app/api/**/*.test.ts'],
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
                  'Routes must not import repositories directly — use a controller (XController.fromDb(db)), a service, or the DAL capability guards. Repos are import-private to the server layer (purses-25ca).',
              },
            ],
          },
        ],
      },
    },
  ],
};
