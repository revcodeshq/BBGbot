module.exports = {
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'prettier',
  ],
  plugins: ['node'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    // Code quality rules
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'off', // Allow console.log for bot logging
    'no-process-exit': 'off', // Allow process.exit in CLI tools

    // Node.js specific rules
    'node/no-missing-import': 'off', // We use CommonJS require()
    'node/no-unsupported-features/es-syntax': 'off',

    // Best practices
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    'prefer-arrow-callback': 'error',

    // Style rules (handled by Prettier)
    'indent': 'off',
    'quotes': 'off',
    'semi': 'off',
    'comma-dangle': 'off',

    // Discord.js specific
    'no-async-promise-executor': 'off', // Common in Discord.js event handlers
  },
  ignorePatterns: [
    'node_modules/',
    'logs/',
    '*.log',
    '.env*',
    'coverage/',
    'docs/',
  ],
};