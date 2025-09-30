import { configManager } from "../../utils/configManager.js";
import { OAuth2Client } from "google-auth-library";
import fs from "fs";
import http from "http";
import open from "open";

const AUTH_SCOPES = [
  // Gmail scopes
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  "https://www.googleapis.com/auth/gmail.settings.sharing",
  // Google Calendar scopes
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

// Lazy-loaded to avoid issues during testing
let _defaultOAuth2Client: OAuth2Client | null = null;

export const getDefaultOAuth2Client = (): OAuth2Client | null => {
  if (!_defaultOAuth2Client) {
    try {
      _defaultOAuth2Client = createOAuth2Client();
    } catch (error) {
      // During testing or if credentials are missing, return null
      _defaultOAuth2Client = null;
    }
  }
  return _defaultOAuth2Client;
};

const getEnvBasedCredentials = (queryConfig?: Record<string, any>) => {
  const googleConfig = configManager.getGoogleOAuthConfig();

  const clientId = queryConfig?.GOOGLE_CLIENT_ID || googleConfig.clientId;
  const clientSecret =
    queryConfig?.GOOGLE_CLIENT_SECRET || googleConfig.clientSecret;
  const refreshToken =
    queryConfig?.GOOGLE_REFRESH_TOKEN || googleConfig.refreshToken;

  if (!clientId || !clientSecret || !refreshToken) return null;

  return { clientId, clientSecret, refreshToken };
};

const getFileBasedCredentials = () => {
  const generalConfig = configManager.getGeneralConfig();

  const oauthFilePresent = fs.existsSync(generalConfig.googleOAuthPath);
  if (!oauthFilePresent) return null;

  const keysContent = fs.readFileSync(generalConfig.googleOAuthPath, "utf8");
  const parsedKeys = JSON.parse(keysContent);

  const clientId =
    parsedKeys?.installed?.client_id || parsedKeys?.web?.client_id;
  const clientSecret =
    parsedKeys?.installed?.client_secret || parsedKeys?.web?.client_secret;

  let refreshToken = null;
  if (fs.existsSync(generalConfig.googleCredentialsPath)) {
    const tokenData = JSON.parse(
      fs.readFileSync(generalConfig.googleCredentialsPath, "utf8")
    );
    refreshToken = tokenData.refresh_token;
  }

  return { clientId, clientSecret, refreshToken };
};

export const createOAuth2Client = (
  queryConfig?: Record<string, any>,
  port?: number
) => {
  try {
    let credentials = getEnvBasedCredentials(queryConfig);

    if (!credentials) credentials = getFileBasedCredentials();

    // Use configured OAuth port for consistent redirect URIs
    const generalConfig = configManager.getGeneralConfig();
    const oauthPort = port || generalConfig.oauthPort;
    const redirectUri = `http://localhost:${oauthPort}/oauth2callback`;

    const oauth2Client = new OAuth2Client({
      clientId: credentials?.clientId,
      clientSecret: credentials?.clientSecret,
      redirectUri: redirectUri,
    });

    if (credentials?.refreshToken)
      oauth2Client.setCredentials({ refresh_token: credentials.refreshToken });

    return oauth2Client;
  } catch (error: any) {
    return null;
  }
};

export const launchAuthServer = async (oauth2Client: OAuth2Client) =>
  new Promise((resolve, reject) => {
    const server = http.createServer();
    const generalConfig = configManager.getGeneralConfig();

    // Listen on the configured OAuth port for consistent redirect URIs
    server.listen(generalConfig.oauthPort, () => {
      const actualPort = generalConfig.oauthPort;
      console.log(`Google auth server running on port: ${actualPort}`);

      // Create a new OAuth2Client with the correct redirect URI
      let credentials = getEnvBasedCredentials();
      if (!credentials) credentials = getFileBasedCredentials();

      const actualOAuth2Client = new OAuth2Client({
        clientId: credentials?.clientId,
        clientSecret: credentials?.clientSecret,
        redirectUri: `http://localhost:${actualPort}/oauth2callback`,
      });

      const authUrl = actualOAuth2Client.generateAuthUrl({
        access_type: "offline",
        scope: AUTH_SCOPES,
      });

      console.log(`Please visit this URL to authenticate: ${authUrl}`);

      open(authUrl);
    });

    server.on("request", async (req, res) => {
      if (!req.url?.startsWith("/oauth2callback")) return;

      const generalConfig = configManager.getGeneralConfig();
      const actualPort = generalConfig.oauthPort;
      const url = new URL(req.url, `http://localhost:${actualPort}`);
      const code = url.searchParams.get("code");

      if (!code) {
        res.writeHead(400);
        res.end("No code provided");
        reject(new Error("No code provided"));
        return;
      }

      try {
        // Create a new OAuth2Client for token exchange
        let credentials = getEnvBasedCredentials();
        if (!credentials) credentials = getFileBasedCredentials();

        const actualOAuth2Client = new OAuth2Client({
          clientId: credentials?.clientId,
          clientSecret: credentials?.clientSecret,
          redirectUri: `http://localhost:${actualPort}/oauth2callback`,
        });

        const { tokens } = await actualOAuth2Client.getToken(code);
        actualOAuth2Client.setCredentials(tokens);
        fs.writeFileSync(
          generalConfig.googleCredentialsPath,
          JSON.stringify(tokens, null, 2)
        );

        res.writeHead(200);
        res.end(
          `Authentication successful! Go to ${generalConfig.googleCredentialsPath} to view your REFRESH_TOKEN. You can close this window.`
        );
        server.close();
        resolve(void 0);
      } catch (error: any) {
        res.writeHead(500);
        res.end("Authentication failed");
        reject(error);
      }
    });
  });

export const validateCredentials = async (oauth2Client: OAuth2Client) => {
  try {
    const { credentials } = oauth2Client;
    if (!credentials) return false;

    const expiryDate = credentials.expiry_date;
    const needsRefresh = !expiryDate || expiryDate <= Date.now();

    if (!needsRefresh) return true;

    if (!credentials.refresh_token) return false;

    const { credentials: tokens } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(tokens);

    fs.writeFileSync(
      configManager.getGeneralConfig().googleCredentialsPath,
      JSON.stringify(tokens, null, 2)
    );
    return true;
  } catch (error: any) {
    return false;
  }
};
