import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios, { AxiosResponse } from "axios";
import { configManager } from "../utils/configManager.js";
import { logger } from "../utils/logger.js";

// Facebook Graph API configuration
const GRAPH_API_VERSION = "v18.0";
const GRAPH_API_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface FacebookConfig {
  pageAccessToken: string;
  pageId: string;
}

interface FacebookPost {
  id: string;
  message?: string;
  created_time: string;
}

interface FacebookComment {
  id: string;
  message: string;
  from: {
    name: string;
    id: string;
  };
  created_time: string;
}

interface FacebookApiResponse {
  data?: any[];
  id?: string;
  success?: boolean;
  error?: {
    message: string;
    type: string;
    code: number;
  };
}

/**
 * Get Facebook configuration from environment or config
 */
function getFacebookConfig(): FacebookConfig {
  const pageAccessToken =
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN ||
    configManager.getGeneralConfig().facebookPageAccessToken;
  const pageId =
    process.env.FACEBOOK_PAGE_ID ||
    configManager.getGeneralConfig().facebookPageId;

  if (!pageAccessToken) {
    throw new Error(
      "FACEBOOK_PAGE_ACCESS_TOKEN is required. Set it in environment variables or config."
    );
  }

  if (!pageId) {
    throw new Error(
      "FACEBOOK_PAGE_ID is required. Set it in environment variables or config."
    );
  }

  return {
    pageAccessToken,
    pageId,
  };
}

/**
 * Make a request to Facebook Graph API
 */
async function makeGraphApiRequest(
  method: "GET" | "POST" | "DELETE",
  endpoint: string,
  params: Record<string, any> = {},
  data: Record<string, any> = {}
): Promise<FacebookApiResponse> {
  const config = getFacebookConfig();
  const url = `${GRAPH_API_BASE_URL}${endpoint}`;

  const requestParams = {
    access_token: config.pageAccessToken,
    ...params,
  };

  try {
    let response: AxiosResponse;

    if (method === "GET") {
      response = await axios.get(url, { params: requestParams });
    } else if (method === "POST") {
      response = await axios.post(url, data, { params: requestParams });
    } else if (method === "DELETE") {
      response = await axios.delete(url, { params: requestParams });
    } else {
      throw new Error(`Unsupported HTTP method: ${method}`);
    }

    return response.data;
  } catch (error: any) {
    logger.error(`Facebook API request failed: ${error.message}`, {
      method,
      endpoint,
      error: error.response?.data || error.message,
    });

    if (error.response?.data) {
      return error.response.data;
    }

    throw new Error(`Facebook API request failed: ${error.message}`);
  }
}

/**
 * Post a message to the Facebook Page
 */
export async function postToFacebook(
  message: string
): Promise<FacebookApiResponse> {
  logger.info("Posting to Facebook page", { messageLength: message.length });

  const config = getFacebookConfig();
  const result = await makeGraphApiRequest("POST", `/${config.pageId}/feed`, {
    message: message,
  });

  logger.info("Facebook post created", { postId: result.id });
  return result;
}

/**
 * Reply to a comment on a specific post
 */
export async function replyToComment(
  commentId: string,
  message: string
): Promise<FacebookApiResponse> {
  logger.info("Replying to Facebook comment", {
    commentId,
    messageLength: message.length,
  });

  const result = await makeGraphApiRequest("POST", `/${commentId}/comments`, {
    message: message,
  });

  logger.info("Facebook comment reply created", { replyId: result.id });
  return result;
}

/**
 * Get posts from the Facebook Page
 */
export async function getPagePosts(
  limit: number = 25
): Promise<FacebookPost[]> {
  logger.info("Fetching Facebook page posts", { limit });

  const config = getFacebookConfig();
  const result = await makeGraphApiRequest("GET", `/${config.pageId}/posts`, {
    fields: "id,message,created_time,permalink_url",
    limit: limit,
  });

  const posts = result.data || [];
  logger.info("Facebook posts fetched", { count: posts.length });

  return posts;
}

/**
 * Get comments for a specific post
 */
export async function getPostComments(
  postId: string,
  limit: number = 25
): Promise<FacebookComment[]> {
  logger.info("Fetching post comments", { postId, limit });

  const result = await makeGraphApiRequest("GET", `/${postId}/comments`, {
    fields: "id,message,from,created_time",
    limit: limit,
  });

  const comments = result.data || [];
  logger.info("Post comments fetched", { count: comments.length });

  return comments;
}

/**
 * Filter negative comments based on keywords
 */
