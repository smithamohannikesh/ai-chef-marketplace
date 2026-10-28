
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "@swc/jest",
      {
        jsc: {
          parser: {
            syntax: "typescript"
          },
          target: "es2022"
        },
        module: {
          type: "commonjs"
        }
      }
    ]
  }
};
