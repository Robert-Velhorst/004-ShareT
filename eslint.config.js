import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

const ignoredPaths = [
  "dist/**",
  "backend/frontend/**",
  "backend/models/**",
  "node_modules/**",
  ".eslintrc.cjs",
  "backend/utils/crypto.js",
  "backend/utils/httpClient.js",
  "backend/utils/imageProcessor.js",
  "src/components/AnalyticsDashboard.jsx",
  "src/components/ColorPicker.jsx",
  "src/components/CustomBranding.jsx",
  "src/components/EmailNotifications.jsx",
  "src/components/Footer.jsx",
  "src/components/Pricing.jsx",
  "src/components/Testimonials.jsx",
  "src/components/TrelloCardButton.jsx",
  "src/components/TrelloCardShare.jsx",
  "src/components/UserPreferences.jsx",
];

const reactRecommended = react.configs.flat.recommended;
const reactJsxRuntime = react.configs.flat["jsx-runtime"];
const hooksRecommended = reactHooks.configs.flat.recommended;

export default [
  { ignores: ignoredPaths },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 },
    },
  },
  {
    files: ["**/*.{js,jsx}"],
    plugins: {
      ...reactRecommended.plugins,
      ...reactJsxRuntime.plugins,
      ...hooksRecommended.plugins,
      "react-refresh": reactRefresh,
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 },
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...reactRecommended.rules,
      ...reactJsxRuntime.rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/jsx-no-target-blank": "off",
      "react/prop-types": "off",
      "react/no-unescaped-entities": "off",
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },
  {
    files: [
      "backend/**/*.js",
      "scripts/**/*.cjs",
      "ecosystem.config.js",
      "tailwind.config.cjs",
      "scripts/health-check.js",
    ],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node, ...globals.es2021 },
    },
  },
  {
    files: ["scripts/copy-frontend-build.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2021 },
    },
  },
  {
    files: ["extension/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2021, chrome: "readonly" },
    },
  },
];
