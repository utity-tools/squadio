/** Runs on staged files only; typecheck and tests run in CI. */
const config = {
  "*.{js,mjs,ts,mts,tsx}": "eslint --max-warnings=0 --fix",
  "*": "prettier --write --ignore-unknown",
};

export default config;
