import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Render user data with textContent / DOM nodes.' },
        { property: 'outerHTML', message: 'Render user data with textContent / DOM nodes.' },
      ],
    },
  },
);
