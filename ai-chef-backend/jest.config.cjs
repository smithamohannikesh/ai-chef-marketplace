
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  setupFiles: ["<rootDir>/jest.setup.cjs"],
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
