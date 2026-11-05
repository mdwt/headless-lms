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
        selector: `BinaryExpression[operator=/^[!=]==?$/][${side}.type='Identifier'][${side}.name=${ROLE_NAME}][${other}.type='Literal'][${other}.raw=/^['"]/]`,
        message: ROLE_LITERAL_MESSAGE,
      },
      {
        selector: `BinaryExpression[operator=/^[!=]==?$/][${side}.type='MemberExpression'][${side}.property.name=${ROLE_NAME}][${other}.type='Literal'][${other}.raw=/^['"]/]`,
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
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    rules: {
      // Honor the conventional `_`-prefix opt-out for intentionally-unused
      // bindings (e.g. role-agnostic guard signatures). The rule stays active
      // for every genuinely-unused identifier.
      "no-restricted-syntax": NO_ROLE_LITERALS,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
