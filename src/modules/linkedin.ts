import { RestliClient as LinkedinClient } from "linkedin-api-client";
import {
  createLinkedInOAuth2Client,
  validateLinkedInCredentials,
} from "../oauth/index.js";
import axios from "axios";
import fs from "fs";
import path from "path";

// LinkedIn API types (simplified versions of what we need)
export type LinkedInProfile = {
  id: string;
  localizedFirstName: string;
  localizedLastName: string;
  localizedHeadline: string;
  profilePicture?: {
    displayImage?: string;
  };
};

export type LinkedInPost = {
  id?: string;
  author: string;
  commentary: string;
  visibility: string;
  lifecycleState: string;
};

export type LinkedInTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

// Post content types
export type LinkedInTextPost = {
  content: string;
  visibility?: string;
};

export type LinkedInImagePost = {
  content: string;
  imagePath: string;
  imageAltText?: string;
  visibility?: string;
};

// Lazy-loaded to avoid issues during testing
let _defaultLinkedInClient: any = null;

export const getDefaultLinkedInClient = () => {
  if (!_defaultLinkedInClient) {
    const oauth2Client = createLinkedInOAuth2Client();
    _defaultLinkedInClient = oauth2Client ? new LinkedinClient() : null;
  }
  return _defaultLinkedInClient;
};

export const formatResponse = (response: any) => ({
  content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
});

export const handleTool = async (
  queryConfig: Record<string, any> | undefined,
  apiCall: (linkedin: LinkedinClient, tokens: LinkedInTokens) => Promise<any>
) => {
  try {
    const oauth2Client = queryConfig
      ? createLinkedInOAuth2Client(queryConfig)
      : createLinkedInOAuth2Client();

    if (!oauth2Client) {
      throw new Error(
        "LinkedIn OAuth2 client could not be created, please check your credentials"
      );
    }

    const credentialsAreValid = await validateLinkedInCredentials(oauth2Client);
    if (!credentialsAreValid) {
      throw new Error(
        "LinkedIn OAuth2 credentials are invalid, please re-authenticate"
      );
    }

    const linkedinClient = queryConfig
      ? new LinkedinClient()
      : getDefaultLinkedInClient();

    if (!linkedinClient) {
      throw new Error(
        "LinkedIn client could not be created, please check your credentials"
      );
    }

    // Load tokens from credentials file
    const fs = await import("fs");
    const { configManager } = await import("../utils/configManager.js");
    const LINKEDIN_CREDENTIALS_PATH =
      configManager.getGeneralConfig().linkedinCredentialsPath;

    if (!fs.existsSync(LINKEDIN_CREDENTIALS_PATH)) {
      throw new Error(
        "LinkedIn credentials not found. Please authenticate first by running: npm run linkedin-auth"
      );
    }

    const credentialsContent = fs.readFileSync(
      LINKEDIN_CREDENTIALS_PATH,
      "utf8"
    );
    const credentials = JSON.parse(credentialsContent);

    const tokens: LinkedInTokens = {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token,
      expires_in: credentials.expires_in,
      scope: credentials.scope,
    };

    const result = await apiCall(linkedinClient, tokens);
    return result;
  } catch (error: any) {
    // Check for specific authentication errors
    if (
      error.message?.includes("invalid_grant") ||
      error.message?.includes("refresh_token") ||
      error.message?.includes("invalid_client") ||
      error.message?.includes("unauthorized_client") ||
      error.code === 401 ||
      error.code === 403
    ) {
      return formatResponse({
        error: `Authentication failed: ${error.message}. Please re-authenticate by running: npx @softleolabs/pa-mcp linkedin-auth`,
      });
    }

    // Check for scope-related errors
    if (
      error.message?.includes("insufficient_scope") ||
      error.message?.includes("scope") ||
      error.message?.includes("permission")
    ) {
      return formatResponse({
        error: `LinkedIn scope permission denied: ${error.message}. Please ensure your LinkedIn app has the required OAuth 2.0 scopes approved: r_basicprofile, w_member_social, r_organization_social, w_organization_social`,
      });
    }

    return formatResponse({ error: `Tool execution failed: ${error.message}` });
  }
};

export const getUserProfile = async (
  linkedin: LinkedinClient,
  tokens: LinkedInTokens
): Promise<LinkedInProfile> => {
  // Use OpenID Connect userinfo endpoint instead of LinkedIn REST API
  // This works with basic openid,profile scopes that don't require approval
  const response = await axios.get("https://api.linkedin.com/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
    },
  });

  // Transform OpenID Connect response to our format
  const userinfo = response.data;
  return {
    id: userinfo.sub, // OpenID Connect uses 'sub' for user ID
    localizedFirstName:
      userinfo.given_name || userinfo.name?.split(" ")[0] || "",
    localizedLastName:
      userinfo.family_name ||
      userinfo.name?.split(" ").slice(1).join(" ") ||
      "",
    localizedHeadline: "", // Not available in basic OpenID Connect
    profilePicture: userinfo.picture
      ? { displayImage: userinfo.picture }
      : undefined,
  } as LinkedInProfile;
};