export function filterNegativeComments(
  comments: FacebookComment[]
): FacebookComment[] {
  const negativeKeywords = [
    "bad",
    "terrible",
    "awful",
    "hate",
    "dislike",
    "problem",
    "issue",
    "worst",
    "horrible",
    "disgusting",
    "trash",
    "garbage",
    "stupid",
    "useless",
    "scam",
    "fraud",
    "fake",
    "lies",
    "disappointed",
  ];

  const negativeComments = comments.filter((comment) => {
    if (!comment.message) return false;

    const message = comment.message.toLowerCase();
    return negativeKeywords.some((keyword) => message.includes(keyword));
  });

  logger.info("Negative comments filtered", {
    total: comments.length,
    negative: negativeComments.length,
  });

  return negativeComments;
}

/**
 * Delete a post from the Facebook Page
 */
export async function deletePost(postId: string): Promise<FacebookApiResponse> {
  logger.info("Deleting Facebook post", { postId });

  const result = await makeGraphApiRequest("DELETE", `/${postId}`);

  if (result.success) {
    logger.info("Facebook post deleted successfully", { postId });
  }

  return result;
}

/**
 * Delete a comment from a post
 */
export async function deleteComment(
  commentId: string
): Promise<FacebookApiResponse> {
  logger.info("Deleting Facebook comment", { commentId });

  const result = await makeGraphApiRequest("DELETE", `/${commentId}`);

  if (result.success) {
    logger.info("Facebook comment deleted successfully", { commentId });
  }

  return result;
}

/**
 * Get page information
 */
export async function getPageInfo(): Promise<any> {
  logger.info("Fetching Facebook page information");

  const config = getFacebookConfig();
  const result = await makeGraphApiRequest("GET", `/${config.pageId}`, {
    fields:
      "id,name,username,about,category,followers_count,fan_count,link,verification_status",
  });

  logger.info("Facebook page info fetched", { pageName: (result as any).name });
  return result;
}

/**
 * Post with photo to Facebook Page
 */
export async function postWithPhoto(
  message: string,
  photoUrl: string
): Promise<FacebookApiResponse> {
  logger.info("Posting to Facebook with photo", {
    messageLength: message.length,
    photoUrl,
  });

  const config = getFacebookConfig();
  const result = await makeGraphApiRequest("POST", `/${config.pageId}/photos`, {
    message: message,
    url: photoUrl,
  });

  logger.info("Facebook photo post created", { postId: result.id });
  return result;
}

/**
 * Register Facebook tools with the MCP server
 */
