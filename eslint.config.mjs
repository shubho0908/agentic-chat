import { fixupConfigRules } from "@eslint/compat";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...fixupConfigRules(nextCoreWebVitals),
  ...fixupConfigRules(nextTypescript),
  {
    ignores: [
      "lib/generated/**",
    ],
  },
  {
    files: ["components/export/**/*.tsx"],
    rules: {
      "jsx-a11y/alt-text": ["warn", { img: ["Image"], components: [] }],
    },
  },
];

export default eslintConfig;
