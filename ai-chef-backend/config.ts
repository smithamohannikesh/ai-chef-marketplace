
const requiredEnvVars = [
  "JWT_SECRET",
  "OLLAMA_URL",
  "OLLAMA_MODEL",
];

for (const variable of requiredEnvVars) {
  if (!process.env[variable]) {
    throw new Error(
      `Missing required environment variable: ${variable}`
    );
  }
}

export const config = {
  jwtSecret: process.env.JWT_SECRET!,
  ollamaUrl: process.env.OLLAMA_URL!,
  ollamaModel: process.env.OLLAMA_MODEL!,
};