export function registerFacebookTools(
  server: McpServer,
  config?: Record<string, any>
) {
  server.tool(
    "facebook_post_message",
    "Post a message to your Facebook Page",
    {
      message: z.string().describe("Message content to post on Facebook"),
    },
    async (params) => {
      try {
        const result = await postToFacebook(params.message);

        if (result.error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Error posting to Facebook: ${result.error.message}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `✅ Successfully posted to Facebook!\n\nPost ID: ${result.id}\nMessage: "${params.message}"`,
            },
          ],
        };
      } catch (error: any) {
        logger.error("Facebook post failed", { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to post to Facebook: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "facebook_post_with_photo",
    "Post a message with photo to your Facebook Page",
    {
      message: z.string().describe("Message content to post with the photo"),
      photoUrl: z.string().url().describe("URL of the photo to post"),
    },
    async (params) => {
      try {
        const result = await postWithPhoto(params.message, params.photoUrl);

        if (result.error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Error posting photo to Facebook: ${result.error.message}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `✅ Successfully posted photo to Facebook!\n\nPost ID: ${result.id}\nMessage: "${params.message}"\nPhoto: ${params.photoUrl}`,
            },
          ],
        };
      } catch (error: any) {
        logger.error("Facebook photo post failed", { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to post photo to Facebook: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "facebook_get_page_posts",
    "Get recent posts from your Facebook Page",
    {
      limit: z
        .number()
        .optional()
        .default(10)
        .describe("Number of posts to retrieve (max 100)"),
    },
    async (params) => {
      try {
        const posts = await getPagePosts(Math.min(params.limit || 10, 100));

        if (posts.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "📭 No posts found on your Facebook page.",
              },
            ],
          };
        }

        const postsText = posts
          .map(
            (post, index) =>
              `${index + 1}. Post ID: ${post.id}\n` +
              `   Created: ${new Date(post.created_time).toLocaleString()}\n` +
              `   Message: ${post.message?.substring(0, 100)}${
                post.message && post.message.length > 100 ? "..." : ""
              }\n`
          )
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text: `📚 Found ${posts.length} recent posts:\n\n${postsText}`,
            },
          ],
        };
      } catch (error: any) {
        logger.error("Failed to fetch Facebook posts", {
          error: error.message,
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to fetch Facebook posts: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "facebook_get_post_comments",
    "Get comments for a specific Facebook post",
    {
      postId: z
        .string()
        .describe("ID of the Facebook post to get comments from"),
      limit: z
        .number()
        .optional()
        .default(25)
        .describe("Number of comments to retrieve"),
    },
    async (params) => {
      try {
        const comments = await getPostComments(
          params.postId,
          params.limit || 25
        );

        if (comments.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `📭 No comments found for post ${params.postId}`,
              },
            ],
          };
        }

        const commentsText = comments
          .map(
            (comment, index) =>
              `${index + 1}. Comment ID: ${comment.id}\n` +
              `   From: ${comment.from.name}\n` +
              `   Created: ${new Date(
                comment.created_time
              ).toLocaleString()}\n` +
              `   Message: ${comment.message.substring(0, 150)}${
                comment.message.length > 150 ? "..." : ""
              }\n`
          )
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text: `💬 Found ${comments.length} comments for post ${params.postId}:\n\n${commentsText}`,
            },
          ],
        };
      } catch (error: any) {
        logger.error("Failed to fetch post comments", {
          error: error.message,
          postId: params.postId,
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to fetch comments for post ${params.postId}: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "facebook_reply_to_comment",
    "Reply to a comment on a Facebook post",
    {
      commentId: z.string().describe("ID of the comment to reply to"),
      message: z.string().describe("Reply message"),
    },
    async (params) => {
      try {
        const result = await replyToComment(params.commentId, params.message);

        if (result.error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Error replying to comment: ${result.error.message}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `✅ Successfully replied to comment!\n\nReply ID: ${result.id}\nOriginal Comment ID: ${params.commentId}\nReply: "${params.message}"`,
            },
          ],
        };
      } catch (error: any) {
        logger.error("Failed to reply to comment", {
          error: error.message,
          commentId: params.commentId,
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to reply to comment ${params.commentId}: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "facebook_filter_negative_comments",
    "Find negative comments on a Facebook post using keyword filtering",
    {
      postId: z
        .string()
        .describe("ID of the Facebook post to analyze comments"),
    },
    async (params) => {
      try {
        const comments = await getPostComments(params.postId, 100); // Get more comments for analysis
        const negativeComments = filterNegativeComments(comments);

        if (negativeComments.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `✅ No negative comments detected in ${comments.length} comments for post ${params.postId}`,
              },
            ],
          };
        }

        const negativeText = negativeComments
          .map(
            (comment, index) =>
              `${index + 1}. Comment ID: ${comment.id}\n` +
              `   From: ${comment.from.name}\n` +
              `   Created: ${new Date(
                comment.created_time
              ).toLocaleString()}\n` +
              `   Message: ${comment.message}\n`
          )
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text: `⚠️ Found ${negativeComments.length} potentially negative comments out of ${comments.length} total comments:\n\n${negativeText}`,
            },
          ],
        };
      } catch (error: any) {
        logger.error("Failed to analyze comments", {
          error: error.message,
          postId: params.postId,
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to analyze comments for post ${params.postId}: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "facebook_delete_post",
    "Delete a post from your Facebook Page",
    {
      postId: z.string().describe("ID of the Facebook post to delete"),
    },
    async (params) => {
      try {
        const result = await deletePost(params.postId);

        if (result.error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Error deleting post: ${result.error.message}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `✅ Successfully deleted Facebook post ${params.postId}`,
            },
          ],
        };
      } catch (error: any) {
        logger.error("Failed to delete post", {
          error: error.message,
          postId: params.postId,
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to delete post ${params.postId}: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "facebook_delete_comment",
    "Delete a comment from a Facebook post",
    {
      commentId: z.string().describe("ID of the Facebook comment to delete"),
    },
    async (params) => {
      try {
        const result = await deleteComment(params.commentId);

        if (result.error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Error deleting comment: ${result.error.message}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `✅ Successfully deleted Facebook comment ${params.commentId}`,
            },
          ],
        };
      } catch (error: any) {
        logger.error("Failed to delete comment", {
          error: error.message,
          commentId: params.commentId,
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to delete comment ${params.commentId}: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "facebook_get_page_info",
    "Get information about your Facebook Page",
    {},
    async (params) => {
      try {
        const pageInfo = await getPageInfo();

        if (pageInfo.error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Error getting page info: ${pageInfo.error.message}`,
              },
            ],
          };
        }

        const infoText = [
          `📱 Facebook Page Information:`,
          ``,
          `Name: ${pageInfo.name}`,
          `Username: @${pageInfo.username || "N/A"}`,
          `Category: ${pageInfo.category}`,
          `Followers: ${pageInfo.followers_count?.toLocaleString() || "N/A"}`,
          `Likes: ${pageInfo.fan_count?.toLocaleString() || "N/A"}`,
          `Verification: ${pageInfo.verification_status || "Not verified"}`,
          `Link: ${pageInfo.link}`,
          ``,
          `About: ${pageInfo.about || "No description available"}`,
        ].join("\n");

        return {
          content: [
            {
              type: "text",
              text: infoText,
            },
          ],
        };
      } catch (error: any) {
        logger.error("Failed to get page info", { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to get page information: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  logger.info("Facebook tools registered successfully");
}