export const createTextPost = async (
  linkedin: LinkedinClient,
  tokens: LinkedInTokens,
  postContent: LinkedInTextPost
): Promise<any> => {
  // Get the user's person ID using OpenID Connect userinfo (works with our approved scopes)
  const profileResponse = await axios.get(
    "https://api.linkedin.com/v2/userinfo",
    {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    }
  );

  const personId = profileResponse.data.sub; // OpenID Connect uses 'sub' for user ID

  // Create text-only post using LinkedIn v2 UGC API
  const postData = {
    author: `urn:li:person:${personId}`,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: {
          text: postContent.content,
        },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility":
        postContent.visibility || "PUBLIC",
    },
  };

  const response = await axios.post(
    "https://api.linkedin.com/v2/ugcPosts",
    postData,
    {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
    }
  );

  return response.data;
};

export const createImagePost = async (
  linkedin: LinkedinClient,
  tokens: LinkedInTokens,
  postContent: LinkedInImagePost
): Promise<any> => {
  // Get the user's person ID using OpenID Connect userinfo
  const profileResponse = await axios.get(
    "https://api.linkedin.com/v2/userinfo",
    {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    }
  );

  const personId = profileResponse.data.sub;

  // Step 1: Validate image file exists
  if (!fs.existsSync(postContent.imagePath)) {
    throw new Error(`Image file not found: ${postContent.imagePath}`);
  }

  // Step 2: Register upload for the image
  const registerUploadResponse = await axios.post(
    "https://api.linkedin.com/v2/assets?action=registerUpload",
    {
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: `urn:li:person:${personId}`,
        serviceRelationships: [
          {
            relationshipType: "OWNER",
            identifier: "urn:li:userGeneratedContent",
          },
        ],
      },
    },
    {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
    }
  );

  const uploadUrl =
    registerUploadResponse.data.value.uploadMechanism[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ].uploadUrl;
  const asset = registerUploadResponse.data.value.asset;

  // Step 3: Upload the image
  const imageBuffer = fs.readFileSync(postContent.imagePath);
  const mimeType = getMimeType(postContent.imagePath);

  await axios.put(uploadUrl, imageBuffer, {
    headers: {
      "Content-Type": mimeType,
    },
  });

  // Step 4: Create the post with image
  const postData = {
    author: `urn:li:person:${personId}`,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: {
          text: postContent.content,
        },
        shareMediaCategory: "IMAGE",
        media: [
          {
            status: "READY",
            description: {
              text: postContent.imageAltText || "Image",
            },
            media: asset,
            title: {
              text: "Image",
            },
          },
        ],
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility":
        postContent.visibility || "PUBLIC",
    },
  };

  const response = await axios.post(
    "https://api.linkedin.com/v2/ugcPosts",
    postData,
    {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
    }
  );

  return response.data;
};

// Helper function to determine MIME type from file extension
const getMimeType = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: { [key: string]: string } = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
  };
  return mimeTypes[ext] || "application/octet-stream";
};

// Keep the original createPost function for backward compatibility
export const createPost = async (
  linkedin: LinkedinClient,
  tokens: LinkedInTokens,
  postContent: {
    content: string;
    visibility?: string;
  }
): Promise<any> => {
  return createTextPost(linkedin, tokens, postContent);
};

export const getCompanyInfo = async (
  linkedin: LinkedinClient,
  tokens: LinkedInTokens,
  companyId?: string
): Promise<any> => {
  const url = companyId
    ? `https://api.linkedin.com/v2/organizations/${companyId}`
    : "https://api.linkedin.com/v2/organizationAcls?q=roleAssignee";

  const projection = companyId
    ? "(id,name,description,website,industry,companyType,employeeCountRange)"
    : "(elements*(organization~(id,name,localizedName)))";

  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    params: {
      projection: projection,
    },
  });

  return response.data;
};

export const formatProfilePicture = async (
  profilePicture: any
): Promise<any> => {
  if (!profilePicture || !profilePicture["displayImage~"]) {
    return undefined;
  }

  const profilePictureUrl = profilePicture["displayImage~"].elements
    .pop()
    ?.identifiers?.pop()?.identifier;

  if (!profilePictureUrl) {
    return undefined;
  }

  try {
    const { data, headers } = await axios.get(profilePictureUrl, {
      responseType: "arraybuffer",
    });
    const mimeType = headers["content-type"];
    const base64Data = Buffer.from(data, "binary").toString("base64");
    return { mimeType, data: base64Data };
  } catch (error) {
    console.error("Failed to fetch profile picture:", error);
    return undefined;
  }
};
