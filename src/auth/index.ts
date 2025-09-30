#!/usr/bin/env node

/**
 * Unified Authentication Handler
 *
 * This module provides a single entry point for all authentication commands,
 * combining CLI argument parsing with authentication implementation functions.
 * Uses minimist to parse command-line arguments and route to the appropriate
 * authentication provider.
 *
 * Supported providers:
 * - google/gmail/calendar: Google Workspace (Gmail + Calendar)
 * - linkedin: LinkedIn API
 * - facebook/fb: Facebook Graph API
 */

import minimist from "minimist";
import {
  launchAuthServer,
  launchLinkedInAuthServer,
  createLinkedInOAuth2Client,
  performFacebookAuth as performFacebookOAuth,
  getDefaultOAuth2Client,
} from "../oauth/index.js";

import { logger } from "../utils/logger.js";
import { configManager } from "../utils/configManager.js";
import fs from "fs";

interface AuthArgs {
  provider?: string;
  help?: boolean;
  h?: boolean;
  _: string[];
}

/**
 * Perform Google OAuth2 authentication
 */
export async function performGoogleAuth(): Promise<void> {
  try {
    console.log("🔐 Google OAuth2 Authentication");
    console.log("===============================");
    console.log("");

    // Get config directory from ConfigManager
    const generalConfig = configManager.getGeneralConfig();

    // Check for OAuth keys file
    const oauthKeysPath = `${generalConfig.mcpConfigDir}/gcp-oauth.keys.json`;
    if (!fs.existsSync(oauthKeysPath)) {
      console.error(`❌ OAuth keys file not found: ${oauthKeysPath}`);
      console.error("");
      console.error("Please ensure you have:");
      console.error("1. Created a Google Cloud Project");
      console.error("2. Enabled Gmail and Calendar APIs");
      console.error("3. Created OAuth2.0 credentials (Desktop application)");
      console.error("4. Downloaded and saved the credentials to:");
      console.error(`   ${oauthKeysPath}`);
      console.error("");
      console.error("For detailed setup instructions, visit:");
      console.error(
        configManager.getGithubMcpUrl() + "#google-workspace-setup"
      );
      process.exit(1);
    }

    console.log("📂 Found OAuth configuration file");
    console.log("🌐 Starting authentication server...");

    // Get OAuth2 client
    const oauth2Client = getDefaultOAuth2Client();
    if (!oauth2Client) {
      throw new Error(
        "Failed to create OAuth2 client. Please check your configuration."
      );
    }

    // Launch authentication server
    const result = await launchAuthServer(oauth2Client);

    console.log("");
    console.log("✅ Google authentication completed successfully!");
    console.log(
      `📁 Credentials saved to: ${generalConfig.mcpConfigDir}/google-credentials.json`
    );
    console.log("");
    console.log(
      "🎉 You can now use Gmail and Google Calendar tools in the MCP server!"
    );
    console.log("");
  } catch (error) {
    const errorMsg = `❌ Google authentication failed: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;

    console.error(errorMsg);
    logger.error(errorMsg, {
      error: error instanceof Error ? error.stack : error,
    });

    console.log("");
    console.log("📋 Troubleshooting steps:");
    console.log(
      "1. Ensure ~/.pa-mcp/gcp-oauth.keys.json exists with valid credentials"
    );
    console.log(
      "2. Check that your Google Cloud project has OAuth2 configured"
    );
    console.log(
      "3. Verify redirect URLs include http://localhost:<dynamic-port>/auth/google/callback"
    );
    console.log(
      "4. Note: The server uses dynamic ports for security - check console output for actual port"
    );

    process.exit(1);
  }
}

/**
 * Perform LinkedIn OAuth2 authentication
 */
export async function performLinkedInAuth(): Promise<void> {
  try {
    console.log("🔗 LinkedIn OAuth2 Authentication");
    console.log("=================================");
    console.log("");

    // Get config directory from ConfigManager
    const generalConfig = configManager.getGeneralConfig();

    // Check for OAuth keys file
    const oauthKeysPath = `${generalConfig.mcpConfigDir}/linkedin-oauth.keys.json`;
    if (!fs.existsSync(oauthKeysPath)) {
      console.error(`❌ LinkedIn OAuth keys file not found: ${oauthKeysPath}`);
      console.error("");
      console.error("Please ensure you have:");
      console.error("1. Created a LinkedIn Developer Application");
      console.error("2. Added the required OAuth scopes");
      console.error("3. Downloaded and saved the credentials to:");
      console.error(`   ${oauthKeysPath}`);
      console.error("");
      console.error("For detailed setup instructions, visit:");
      console.error(
        configManager.getGithubMcpUrl() + "#linkedin-oauth-configuration"
      );
      process.exit(1);
    }

    console.log("📂 Found LinkedIn OAuth configuration file");
    console.log("🌐 Starting LinkedIn authentication...");

    // Create LinkedIn OAuth client
    const linkedInClient = createLinkedInOAuth2Client();

    // Launch LinkedIn authentication server
    await launchLinkedInAuthServer(linkedInClient);

    console.log("");
    console.log("✅ LinkedIn authentication completed successfully!");
    console.log(
      `📁 Credentials saved to: ${generalConfig.mcpConfigDir}/linkedin-credentials.json`
    );
    console.log("");
    console.log("🎉 You can now use LinkedIn tools in the MCP server!");
    console.log("");
    console.log("Available LinkedIn features:");
    console.log("• Get user profile information");
    console.log("• Create and publish posts");
    console.log("• Access company information");
  } catch (error) {
    const errorMsg = `❌ LinkedIn authentication failed: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;

    console.error(errorMsg);
    logger.error(errorMsg, {
      error: error instanceof Error ? error.stack : error,
    });

    console.log("");
    console.log("📋 Troubleshooting steps:");
    console.log(
      "1. Ensure ~/.pa-mcp/linkedin-oauth.keys.json exists with valid credentials"
    );
    console.log(
      "2. Check that your LinkedIn app has the required scopes approved"
    );
    console.log(
      "3. Verify redirect URLs include http://localhost:<dynamic-port>/auth/linkedin/callback"
    );
    console.log(
      "4. Note: The server uses dynamic ports for security - check console output for actual port"
    );

    process.exit(1);
  }
}

