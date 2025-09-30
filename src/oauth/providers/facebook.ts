import { configManager } from "../../utils/configManager.js";
import fs from "fs";
import http from "http";
import open from "open";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import axios from "axios";

const execAsync = promisify(exec);

// Facebook OAuth configuration
const FACEBOOK_SCOPES = [
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_read_user_content",
  "pages_manage_engagement",
];

interface FacebookOAuthTokens {
  access_token: string;
  token_type: string;
  expires_in?: number;
  page_access_token?: string;
  page_id?: string;
}

const killProcessOnPort = async (port: number): Promise<void> => {
  try {
    console.log(`🔍 Checking if port ${port} is in use...`);

    // Check what's using the port on Windows
    const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);

    if (stdout.trim()) {
      console.log(`⚠️ Port ${port} is in use, attempting to free it...`);

      // Extract PIDs from netstat output
      const lines = stdout.trim().split("\n");
      const pids = new Set<string>();

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[1].includes(`:${port}`)) {
          const pid = parts[4];
          if (pid !== "0") {
            pids.add(pid);
          }
        }
      }

      // Kill each process
      for (const pid of pids) {
        try {
          await execAsync(`taskkill /PID ${pid} /F`);
          console.log(`✅ Killed process with PID ${pid}`);
        } catch (error) {
          console.log(`⚠️ Could not kill process ${pid}:`, error);
        }
      }

      // Wait a moment for processes to be cleaned up
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } else {
      console.log(`✅ Port ${port} is available`);
    }
  } catch (error) {
    console.log(`ℹ️ Port ${port} appears to be available`);
  }
};

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<FacebookOAuthTokens> {
  const config = configManager.getFacebookOAuthConfig();

  if (!config.clientId || !config.clientSecret) {
    throw new Error(
      "Facebook Client ID and Client Secret are required. Set FACEBOOK_CLIENT_ID and FACEBOOK_CLIENT_SECRET environment variables."
    );
  }

  const tokenUrl = "https://graph.facebook.com/v18.0/oauth/access_token";

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri,
    code: code,
  });

  try {
    const response = await axios.post(tokenUrl, params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    return response.data;
  } catch (error: any) {
    console.error(
      "❌ Token exchange failed:",
      error.response?.data || error.message
    );
    throw new Error(
      `Failed to exchange code for token: ${
        error.response?.data?.error_description || error.message
      }`
    );
  }
}

/**
 * Get page access token from user access token
 */
async function getPageAccessToken(
  userAccessToken: string
): Promise<{ pageId: string; pageAccessToken: string }> {
  try {
    // Get user's pages
    const pagesResponse = await axios.get(
      "https://graph.facebook.com/v18.0/me/accounts",
      {
        params: {
          access_token: userAccessToken,
          fields: "id,name,access_token",
        },
      }
    );

    const pages = pagesResponse.data.data;

    if (!pages || pages.length === 0) {
      throw new Error(
        "No pages found for this Facebook account. You need to manage at least one Facebook Page to use these tools."
      );
    }

    // Use the first page (you could modify this to let user choose)
    const page = pages[0];
    console.log(`✅ Using Facebook Page: ${page.name} (ID: ${page.id})`);

    return {
      pageId: page.id,
      pageAccessToken: page.access_token,
    };
  } catch (error: any) {
    console.error(
      "❌ Failed to get page access token:",
      error.response?.data || error.message
    );
    throw new Error(
      `Failed to get page access token: ${
        error.response?.data?.error?.message || error.message
      }`
    );
  }
}

/**
 * Save Facebook OAuth tokens to file
 */
function saveTokens(
  tokens: FacebookOAuthTokens,
  pageInfo: { pageId: string; pageAccessToken: string }
): void {
  const generalConfig = configManager.getGeneralConfig();
  const tokenPath = generalConfig.facebookCredentialsPath;

  // Create directory if it doesn't exist
  const tokenDir = path.dirname(tokenPath);
  if (!fs.existsSync(tokenDir)) {
    fs.mkdirSync(tokenDir, { recursive: true });
  }

  const tokenData = {
    access_token: tokens.access_token,
    token_type: tokens.token_type || "Bearer",
    expires_in: tokens.expires_in,
    page_access_token: pageInfo.pageAccessToken,
    page_id: pageInfo.pageId,
    created_at: new Date().toISOString(),
  };

  fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2));
  console.log(`✅ Facebook OAuth tokens saved to: ${tokenPath}`);
}

/**
 * Start Facebook OAuth flow
 */
