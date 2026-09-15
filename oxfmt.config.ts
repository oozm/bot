import { defineConfig } from 'oxfmt'

export default defineConfig({
  printWidth: 80,
  tabWidth: 2,
  proseWrap: 'never',
  semi: false,
  singleQuote: true,
  quoteProps: 'as-needed',
  bracketSameLine: false,
  bracketSpacing: true,
  arrowParens: 'always',
  sortPackageJson: false,
  sortImports: false,
  trailingComma: 'all',
  endOfLine: 'lf',
  insertFinalNewline: true,
  embeddedLanguageFormatting: 'auto',
  htmlWhitespaceSensitivity: 'ignore',
  ignorePatterns: [
    'dist',
    'node_modules',
    '.history',
    'public',
    '**/*.svg',
    '**/*.sh',
    'pnpm-lock.yaml',
    'package-lock.json',
  ],
  overrides: [
    {
      files: ['*.json', '*.jsonc', '**/*.json', '**/*.jsonc'],
      options: {
        trailingComma: 'none',
        quoteProps: 'preserve',
        singleQuote: false,
      },
    },
  ],
})
