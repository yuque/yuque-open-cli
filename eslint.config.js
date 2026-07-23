import tseslint from '@typescript-eslint/eslint-plugin';

const typedFiles = ['src/**/*.ts', 'tests/**/*.ts', '*.config.ts'];
const javascriptFiles = ['scripts/**/*.js', '*.config.js'];

export default [
  {
    ignores: ['coverage/', 'dist/', 'node_modules/'],
  },
  ...tseslint.configs['flat/recommended-type-checked'].map((config) => ({
    ...config,
    files: typedFiles,
  })),
  {
    files: typedFiles,
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  ...tseslint.configs['flat/recommended'].map((config) => ({
    ...config,
    files: javascriptFiles,
  })),
  {
    ...tseslint.configs['flat/disable-type-checked'],
    files: javascriptFiles,
  },
];
