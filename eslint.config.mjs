// Lints the server, the tests, the scripts and the React client in one pass.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', 'client/dist/', 'node_modules/', 'client/node_modules/', 'data/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // `_next` and friends: parameters Express needs by position
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Allows `declare global { namespace Express { ... } }`, which is how Express is typed
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    },
  },
  {
    files: ['server/**/*.ts', 'scripts/**/*.ts', 'tests/**/*.ts', '**/*.config.{js,cjs,mjs,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Response bodies in API tests are untyped JSON
    files: ['tests/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['client/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
