#!/usr/bin/env node

/**
 * Personal Assistant MCP Server
 *
 * A comprehensive Model Context Protocol (MCP) server that transforms AI assistants into
 * powerful personal productivity companions. Integrates with Gmail, Google Calendar, and
 * LinkedIn to provide unified access to email management, calendar scheduling, and
 * professional networking capabilities.
 *
 * Key Features:
 * - 53+ MCP tools for complete productivity workflow automation
 * - Secure OAuth2 authentication with multiple service providers
 * - Email management: compose, send, organize, and automate Gmail operations
 * - Calendar management: create events, schedule meetings, manage multiple calendars
 * - Professional networking: LinkedIn profile access and content publishing
 * - Project management: GitHub zip indexing, clean project backups, task management, and analytics
 * - Unified API patterns for consistent tool usage across platforms
 * - File-based credential management for secure token storage
 *
 * Perfect for AI assistants that need to:
 * - Manage professional communications and scheduling
 * - Automate repetitive email and calendar tasks
 * - Publish content and manage social media presence
 * - Integrate multiple productivity platforms seamlessly
 *
 * For more information about MCP, visit:
 * https://modelcontextprotocol.io
 */

// Continue with normal MCP server startup
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createStatefulServer } from "@smithery/sdk/server/stateful.js";
import fs from "fs";
import path from "node:path";
import {
  registerGmailTools,
  registerGoogleCalendarTools,
  registerLinkedInTools,
  registerProjectManagementTools,
  registerTextFormatterTools,
  registerFacebookTools,
} from "./tools/index.js";
import { projectRoot } from "./utils/common.js";
import { logger } from "./utils/logger.js";

import {
  performGoogleAuth,
  performLinkedInAuth,
  displayHelp,
} from "./auth/index.js";
import { performFacebookAuth } from "./oauth/index.js";
import { configManager, ConfigManager } from "./utils/configManager.js";

// Handle authentication commands before importing heavy MCP modules
const args = process.argv.slice(2);
const command = args[0]?.toLowerCase();

// Handle authentication and utility commands
if (command) {
  switch (command) {
    case "auth":
    case "auth:google":
    case "google-auth":
      await performGoogleAuth();
      process.exit(0);

    case "auth:linkedin":
    case "linkedin-auth":
      await performLinkedInAuth();
      process.exit(0);

    case "auth:facebook":
    case "facebook-auth":
      await performFacebookAuth();
      process.exit(0);

    case "help":
    case "--help":
    case "-h":
      displayHelp();
      ConfigManager.displayCliHelp();
      process.exit(0);

    default:
      // If it's not a recognized command, continue with MCP server startup
      break;
  }
}

