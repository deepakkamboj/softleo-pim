import { configManager } from "../../utils/configManager.js";
import fs from "fs";
import http from "http";
import open from "open";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// LinkedIn OAuth configuration
const LINKEDIN_SCOPES = ["openid", "profile", "w_member_social"];

// LinkedIn configuration is now imported from config

const killProcessOnPort = async (port: number): Promise<void> => {
  try {
    console.log(`🔍 Checking if port ${port} is in use...`);

    // Check what's using the port
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
      console.log(`✅ Port ${port} should now be available`);
    } else {
      console.log(`✅ Port ${port} is available`);
    }
  } catch (error) {
    console.log(`ℹ️ Port ${port} appears to be available (no processes found)`);
  }
};

const getEnvBasedCredentials = (queryConfig?: Record<string, any>) => {
  const linkedinConfig = configManager.getLinkedInOAuthConfig();

  const clientId = queryConfig?.LINKEDIN_CLIENT_ID || linkedinConfig.clientId;
  const clientSecret =
    queryConfig?.LINKEDIN_CLIENT_SECRET || linkedinConfig.clientSecret;
  const refreshToken =
    queryConfig?.LINKEDIN_REFRESH_TOKEN || linkedinConfig.refreshToken;

  if (!clientId || !clientSecret) return null;

  return { clientId, clientSecret, refreshToken };
};

const getFileBasedCredentials = () => {
  const generalConfig = configManager.getGeneralConfig();

  const oauthFilePresent = fs.existsSync(generalConfig.linkedinOAuthPath);
  if (!oauthFilePresent) return null;

  const keysContent = fs.readFileSync(generalConfig.linkedinOAuthPath, "utf8");
  const parsedKeys = JSON.parse(keysContent);

  const clientId = parsedKeys?.client_id;
  const clientSecret = parsedKeys?.client_secret;

  let refreshToken = null;
  // Try to get refresh token but don't require it for LinkedIn (Bearer tokens work differently)
  if (fs.existsSync(generalConfig.linkedinCredentialsPath)) {
    try {
      const linkedinCredentialsFile = JSON.parse(
        fs.readFileSync(generalConfig.linkedinCredentialsPath, "utf8")
      );
      refreshToken = linkedinCredentialsFile?.refresh_token || null;
    } catch (error) {
      // Credentials file might not exist or be malformed, that's okay
      refreshToken = null;
    }
  }

  if (!clientId || !clientSecret) return null;

  return { clientId, clientSecret, refreshToken };
};

export const createLinkedInOAuth2Client = (
  queryConfig?: Record<string, any>,
  port?: number
) => {
  // Try environment variables first, then fall back to file-based credentials
  const credentials =
    getEnvBasedCredentials(queryConfig) || getFileBasedCredentials();

  if (!credentials) return null;

  // Use configured OAuth port for consistent redirect URIs
  const generalConfig = configManager.getGeneralConfig();
  const oauthPort = port || generalConfig.oauthPort;
  const redirectUri = `http://localhost:${oauthPort}/linkedin/callback`;

  return {
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    refreshToken: credentials.refreshToken,
    redirectUri: redirectUri,
  };
};

export const validateLinkedInCredentials = async (
  oauth2Client: any
): Promise<boolean> => {
  try {
    const generalConfig = configManager.getGeneralConfig();

    // Check if credentials file exists and has access token
    if (!fs.existsSync(generalConfig.linkedinCredentialsPath)) {
      return false;
    }

    const credentialsContent = fs.readFileSync(
      generalConfig.linkedinCredentialsPath,
      "utf8"
    );
    const credentials = JSON.parse(credentialsContent);

    // Validate that we have an access token
    return !!credentials.access_token;
  } catch (error) {
    console.error("LinkedIn credential validation failed:", error);
    return false;
  }
};

export const launchLinkedInAuthServer = async (
  oauth2Client: any
): Promise<void> => {
  const generalConfig = configManager.getGeneralConfig();
  const oauthPort = generalConfig.oauthPort;

  // Kill any processes using the OAuth port before starting
  await killProcessOnPort(oauthPort);

  return new Promise((resolve, reject) => {
    const generalConfig = configManager.getGeneralConfig();

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || "", `http://localhost:${oauthPort}`);

      if (url.pathname === "/linkedin/callback") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (code) {
          try {
            // Create the correct redirect URI with OAuth port
            const actualRedirectUri = `http://localhost:${oauthPort}/linkedin/callback`;

            // Exchange authorization code for access token
            const tokenResponse = await fetch(
              "https://www.linkedin.com/oauth/v2/accessToken",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                  grant_type: "authorization_code",
                  code: code,
                  redirect_uri: actualRedirectUri,
                  client_id: oauth2Client.clientId,
                  client_secret: oauth2Client.clientSecret,
                }),
              }
            );

            if (!tokenResponse.ok) {
              const errorText = await tokenResponse.text();
              console.error("LinkedIn API Error Response:", errorText);
              throw new Error(
                `Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText}. Response: ${errorText}`
              );
            }

            const tokens = await tokenResponse.json();

            // Save credentials
            const credentialsDir = path.dirname(
              generalConfig.linkedinCredentialsPath
            );
            if (!fs.existsSync(credentialsDir)) {
              fs.mkdirSync(credentialsDir, { recursive: true });
            }

            fs.writeFileSync(
              generalConfig.linkedinCredentialsPath,
              JSON.stringify(tokens, null, 2)
            );

            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`
              <html>
                <body>
                  <h1>LinkedIn Authentication Successful!</h1>
                  <p>You can close this window and return to your application.</p>
                  <p>Credentials saved to: ${generalConfig.linkedinCredentialsPath}</p>
                </body>
              </html>
            `);

            server.close();
            resolve();
          } catch (error) {
            console.error("Token exchange failed:", error);
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Authentication failed");
            server.close();
            reject(error);
          }
        } else {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("No authorization code received");
        }
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      }
    });

    // Listen on the configured OAuth port instead of dynamic port
    server.listen(oauthPort, () => {
      console.log(`LinkedIn auth server running on port: ${oauthPort}`);

      // Generate LinkedIn authorization URL with configured OAuth port
      const authUrl = new URL(
        "https://www.linkedin.com/oauth/v2/authorization"
      );
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", oauth2Client.clientId);
      authUrl.searchParams.set(
        "redirect_uri",
        `http://localhost:${oauthPort}/linkedin/callback`
      );
      authUrl.searchParams.set("scope", LINKEDIN_SCOPES.join(" "));
      authUrl.searchParams.set(
        "state",
        Math.random().toString(36).substring(2)
      );

      console.log(
        `Please visit this URL to authenticate: ${authUrl.toString()}`
      );

      // Try to open the URL automatically
      open(authUrl.toString()).catch(() => {
        console.log(
          "Could not automatically open browser. Please visit the URL manually."
        );
      });
    });

    server.on("error", (error) => {
      console.error("Server error:", error);
      reject(error);
    });
  });
};
