import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // eslint-plugin-react-hooks 7.1 made these React Compiler rules errors;
  // existing code predates them. Warn until those components are reworked.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      // Every <img> here is a Drive thumbnail, a Storage cache URL, a blob:
      // preview or the logo. next/image can't take blob: URLs and would bill
      // Vercel image optimization for the rest, so plain <img> is deliberate.
      "@next/next/no-img-element": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Compiled Cloud Function output (built by its own tsc, deployed via gcloud)
    "functions/**/dist/**",
  ]),
]);

export default eslintConfig;