export async function performFacebookAuth(): Promise<void> {
  const config = configManager.getFacebookOAuthConfig();
  const generalConfig = configManager.getGeneralConfig();

  if (!config.clientId || !config.clientSecret) {
    console.error("❌ Facebook OAuth configuration is missing!");
    console.error("Please set the following environment variables:");
    console.error("  FACEBOOK_CLIENT_ID=your_facebook_app_id");
    console.error("  FACEBOOK_CLIENT_SECRET=your_facebook_app_secret");
    console.error("");
    console.error("📋 To get these credentials:");
    console.error("1. Go to https://developers.facebook.com/");
    console.error("2. Create a new app or select existing app");
    console.error("3. Add Facebook Login product");
    console.error("4. Get App ID (Client ID) and App Secret from App Settings");
    console.error("5. Add redirect URI: http://localhost:3000/callback");
    return;
  }

  const port = generalConfig.oauthPort;
  const redirectUri = `http://localhost:${port}/callback`;

  // Kill any existing processes on the port
  await killProcessOnPort(port);

  console.log("🔐 Starting Facebook OAuth authentication...");

  // Build authorization URL
  const authUrl = new URL("https://www.facebook.com/v18.0/dialog/oauth");
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", FACEBOOK_SCOPES.join(","));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", "facebook_oauth_state");

  console.log(`🌐 Opening browser for Facebook authentication...`);
  console.log(`   Redirect URI: ${redirectUri}`);
  console.log(`   Scopes: ${FACEBOOK_SCOPES.join(", ")}`);

  // Create HTTP server to handle callback
  const server = http.createServer(async (req, res) => {
    if (!req.url) return;

    const url = new URL(req.url, `http://localhost:${port}`);

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");

      if (error) {
        console.error("❌ OAuth error:", error);
        if (errorDescription) {
          console.error("   Description:", errorDescription);
        }

        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <body>
              <h1>❌ Facebook Authentication Failed</h1>
              <p>Error: ${error}</p>
              <p>Description: ${errorDescription || "Unknown error"}</p>
              <p>You can close this window.</p>
            </body>
          </html>
        `);
        server.close();
        return;
      }

      if (code) {
        try {
          console.log("🔄 Exchanging authorization code for access token...");

          // Exchange code for tokens
          const tokens = await exchangeCodeForToken(code, redirectUri);
          console.log("✅ Received user access token");

          // Get page access token
          console.log("🔄 Getting page access token...");
          const pageInfo = await getPageAccessToken(tokens.access_token);

          // Save tokens
          saveTokens(tokens, pageInfo);

          console.log("🎉 Facebook authentication completed successfully!");
          console.log(`📄 Page ID: ${pageInfo.pageId}`);
          console.log("🔧 You can now use Facebook tools in your MCP server");

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #1877F2;">✅ Facebook Authentication Success!</h1>
                <p>Your Facebook OAuth tokens have been saved successfully.</p>
                <p><strong>Page ID:</strong> ${pageInfo.pageId}</p>
                <p>You can now close this window and use Facebook tools in your MCP server.</p>
                <div style="background: #f0f2f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3>Next Steps:</h3>
                  <p>• Your tokens are saved in: ${generalConfig.facebookOAuthPath}</p>
                  <p>• The MCP server will automatically use these credentials</p>
                  <p>• You can now post, manage comments, and analyze your Facebook page</p>
                </div>
              </body>
            </html>
          `);
        } catch (error: any) {
          console.error("❌ Authentication failed:", error.message);

          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body>
                <h1>❌ Authentication Error</h1>
                <p>Failed to complete authentication: ${error.message}</p>
                <p>You can close this window and try again.</p>
              </body>
            </html>
          `);
        }

        server.close();
        return;
      }
    }

    // Default response
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });

  // Start server
  server.listen(port, () => {
    console.log(`🖥️ OAuth callback server running on port ${port}`);

    // Open browser
    open(authUrl.toString()).catch((error) => {
      console.error("❌ Failed to open browser:", error.message);
      console.log("🌐 Please manually open this URL in your browser:");
      console.log(authUrl.toString());
    });
  });

  // Handle server errors
  server.on("error", (error: any) => {
    console.error("❌ OAuth server error:", error.message);
    if (error.code === "EADDRINUSE") {
      console.error(
        `Port ${port} is already in use. Please wait a moment and try again.`
      );
    }
  });

  // Timeout after 5 minutes
  setTimeout(() => {
    console.log("⏱️ OAuth timeout - closing server");
    server.close();
  }, 300000);
}

/**
 * Load saved Facebook OAuth tokens
 */
export function loadFacebookTokens(): FacebookOAuthTokens | null {
  const generalConfig = configManager.getGeneralConfig();
  const tokenPath = generalConfig.facebookCredentialsPath;

  if (!fs.existsSync(tokenPath)) {
    return null;
  }

  try {
    const tokenData = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
    return tokenData;
  } catch (error) {
    console.error("❌ Failed to load Facebook tokens:", error);
    return null;
  }
}

/**
 * Check if Facebook OAuth is configured
 */
export function isFacebookOAuthConfigured(): boolean {
  const tokens = loadFacebookTokens();
  return tokens !== null && !!tokens.page_access_token && !!tokens.page_id;
}