// Get version from package.json
const packageJsonPath = path.resolve(projectRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const version = packageJson.version || "1.0.0";
const name = packageJson.name || "pa-mcp-server";
const description =
  packageJson.description ||
  "Personal Assistant MCP Server - AI-powered productivity companion with Gmail, Google Calendar, and LinkedIn integrations for comprehensive workflow automation";

/**
 * Create a new MCP server instance with full capabilities
 */
const server = new McpServer({
  name: name,
  version: version,
  description: description,
  capabilities: {
    tools: {},
    resources: {},
    prompts: {},
    streaming: true,
  },
});

/**
 * Set up error handling for the server
 */
process.on("uncaughtException", (error: Error) => {
  logger.fatal(`Uncaught error: ${error.message}`, {
    stack: error.stack,
    name: error.name,
  });
  process.exit(1);
});

process.on(
  "unhandledRejection",
  (reason: unknown, promise: Promise<unknown>) => {
    logger.error(`Unhandled rejection`, {
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: promise.toString(),
    });
  }
);

/**
 * Register all available tools
 */
function registerTools(): void {
  const queryConfig = configManager.getQueryConfig();

  try {
    registerGmailTools(server, queryConfig);
    logger.info("Successfully registered Gmail tools");

    registerGoogleCalendarTools(server, queryConfig);
    logger.info("Successfully registered Google Calendar tools");

    registerLinkedInTools(server, queryConfig);
    logger.info("Successfully registered LinkedIn tools");

    registerProjectManagementTools(server, queryConfig);
    logger.info("Successfully registered Project Management tools");

    registerTextFormatterTools(server, queryConfig);
    logger.info("Successfully registered Text Formatter tools");

    registerFacebookTools(server, queryConfig);
    logger.info("Successfully registered Facebook tools");

    if (queryConfig) {
      logger.info("Tools registered with CLI/runtime configuration", {
        configKeys: Object.keys(queryConfig),
      });
    }
  } catch (error) {
    const errorMsg = `Failed to register tools: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
    logger.error(errorMsg, {
      error: error instanceof Error ? error.stack : error,
      hasQueryConfig: !!queryConfig,
    });
    process.exit(1);
  }
}

/**
 * Set up proper cleanup on process termination
 */
async function cleanup(): Promise<void> {
  try {
    await server.close();
    logger.info("Server shutdown completed");
  } catch (error) {
    const errorMsg = `Error during shutdown: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
    logger.error(errorMsg, {
      error: error instanceof Error ? error.stack : error,
    });
  } finally {
    // Give logger time to write final messages
    await new Promise((resolve) => setTimeout(resolve, 100));
    process.exit(0);
  }
}

// Handle termination signals
process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);
process.on("SIGHUP", cleanup);

/**
 * Main server startup function
 */
async function main(): Promise<void> {
  try {
    logger.info("Personal Assistant MCP Server starting up", { version, name });

    // Get configuration from ConfigManager
    const generalConfig = configManager.getGeneralConfig();

    // Create config directory
    fs.mkdirSync(generalConfig.mcpConfigDir, { recursive: true });
    logger.info(
      `Config directory created/verified: ${generalConfig.mcpConfigDir}`
    );

    // Register tools
    registerTools();

    // Set up communication with the MCP host using stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info("Personal Assistant MCP Server started successfully");
    console.error(
      "🤖 Personal Assistant Ready: 66+ productivity tools available\n" +
        "   📧 Gmail: 40+ email management tools\n" +
        "   📅 Calendar: 6 scheduling & event tools\n" +
        "   💼 LinkedIn: 6+ professional networking tools\n" +
        "   📱 Facebook: 9 page management tools\n" +
        "   📁 Projects: 4 management, backup & analytics tools\n" +
        "   ✨ Text: 4 Unicode formatting tools (Bold, Italic, Bold-Italic Serif)"
    );

    // add the console.log to get port on whichg mCP server running
    console.log(`MCP server is running with PID: ${process.pid}`);

    // MCP servers use stdio transport (not HTTP ports) for communication with AI tools
    // OAuth authentication servers use the configured OAuth port when needed
    console.log(
      `📡 MCP Server: stdio transport (no HTTP port - communicates with Claude directly)`
    );
    console.log(
      `🔐 OAuth Server: port ${generalConfig.oauthPort} (temporary, only during authentication)`
    );
    console.log(
      `🔄 These are SEPARATE servers - MCP server does NOT use OAuth port`
    );
  } catch (error) {
    const errorMsg = `Failed to start server: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
    logger.error(errorMsg, {
      error: error instanceof Error ? error.stack : error,
    });
    process.exit(1);
  }
}

// Only run main if not in test environment
if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
  // Start the server
  main().catch((error) => {
    logger.fatal(
      `Fatal error in main(): ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      {
        error: error instanceof Error ? error.stack : error,
      }
    );
    process.exit(1);
  });

  // Cleanup on process exit
  process.on("exit", () => {
    logger.info("Server process exited");
  });

  // Log startup information
  logger.info("Personal Assistant MCP Server", {
    version,
    capabilities: "tools, resources, prompts, streaming",
    logFile: logger.getLogFilePath(),
  });
} else {
  // Don't start the server in test mode
  logger.info("Test environment detected - server not started");
}
