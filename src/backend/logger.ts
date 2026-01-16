import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const logLevel = process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug");

const transport = isProduction
  ? undefined
  : pino.transport({
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    });

export const logger = pino(
  {
    level: logLevel,
    redact: {
      paths: [
        "authorization",
        "password",
        "token",
        "apiKey",
        "headers.authorization",
        "req.headers.authorization",
      ],
      remove: true,
    },
  },
  transport,
);

export const createLogger = (scope: string) => logger.child({ scope });
