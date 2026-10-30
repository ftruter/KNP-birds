import globals from 'globals'

const style = {
  'arrow-body-style': ['error', 'as-needed'],
  'prefer-arrow-callback': 'error',
  'func-style': ['error', 'expression', { allowArrowFunctions: true }],
  'no-else-return': 'error',
  'prefer-const': 'error',
  quotes: [
    'error',
    'single',
    { avoidEscape: true, allowTemplateLiterals: false },
  ],
}

export default [
  { ignores: ['node_modules/**', 'dist/**', '.wrangler/**'] },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2025,
      sourceType: 'module',
      globals: globals.serviceworker,
    },
    rules: style,
  },
  {
    files: ['test/**/*.js', 'scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2025,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: style,
  },
]
