import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  handleTool,
  formatResponse,
  getUserProfile,
  createPost,
  getCompanyInfo,
  formatProfilePicture,
} from "../modules/linkedin.js";

export function registerLinkedInTools(
  server: McpServer,
  config?: Record<string, any>
) {
  server.tool(
    "linkedin_get_user_info",
    "Get the authenticated user's LinkedIn profile information including name, headline, and profile picture",
    {
      queryConfig: z
        .object({
          clientId: z.string().optional().describe("LinkedIn Client ID"),
          clientSecret: z
            .string()
            .optional()
            .describe("LinkedIn Client Secret"),
          redirectUri: z.string().optional().describe("LinkedIn Redirect URI"),
          credentialsPath: z
            .string()
            .optional()
            .describe("Path to LinkedIn credentials file"),
        })
        .optional()
        .describe("Optional LinkedIn OAuth2 configuration"),
    },
    async ({ queryConfig }) => {
      return handleTool(queryConfig, async (linkedin, tokens) => {
        const profile = await getUserProfile(linkedin, tokens);

        // Format profile picture if available
        let profilePicture;
        if (profile.profilePicture) {
          profilePicture = await formatProfilePicture(profile.profilePicture);
        }

        const formattedProfile = {
          id: profile.id,
          name: `${profile.localizedFirstName} ${profile.localizedLastName}`,
          firstName: profile.localizedFirstName,
          lastName: profile.localizedLastName,
          headline: profile.localizedHeadline,
          profilePicture: profilePicture
            ? {
                mimeType: profilePicture.mimeType,
                data: profilePicture.data,
              }
            : null,
        };

        return formatResponse({
          success: true,
          profile: formattedProfile,
        });
      });
    }
  );

  server.tool(
    "linkedin_create_post",
    "Create a new LinkedIn post with the specified content",
    {
      content: z.string().describe("The text content of the LinkedIn post"),
      visibility: z
        .enum(["PUBLIC", "CONNECTIONS", "LOGGED_IN_MEMBERS"])
        .optional()
        .default("PUBLIC")
        .describe("Post visibility (PUBLIC, CONNECTIONS, LOGGED_IN_MEMBERS)"),
      queryConfig: z
        .object({
          clientId: z.string().optional().describe("LinkedIn Client ID"),
          clientSecret: z
            .string()
            .optional()
            .describe("LinkedIn Client Secret"),
          redirectUri: z.string().optional().describe("LinkedIn Redirect URI"),
          credentialsPath: z
            .string()
            .optional()
            .describe("Path to LinkedIn credentials file"),
        })
        .optional()
        .describe("Optional LinkedIn OAuth2 configuration"),
    },
    async ({ content, visibility, queryConfig }) => {
      return handleTool(queryConfig, async (linkedin, tokens) => {
        const postData = {
          content: content,
          visibility: visibility || "PUBLIC",
        };

        const result = await createPost(linkedin, tokens, postData);

        return formatResponse({
          success: true,
          message: "LinkedIn post created successfully",
          postId: result.id,
          createdAt: result.created?.time || new Date().toISOString(),
        });
      });
    }
  );

  server.tool(
    "linkedin_get_company_info",
    "Get information about a LinkedIn company or list companies the user has access to",
    {
      companyId: z
        .string()
        .optional()
        .describe(
          "The LinkedIn company ID to get information for. If not provided, returns companies the user has access to"
        ),
      queryConfig: z
        .object({
          clientId: z.string().optional().describe("LinkedIn Client ID"),
          clientSecret: z
            .string()
            .optional()
            .describe("LinkedIn Client Secret"),
          redirectUri: z.string().optional().describe("LinkedIn Redirect URI"),
          credentialsPath: z
            .string()
            .optional()
            .describe("Path to LinkedIn credentials file"),
        })
        .optional()
        .describe("Optional LinkedIn OAuth2 configuration"),
    },
    async ({ companyId, queryConfig }) => {
      return handleTool(queryConfig, async (linkedin, tokens) => {
        const companyData = await getCompanyInfo(linkedin, tokens, companyId);

        if (companyId) {
          // Single company information
          return formatResponse({
            success: true,
            company: {
              id: companyData.id,
              name: companyData.name || companyData.localizedName,
              description: companyData.description,
              website: companyData.website,
              industry: companyData.industry,
              companyType: companyData.companyType,
              employeeCount: companyData.employeeCountRange,
            },
          });
        } else {
          // List of companies user has access to
          const companies =
            companyData.elements?.map((element: any) => ({
              id: element.organization?.id,
              name:
                element.organization?.name ||
                element.organization?.localizedName,
            })) || [];

          return formatResponse({
            success: true,
            companies: companies,
            total: companies.length,
          });
        }
      });
    }
  );
}