/**
 * Display help message
 */
export function displayHelp(): void {
  console.log(`
Personal Assistant MCP Server

Usage:
  npx @softleolabs/personal-assistant-mcp              Start the MCP server
  npx @softleolabs/personal-assistant-mcp auth         Setup Google authentication (Gmail + Calendar)
  npx @softleolabs/personal-assistant-mcp auth:google  Setup Google authentication (Gmail + Calendar)  
  npx @softleolabs/personal-assistant-mcp auth:linkedin Setup LinkedIn authentication
  npx @softleolabs/personal-assistant-mcp auth:facebook Setup Facebook authentication
  npx @softleolabs/personal-assistant-mcp help         Show this help message

Authentication Setup:
  Before using the MCP server, you need to set up authentication for the services you want to use.
  
  1. Setup Google credentials (required for Gmail/Calendar):
     npx @softleolabs/personal-assistant-mcp auth
     
  2. Setup LinkedIn credentials (optional):
     npx @softleolabs/personal-assistant-mcp auth:linkedin
     
  3. Setup Facebook credentials (optional):
     npx @softleolabs/personal-assistant-mcp auth:facebook

  These commands will open your browser and guide you through the OAuth setup process.
  Credential files will be saved to ~/.pa-mcp/ directory.

  📧 Gmail Tools: 40+ email management features
  📅 Calendar Tools: 6 scheduling and event management features  
  💼 LinkedIn Tools: 3 professional networking features
  📱 Facebook Tools: 9 page management features
  📁 Project Tools: 4 management, backup and analytics features

For more information, visit: ${configManager.getGithubMcpUrl()}
`);
}

/**
 * Display authentication help message
 */
function showAuthHelp(): void {
  console.log(`
🔐 Personal Assistant MCP Server - Authentication

USAGE:
  npm run auth -- --provider=<PROVIDER>
  npm run auth -- <PROVIDER>

PROVIDERS:
  google     Authenticate with Google (Gmail + Calendar)
  linkedin   Authenticate with LinkedIn  
  facebook   Authenticate with Facebook Pages

EXAMPLES:
  npm run auth -- --provider=google
  npm run auth -- linkedin
  npm run auth -- facebook
  
OPTIONS:
  --provider, -p  Authentication provider (google|linkedin|facebook)
  --help, -h      Show this help message

NOTES:
  - Authentication opens your browser for OAuth consent
  - Credentials are saved to ~/.pa-mcp/ directory
  - Each provider requires separate setup in their developer portals
  - Run this BEFORE starting the MCP server

For setup instructions, see: README.md
`);
}

/**
 * Main authentication handler
 */
async function main(): Promise<void> {
  const args = minimist(process.argv.slice(2), {
    string: ["provider"],
    boolean: ["help", "h"],
    alias: {
      h: "help",
      p: "provider",
    },
  }) as AuthArgs;

  // Show help if requested or no arguments provided
  if (args.help || args.h) {
    showAuthHelp();
    return;
  }

  // Handle provider-specific authentication
  const provider = args.provider?.toLowerCase();

  if (!provider && args._.length === 0) {
    console.error("❌ Error: No authentication provider specified");
    console.log("");
    showAuthHelp();
    process.exit(1);
  }

  // Support both --provider=google and positional argument
  const authProvider = provider || args._[0]?.toLowerCase();

  switch (authProvider) {
    case "google":
    case "gmail":
    case "calendar":
      console.log("🔐 Starting Google authentication...");
      await performGoogleAuth();
      break;

    case "linkedin":
      console.log("🔗 Starting LinkedIn authentication...");
      await performLinkedInAuth();
      break;

    case "facebook":
    case "fb":
      console.log("📘 Starting Facebook authentication...");
      await performFacebookOAuth();
      break;

    default:
      console.error(
        `❌ Error: Unknown authentication provider '${authProvider}'`
      );
      console.log("");
      console.log("Supported providers: google, linkedin, facebook");
      console.log("");
      showAuthHelp();
      process.exit(1);
  }
}

// Handle cleanup
process.on("SIGINT", () => {
  console.log("\n⏹️  Authentication cancelled by user");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n⏹️  Authentication terminated");
  process.exit(0);
});

// Run the authentication
main().catch((error) => {
  console.error("❌ Fatal authentication error:", error.message);
  console.log("");
  console.log("💡 Troubleshooting:");
  console.log("1. Check your internet connection");
  console.log("2. Verify OAuth app credentials are correct");
  console.log("3. Ensure redirect URLs are properly configured");
  console.log("4. Try running the authentication again");
  process.exit(1);
});
