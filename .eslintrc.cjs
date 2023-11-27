module.exports = {
  "ignorePatterns": [
    "dist/**/*",
    "node_modules/**/*",
    ".eslintrc.cjs"
  ],
  "env": {
    "node": true,
    "es2021": true,
    "browser": true
  },
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-type-checked",
    "prettier"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module",
    "project": './tsconfig.json',
    "tsconfigRootDir": __dirname,
  },
  "plugins": [
    "@typescript-eslint",
    "prettier"
  ],
  "rules": {
    "prettier/prettier": [
      "warn",
      {
        "printWidth": 120,
        "tabWidth": 4
      }
    ]
  }
};