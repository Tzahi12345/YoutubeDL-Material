const js = require('@eslint/js');
const globals = require('globals');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

const SOURCE_FILES = ['src/**/*.{js,ts}'];
const TS_FILES = ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.mts', 'src/**/*.cts'];

const scopedTsConfigs = tsPlugin.configs['flat/recommended'].map((config) => ({
  ...config,
  files: config.files ? config.files.map((pattern) => `src/${pattern}`) : TS_FILES,
}));

module.exports = [
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**'],
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
  },
  {
    files: SOURCE_FILES,
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
  },
  {
    ...js.configs.recommended,
    files: SOURCE_FILES,
  },
  ...scopedTsConfigs,
];
