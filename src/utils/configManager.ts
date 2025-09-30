import path from "path";
import os from "os";
import minimist from "minimist";

export interface OAuthConfig {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  accessToken?: string; // For LinkedIn Bearer tokens
}

export interface ConfigOptions {
  // Google OAuth
  googleClientId?: string;
  googleClientSecret?: string;
  googleRefreshToken?: string;

  // LinkedIn OAuth
  linkedinClientId?: string;
  linkedinClientSecret?: string;
  linkedinAccessToken?: string; // LinkedIn uses access tokens primarily
  linkedinRefreshToken?: string; // Optional for LinkedIn

  // Facebook OAuth
  facebookClientId?: string;
  facebookClientSecret?: string;
  facebookPageAccessToken?: string;
  facebookPageId?: string;

  // General config
  mcpConfigDir?: string;
  oauthPort?: string;

  // Project Management
  projectSourceDir?: string;
  projectTargetDir?: string;
  projectBackupDir?: string;
  projectIndexFile?: string;
  projectTaskDataDir?: string;
  projectTaskDataFile?: string;
}

export class ConfigManager {
  private static instance: ConfigManager;
  private config: ConfigOptions = {};
  private cliArgs: Record<string, string> = {};

  private constructor() {
    this.parseCliArguments();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Parse CLI arguments using minimist
   */
  private parseCliArguments(): void {
    const argv = minimist(process.argv.slice(2), {
      string: [
        "google-client-id",
        "google-client-secret",
        "google-refresh-token",
        "linkedin-client-id",
        "linkedin-client-secret",
        "linkedin-access-token",
        "linkedin-refresh-token",
        "facebook-client-id",
        "facebook-client-secret",
        "facebook-page-access-token",
        "facebook-page-id",
        "mcp-config-dir",
        "oauth-port",
        "project-source-dir",
        "project-target-dir",
        "project-backup-dir",
        "project-index-file",
        "project-task-data-dir",
        "project-task-data-file",
      ],
      alias: {
        h: "help",
        v: "version",
        c: "mcp-config-dir",
        o: "oauth-port",
      },
    });

    // Convert kebab-case keys to camelCase and store
    Object.keys(argv).forEach((key) => {
      if (key !== "_" && key.length > 1) {
        // Ignore minimist's _ array and single char keys
        this.cliArgs[this.camelCase(key)] = String(argv[key]);
      }
    });
  }

  /**
   * Convert kebab-case to camelCase
   */
  private camelCase(str: string): string {
    return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
  }

  /**
   * Get configuration value with priority: CLI args > environment variables > default
   */
  private getValue(
    cliKey: string,
    envKey: string,
    defaultValue?: string
  ): string {
    return this.cliArgs[cliKey] || process.env[envKey] || defaultValue || "";
  }

  /**
   * Get Google OAuth configuration
   */
  public getGoogleOAuthConfig(): OAuthConfig {
    return {
      clientId: this.getValue("googleClientId", "GOOGLE_CLIENT_ID"),
      clientSecret: this.getValue("googleClientSecret", "GOOGLE_CLIENT_SECRET"),
      refreshToken: this.getValue("googleRefreshToken", "GOOGLE_REFRESH_TOKEN"),
    };
  }

  /**
   * Get LinkedIn OAuth configuration
   */
  public getLinkedInOAuthConfig(): OAuthConfig {
    return {
      clientId: this.getValue("linkedinClientId", "LINKEDIN_CLIENT_ID"),
      clientSecret: this.getValue(
        "linkedinClientSecret",
        "LINKEDIN_CLIENT_SECRET"
      ),
      accessToken: this.getValue(
        "linkedinAccessToken",
        "LINKEDIN_ACCESS_TOKEN"
      ),
      refreshToken: this.getValue(
        "linkedinRefreshToken",
        "LINKEDIN_REFRESH_TOKEN"
      ),
    };
  }

  /**
   * Get Facebook OAuth configuration
   */
  public getFacebookOAuthConfig(): OAuthConfig {
    return {
      clientId: this.getValue("facebookClientId", "FACEBOOK_CLIENT_ID"),
      clientSecret: this.getValue(
        "facebookClientSecret",
        "FACEBOOK_CLIENT_SECRET"
      ),
    };
  }

  /**
   * Get general configuration
   */
  public getGeneralConfig() {
    const mcpConfigDir = this.getValue(
      "mcpConfigDir",
      "MCP_CONFIG_DIR",
      path.join(os.homedir(), ".pa-mcp")
    );

    return {
      mcpConfigDir,
      oauthPort: parseInt(this.getValue("oauthPort", "OAUTH_PORT", "3000")),

      // Facebook configuration
      facebookPageAccessToken: this.getValue(
        "facebookPageAccessToken",
        "FACEBOOK_PAGE_ACCESS_TOKEN"
      ),
      facebookPageId: this.getValue("facebookPageId", "FACEBOOK_PAGE_ID"),

      // File paths
      googleOAuthPath: path.join(mcpConfigDir, "gcp-oauth.keys.json"),
      googleCredentialsPath: path.join(mcpConfigDir, "google-credentials.json"),
      linkedinOAuthPath: path.join(mcpConfigDir, "linkedin-oauth.keys.json"),
      linkedinCredentialsPath: path.join(
        mcpConfigDir,
        "linkedin-credentials.json"
      ),
      facebookOAuthPath: path.join(mcpConfigDir, "facebook-oauth.keys.json"),
      facebookCredentialsPath: path.join(
        mcpConfigDir,
        "facebook-credentials.json"
      ),
    };
  }

  /**
   * Get project management configuration
   */
  public getProjectConfig() {
    const homeDir = os.homedir();

    const projectSourceDir = this.getValue(
      "projectSourceDir",
      "PROJECT_SOURCE_DIR",
      path.join(homeDir, "Downloads")
    );

    const projectTargetDir = this.getValue(
      "projectTargetDir",
      "PROJECT_TARGET_DIR",
      path.join(homeDir, "Indexed_GitHub_Projects")
    );

    const projectBackupDir = this.getValue(
      "projectBackupDir",
      "PROJECT_BACKUP_DIR",
      path.join(homeDir, "Project_Backups")
    );

    const projectIndexFile = this.getValue(
      "projectIndexFile",
      "PROJECT_INDEX_FILE",
      "project_index.json"
    );

    const projectTaskDataDir = this.getValue(
      "projectTaskDataDir",
      "PROJECT_TASK_DATA_DIR",
      path.join(homeDir, "task_data")
    );

    const projectTaskDataFile = this.getValue(
      "projectTaskDataFile",
      "PROJECT_TASK_DATA_FILE",
      "projects.json"
    );

    return {
      projectSourceDir,
      projectTargetDir,
      projectBackupDir,
      projectIndexFile,
      projectIndexPath: path.join(projectTargetDir, projectIndexFile),
      projectTaskDataDir,
      projectTaskDataFile,
    };
  }

  /**
   * Get all CLI arguments (for debugging)
   */
  public getCliArgs(): Record<string, string> {
    return { ...this.cliArgs };
  }

  /**
   * Check if a specific CLI argument was provided
   */
  public hasCliArg(key: string): boolean {
    return key in this.cliArgs;
  }

  public getGithubMcpUrl(): string {
    return "https://github.com/softleo-llc/personal-assistant-mcp";
  }

  /**
   * Get configuration as runtime query config for OAuth modules
   */
  public getQueryConfig(): Record<string, any> | undefined {
    const google = this.getGoogleOAuthConfig();
    const linkedin = this.getLinkedInOAuthConfig();

    const queryConfig: Record<string, any> = {};

    // Add Google config if any values are present
    if (google.clientId || google.clientSecret || google.refreshToken) {
      if (google.clientId) queryConfig.GOOGLE_CLIENT_ID = google.clientId;
      if (google.clientSecret)
        queryConfig.GOOGLE_CLIENT_SECRET = google.clientSecret;
      if (google.refreshToken)
        queryConfig.GOOGLE_REFRESH_TOKEN = google.refreshToken;
    }

    // Add LinkedIn config if any values are present
    if (
      linkedin.clientId ||
      linkedin.clientSecret ||
      linkedin.accessToken ||
      linkedin.refreshToken
    ) {
      if (linkedin.clientId) queryConfig.LINKEDIN_CLIENT_ID = linkedin.clientId;
      if (linkedin.clientSecret)
        queryConfig.LINKEDIN_CLIENT_SECRET = linkedin.clientSecret;
      if (linkedin.accessToken)
        queryConfig.LINKEDIN_ACCESS_TOKEN = linkedin.accessToken;
      if (linkedin.refreshToken)
        queryConfig.LINKEDIN_REFRESH_TOKEN = linkedin.refreshToken;
    }

    return Object.keys(queryConfig).length > 0 ? queryConfig : undefined;
  }

  /**
   * Display help for CLI arguments
   */
  public static displayCliHelp(): void {
    console.log(`
Personal Assistant MCP Server - CLI Arguments

OAuth Configuration:
  --google-client-id=<id>         Google OAuth2 Client ID
  --google-client-secret=<secret> Google OAuth2 Client Secret  
  --google-refresh-token=<token>  Google OAuth2 Refresh Token
  
  --linkedin-client-id=<id>       LinkedIn OAuth2 Client ID
  --linkedin-client-secret=<secret> LinkedIn OAuth2 Client Secret
  --linkedin-access-token=<token> LinkedIn OAuth2 Access Token (Bearer token)
  --linkedin-refresh-token=<token> LinkedIn OAuth2 Refresh Token (optional)
  
  --facebook-client-id=<id>       Facebook OAuth2 Client ID (App ID)
  --facebook-client-secret=<secret> Facebook OAuth2 Client Secret
  --facebook-page-access-token=<token> Facebook Page Access Token (direct)
  --facebook-page-id=<id>         Facebook Page ID

General Configuration:
  --mcp-config-dir=<path>         Configuration directory (default: ~/.pa-mcp)
  --oauth-port=<port>             Fixed port for OAuth redirects (default: 3000)

Project Management:
  --project-source-dir=<path>     Source directory for GitHub zips (default: ~/Downloads)
  --project-target-dir=<path>     Target directory for indexed projects (default: ~/Indexed_GitHub_Projects)
  --project-backup-dir=<path>     Backup directory (default: ~/Project_Backups)
  --project-index-file=<filename> Index file name (default: project_index.json)
  --project-task-data-dir=<path>  Task data directory (default: ~/task_data)
  --project-task-data-file=<filename> Task data file (default: projects.json)

Usage Examples:
  # Start with Google OAuth credentials from CLI
  npx @softleolabs/personal-assistant-mcp \\
    --google-client-id=your-client-id \\
    --google-client-secret=your-secret \\
    --google-refresh-token=your-token

  # Start with custom config directory and OAuth port
  npx @softleolabs/personal-assistant-mcp \\
    --mcp-config-dir=/custom/path \\
    --oauth-port=3001

  # Start with LinkedIn credentials (access token)
  npx @softleolabs/personal-assistant-mcp \\
    --linkedin-client-id=your-linkedin-id \\
    --linkedin-client-secret=your-linkedin-secret \\
    --linkedin-access-token=your-bearer-token

Note: CLI arguments take precedence over environment variables.
Environment variables are used as fallback when CLI arguments are not provided.
File-based credentials (in config directory) are used as final fallback.

OAuth Configuration:
The --oauth-port setting controls which port OAuth redirect servers use.
This port must match the redirect URIs registered in your OAuth applications:
  - Google: http://localhost:<oauth-port>/oauth2callback
  - LinkedIn: http://localhost:<oauth-port>/linkedin/callback
  - Facebook: http://localhost:<oauth-port>/callback
`);
  }
}

// Export singleton instance
export const configManager = ConfigManager.getInstance();
