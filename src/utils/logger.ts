import fs from "node:fs";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

interface LoggerConfig {
  logFile?: string;
  logLevel?: LogLevel;
  enableConsole?: boolean;
  maxFileSize?: number; // in bytes
  includeStack?: boolean;
}

class Logger {
  private config: Required<LoggerConfig>;
  private logLevels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4,
  };

  private levelEmojis: Record<LogLevel, string> = {
    debug: "🔍",
    info: "ℹ️",
    warn: "⚠️",
    error: "❌",
    fatal: "💀",
  };

  private levelColors: Record<LogLevel, string> = {
    debug: "\x1b[36m", // cyan
    info: "\x1b[32m", // green
    warn: "\x1b[33m", // yellow
    error: "\x1b[31m", // red
    fatal: "\x1b[35m", // magenta
  };

  private reset = "\x1b[0m";

  constructor(config: LoggerConfig = {}) {
    this.config = {
      logFile: config.logFile || "pa-mcp-server.log",
      logLevel:
        config.logLevel ||
        (process.env.NODE_ENV === "development" ? "debug" : "info"),
      enableConsole:
        config.enableConsole !== undefined ? config.enableConsole : true,
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB default
      includeStack:
        config.includeStack !== undefined ? config.includeStack : false,
    };

    // Ensure log directory exists
    const logDir = path.dirname(this.config.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return this.logLevels[level] >= this.logLevels[this.config.logLevel];
  }

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const pid = process.pid;

    let formattedMessage = `[${timestamp}] [${pid}] [${level
      .toUpperCase()
      .padEnd(5)}] ${message}`;

    if (data !== undefined) {
      try {
        const dataStr =
          typeof data === "string" ? data : JSON.stringify(data, null, 2);
        formattedMessage += `\n${dataStr}`;
      } catch (error) {
        formattedMessage += `\n[Logger Error: Could not stringify data - ${error}]`;
      }
    }

    return formattedMessage;
  }

  private writeToFile(message: string): void {
    try {
      // Check file size and rotate if needed
      if (fs.existsSync(this.config.logFile)) {
        const stats = fs.statSync(this.config.logFile);
        if (stats.size > this.config.maxFileSize) {
          this.rotateLogFile();
        }
      }

      fs.appendFileSync(this.config.logFile, message + "\n", {
        encoding: "utf8",
      });
    } catch (error) {
      // Fallback to console if file writing fails
      console.error(`Logger: Failed to write to log file: ${error}`);
      console.error(`Original message: ${message}`);
    }
  }

  private rotateLogFile(): void {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const rotatedFile = this.config.logFile.replace(
        /\.log$/,
        `-${timestamp}.log`
      );
      fs.renameSync(this.config.logFile, rotatedFile);

      // Log rotation info to new file
      const rotationMsg = this.formatMessage(
        "info",
        `Log rotated. Previous log: ${rotatedFile}`
      );
      fs.writeFileSync(this.config.logFile, rotationMsg + "\n");
    } catch (error) {
      console.error(`Logger: Failed to rotate log file: ${error}`);
    }
  }

  private logToConsole(level: LogLevel, message: string): void {
    if (!this.config.enableConsole) return;

    const emoji = this.levelEmojis[level];
    const color = this.levelColors[level];
    const timestamp = new Date().toLocaleTimeString();

    const consoleMessage = `${emoji} ${color}[${timestamp}] [${level.toUpperCase()}]${
      this.reset
    } ${message}`;

    // Use appropriate console method based on level
    switch (level) {
      case "debug":
        console.debug(consoleMessage);
        break;
      case "info":
        console.info(consoleMessage);
        break;
      case "warn":
        console.warn(consoleMessage);
        break;
      case "error":
      case "fatal":
        console.error(consoleMessage);
        break;
      default:
        console.log(consoleMessage);
    }
  }

  private log(level: LogLevel, message: string, data?: any): void {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, data);

    // Write to file
    this.writeToFile(formattedMessage);

    // Log to console
    this.logToConsole(level, message);

    // Add stack trace for errors if enabled
    if ((level === "error" || level === "fatal") && this.config.includeStack) {
      const stack = new Error().stack;
      if (stack) {
        this.writeToFile(`Stack trace:\n${stack}`);
      }
    }
  }

  // Public logging methods
  debug(message: string, data?: any): void {
    this.log("debug", message, data);
  }

  info(message: string, data?: any): void {
    this.log("info", message, data);
  }

  warn(message: string, data?: any): void {
    this.log("warn", message, data);
  }

  error(message: string, data?: any): void {
    this.log("error", message, data);
  }

  fatal(message: string, data?: any): void {
    this.log("fatal", message, data);
  }

  // Utility methods
  setLogLevel(level: LogLevel): void {
    this.config.logLevel = level;
  }

  getLogLevel(): LogLevel {
    return this.config.logLevel;
  }

  getLogFilePath(): string {
    return path.resolve(this.config.logFile);
  }
}

// Export Logger class for custom instances
export { Logger };

// Create default logger instance
export const logger = new Logger();

// Backward compatibility function
export function logMessage(level: string, message: string, data?: any): void {
  const logLevel = level.toLowerCase() as LogLevel;
  if (logLevel in logger) {
    (logger as any)[logLevel](message, data);
  } else {
    logger.info(`[${level.toUpperCase()}] ${message}`, data);
  }
}
