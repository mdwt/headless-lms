import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const ROLE_NAME = "/^(role|roleKey|roleName)$/";
const ROLE_LITERAL_MESSAGE =
  "decide with a permission check, never by comparing a role's name or key";
const NO_ROLE_LITERALS = [
  "error",
  ...["left", "right"].flatMap((side) => {
    const other = side === "left" ? "right" : "left";
    return [
      {
        selector: `BinaryExpression[operator=/^[!=]==?$/][${side}.type='Identifier'][${side}.name=${ROLE_NAME}][${other}.type='Literal'][${other}.raw=/^['\"]/]`,
        message: ROLE_LITERAL_MESSAGE,
      },
      {
        selector: `BinaryExpression[operator=/^[!=]==?$/][${side}.type='MemberExpression'][${side}.property.name=${ROLE_NAME}][${other}.type='Literal'][${other}.raw=/^['\"]/]`,
        message: ROLE_LITERAL_MESSAGE,
      },
    ];
  }),
  {
    selector: `SwitchStatement[discriminant.property.name=${ROLE_NAME}]`,
    message: ROLE_LITERAL_MESSAGE,
  },
  {
    selector: `SwitchStatement[discriminant.name=${ROLE_NAME}]`,
    message: ROLE_LITERAL_MESSAGE,
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-syntax": NO_ROLE_LITERALS,
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
