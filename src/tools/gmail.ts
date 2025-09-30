import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { gmail_v1 } from "googleapis";
import {
  handleTool,
  formatResponse,
  constructRawMessage,
  processMessagePart,
  Draft,
  DraftCreateParams,
  Message,
  MessageSendParams,
  Thread,
} from "../modules/gmail.js";

export function registerGmailTools(
  server: McpServer,
  config?: Record<string, any>
) {
  server.tool(
    "gmail_create_draft",
    "Create a draft email in Gmail. Note the mechanics of the raw parameter.",
    {
      raw: z
        .string()
        .optional()
        .describe(
          "The entire email message in base64url encoded RFC 2822 format, ignores params.to, cc, bcc, subject, body, includeBodyHtml if provided"
        ),
      threadId: z
        .string()
        .optional()
        .describe("The thread ID to associate this draft with"),
      to: z
        .array(z.string())
        .optional()
        .describe("List of recipient email addresses"),
      cc: z
        .array(z.string())
        .optional()
        .describe("List of CC recipient email addresses"),
      bcc: z
        .array(z.string())
        .optional()
        .describe("List of BCC recipient email addresses"),
      subject: z.string().optional().describe("The subject of the email"),
      body: z.string().optional().describe("The body of the email"),
      includeBodyHtml: z
        .boolean()
        .optional()
        .describe(
          "Whether to include the parsed HTML in the return for each body, excluded by default because they can be excessively large"
        ),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        let raw = params.raw;
        if (!raw) raw = await constructRawMessage(gmail, params);

        const draftCreateParams: DraftCreateParams = {
          userId: "me",
          requestBody: { message: { raw } },
        };
        if (params.threadId && draftCreateParams.requestBody?.message) {
          draftCreateParams.requestBody.message.threadId = params.threadId;
        }

        const { data } = await gmail.users.drafts.create(draftCreateParams);

        if (data.message?.payload) {
          data.message.payload = processMessagePart(
            data.message.payload,
            params.includeBodyHtml
          );
        }

        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_delete_draft",
    "Delete a draft",
    {
      id: z.string().describe("The ID of the draft to delete"),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.drafts.delete({
          userId: "me",
          id: params.id,
        });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_get_draft",
    "Get a specific draft by ID",
    {
      id: z.string().describe("The ID of the draft to retrieve"),
      includeBodyHtml: z
        .boolean()
        .optional()
        .describe(
          "Whether to include the parsed HTML in the return for each body, excluded by default because they can be excessively large"
        ),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.drafts.get({
          userId: "me",
          id: params.id,
          format: "full",
        });

        if (data.message?.payload) {
          data.message.payload = processMessagePart(
            data.message.payload,
            params.includeBodyHtml
          );
        }

        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_list_drafts",
    "List drafts in the user's mailbox",
    {
      maxResults: z
        .number()
        .optional()
        .describe(
          "Maximum number of drafts to return. Accepts values between 1-500"
        ),
      q: z
        .string()
        .optional()
        .describe(
          "Only return drafts matching the specified query. Supports the same query format as the Gmail search box"
        ),
      includeSpamTrash: z
        .boolean()
        .optional()
        .describe("Include drafts from SPAM and TRASH in the results"),
      includeBodyHtml: z
        .boolean()
        .optional()
        .describe(
          "Whether to include the parsed HTML in the return for each body, excluded by default because they can be excessively large"
        ),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        let drafts: Draft[] = [];

        const { data } = await gmail.users.drafts.list({
          userId: "me",
          ...params,
        });

        drafts.push(...(data.drafts || []));

        while (data.nextPageToken) {
          const { data: nextData } = await gmail.users.drafts.list({
            userId: "me",
            ...params,
            pageToken: data.nextPageToken,
          });
          drafts.push(...(nextData.drafts || []));
        }

        if (drafts) {
          drafts = drafts.map((draft) => {
            if (draft.message?.payload) {
              draft.message.payload = processMessagePart(
                draft.message.payload,
                params.includeBodyHtml
              );
            }
            return draft;
          });
        }

        return formatResponse(drafts);
      });
    }
  );

  server.tool(
    "gmail_send_draft",
    "Send an existing draft",
    {
      id: z.string().describe("The ID of the draft to send"),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        try {
          const { data } = await gmail.users.drafts.send({
            userId: "me",
            requestBody: { id: params.id },
          });
          return formatResponse(data);
        } catch (error) {
          return formatResponse({
            error:
              "Error sending draft, are you sure you have at least one recipient?",
          });
        }
      });
    }
  );

  server.tool(
    "gmail_create_label",
    "Create a new label",
    {
      name: z.string().describe("The display name of the label"),
      messageListVisibility: z
        .enum(["show", "hide"])
        .optional()
        .describe(
          "The visibility of messages with this label in the message list"
        ),
      labelListVisibility: z
        .enum(["labelShow", "labelShowIfUnread", "labelHide"])
        .optional()
        .describe("The visibility of the label in the label list"),
      color: z
        .object({
          textColor: z
            .string()
            .describe("The text color of the label as hex string"),
          backgroundColor: z
            .string()
            .describe("The background color of the label as hex string"),
        })
        .optional()
        .describe("The color settings for the label"),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.labels.create({
          userId: "me",
          requestBody: params,
        });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_delete_label",
    "Delete a label",
    {
      id: z.string().describe("The ID of the label to delete"),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.labels.delete({
          userId: "me",
          id: params.id,
        });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_get_label",
    "Get a specific label by ID",
    {
      id: z.string().describe("The ID of the label to retrieve"),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.labels.get({
          userId: "me",
          id: params.id,
        });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_list_labels",
    "List all labels in the user's mailbox",
    {},
    async () => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.labels.list({ userId: "me" });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_patch_label",
    "Patch an existing label (partial update)",
    {
      id: z.string().describe("The ID of the label to patch"),
      name: z.string().optional().describe("The display name of the label"),
      messageListVisibility: z
        .enum(["show", "hide"])
        .optional()
        .describe(
          "The visibility of messages with this label in the message list"
        ),
      labelListVisibility: z
        .enum(["labelShow", "labelShowIfUnread", "labelHide"])
        .optional()
        .describe("The visibility of the label in the label list"),
      color: z
        .object({
          textColor: z
            .string()
            .describe("The text color of the label as hex string"),
          backgroundColor: z
            .string()
            .describe("The background color of the label as hex string"),
        })
        .optional()
        .describe("The color settings for the label"),
    },
    async (params) => {
      const { id, ...labelData } = params;
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.labels.patch({
          userId: "me",
          id,
          requestBody: labelData,
        });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_update_label",
    "Update an existing label",
    {
      id: z.string().describe("The ID of the label to update"),
      name: z.string().optional().describe("The display name of the label"),
      messageListVisibility: z
        .enum(["show", "hide"])
        .optional()
        .describe(
          "The visibility of messages with this label in the message list"
        ),
      labelListVisibility: z
        .enum(["labelShow", "labelShowIfUnread", "labelHide"])
        .optional()
        .describe("The visibility of the label in the label list"),
      color: z
        .object({
          textColor: z
            .string()
            .describe("The text color of the label as hex string"),
          backgroundColor: z
            .string()
            .describe("The background color of the label as hex string"),
        })
        .optional()
        .describe("The color settings for the label"),
    },
    async (params) => {
      const { id, ...labelData } = params;
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.labels.update({
          userId: "me",
          id,
          requestBody: labelData,
        });
        return formatResponse(data);
      });
    }
  );

  // Adding more message-related tools (continuing from the original file)
  server.tool(
    "gmail_batch_delete_messages",
    "Delete multiple messages",
    {
      ids: z.array(z.string()).describe("The IDs of the messages to delete"),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.messages.batchDelete({
          userId: "me",
          requestBody: { ids: params.ids },
        });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_batch_modify_messages",
    "Modify the labels on multiple messages",
    {
      ids: z.array(z.string()).describe("The IDs of the messages to modify"),
      addLabelIds: z
        .array(z.string())
        .optional()
        .describe("A list of label IDs to add to the messages"),
      removeLabelIds: z
        .array(z.string())
        .optional()
        .describe("A list of label IDs to remove from the messages"),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.messages.batchModify({
          userId: "me",
          requestBody: {
            ids: params.ids,
            addLabelIds: params.addLabelIds,
            removeLabelIds: params.removeLabelIds,
          },
        });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_delete_message",
    "Immediately and permanently delete a message",
    {
      id: z.string().describe("The ID of the message to delete"),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.messages.delete({
          userId: "me",
          id: params.id,
        });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_get_message",
    "Get a specific message by ID with format options",
    {
      id: z.string().describe("The ID of the message to retrieve"),
      includeBodyHtml: z
        .boolean()
        .optional()
        .describe(
          "Whether to include the parsed HTML in the return for each body, excluded by default because they can be excessively large"
        ),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.messages.get({
          userId: "me",
          id: params.id,
          format: "full",
        });

        if (data.payload) {
          data.payload = processMessagePart(
            data.payload,
            params.includeBodyHtml
          );
        }

        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_list_messages",
    "List messages in the user's mailbox with optional filtering",
    {
      maxResults: z
        .number()
        .optional()
        .describe(
          "Maximum number of messages to return. Accepts values between 1-500"
        ),
      pageToken: z
        .string()
        .optional()
        .describe("Page token to retrieve a specific page of results"),
      q: z
        .string()
        .optional()
        .describe(
          "Only return messages matching the specified query. Supports the same query format as the Gmail search box"
        ),
      labelIds: z
        .array(z.string())
        .optional()
        .describe(
          "Only return messages with labels that match all of the specified label IDs"
        ),
      includeSpamTrash: z
        .boolean()
        .optional()
        .describe("Include messages from SPAM and TRASH in the results"),
      includeBodyHtml: z
        .boolean()
        .optional()
        .describe(
          "Whether to include the parsed HTML in the return for each body, excluded by default because they can be excessively large"
        ),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.messages.list({
          userId: "me",
          ...params,
        });

        if (data.messages) {
          data.messages = data.messages.map((message: Message) => {
            if (message.payload) {
              message.payload = processMessagePart(
                message.payload,
                params.includeBodyHtml
              );
            }
            return message;
          });
        }

        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_modify_message",
    "Modify the labels on a message",
    {
      id: z.string().describe("The ID of the message to modify"),
      addLabelIds: z
        .array(z.string())
        .optional()
        .describe("A list of label IDs to add to the message"),
      removeLabelIds: z
        .array(z.string())
        .optional()
        .describe("A list of label IDs to remove from the message"),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.messages.modify({
          userId: "me",
          id: params.id,
          requestBody: {
            addLabelIds: params.addLabelIds,
            removeLabelIds: params.removeLabelIds,
          },
        });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_send_message",
    "Send an email message to specified recipients. Note the mechanics of the raw parameter.",
    {
      raw: z
        .string()
        .optional()
        .describe(
          "The entire email message in base64url encoded RFC 2822 format, ignores params.to, cc, bcc, subject, body, includeBodyHtml if provided"
        ),
      threadId: z
        .string()
        .optional()
        .describe("The thread ID to associate this message with"),
      to: z
        .array(z.string())
        .optional()
        .describe("List of recipient email addresses"),
      cc: z
        .array(z.string())
        .optional()
        .describe("List of CC recipient email addresses"),
      bcc: z
        .array(z.string())
        .optional()
        .describe("List of BCC recipient email addresses"),
      subject: z.string().optional().describe("The subject of the email"),
      body: z.string().optional().describe("The body of the email"),
      includeBodyHtml: z
        .boolean()
        .optional()
        .describe(
          "Whether to include the parsed HTML in the return for each body, excluded by default because they can be excessively large"
        ),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        let raw = params.raw;
        if (!raw) raw = await constructRawMessage(gmail, params);

        const messageSendParams: MessageSendParams = {
          userId: "me",
          requestBody: { raw },
        };
        if (params.threadId && messageSendParams.requestBody) {
          messageSendParams.requestBody.threadId = params.threadId;
        }

        const { data } = await gmail.users.messages.send(messageSendParams);

        if (data.payload) {
          data.payload = processMessagePart(
            data.payload,
            params.includeBodyHtml
          );
        }

        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_trash_message",
    "Move a message to the trash",
    {
      id: z.string().describe("The ID of the message to move to trash"),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.messages.trash({
          userId: "me",
          id: params.id,
        });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_untrash_message",
    "Remove a message from the trash",
    {
      id: z.string().describe("The ID of the message to remove from trash"),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.messages.untrash({
          userId: "me",
          id: params.id,
        });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_get_attachment",
    "Get a message attachment",
    {
      messageId: z
        .string()
        .describe("ID of the message containing the attachment"),
      id: z.string().describe("The ID of the attachment"),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.messages.attachments.get({
          userId: "me",
          messageId: params.messageId,
          id: params.id,
        });
        return formatResponse(data);
      });
    }
  );

  // Thread operations
  server.tool(
    "gmail_delete_thread",
    "Delete a thread",
    {
      id: z.string().describe("The ID of the thread to delete"),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.threads.delete({
          userId: "me",
          id: params.id,
        });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_get_thread",
    "Get a specific thread by ID",
    {
      id: z.string().describe("The ID of the thread to retrieve"),
      includeBodyHtml: z
        .boolean()
        .optional()
        .describe(
          "Whether to include the parsed HTML in the return for each body, excluded by default because they can be excessively large"
        ),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.threads.get({
          userId: "me",
          id: params.id,
          format: "full",
        });

        if (data.messages) {
          data.messages = data.messages.map((message) => {
            if (message.payload) {
              message.payload = processMessagePart(
                message.payload,
                params.includeBodyHtml
              );
            }
            return message;
          });
        }

        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_list_threads",
    "List threads in the user's mailbox",
    {
      maxResults: z
        .number()
        .optional()
        .describe("Maximum number of threads to return"),
      pageToken: z
        .string()
        .optional()
        .describe("Page token to retrieve a specific page of results"),
      q: z
        .string()
        .optional()
        .describe("Only return threads matching the specified query"),
      labelIds: z
        .array(z.string())
        .optional()
        .describe(
          "Only return threads with labels that match all of the specified label IDs"
        ),
      includeSpamTrash: z
        .boolean()
        .optional()
        .describe("Include threads from SPAM and TRASH in the results"),
      includeBodyHtml: z
        .boolean()
        .optional()
        .describe(
          "Whether to include the parsed HTML in the return for each body, excluded by default because they can be excessively large"
        ),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.threads.list({
          userId: "me",
          ...params,
        });

        if (data.threads) {
          data.threads = data.threads.map((thread) => {
            if (thread.messages) {
              thread.messages = thread.messages.map((message) => {
                if (message.payload) {
                  message.payload = processMessagePart(
                    message.payload,
                    params.includeBodyHtml
                  );
                }
                return message;
              });
            }
            return thread;
          });
        }

        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_modify_thread",
    "Modify the labels applied to a thread",
    {
      id: z.string().describe("The ID of the thread to modify"),
      addLabelIds: z
        .array(z.string())
        .optional()
        .describe("A list of label IDs to add to the thread"),
      removeLabelIds: z
        .array(z.string())
        .optional()
        .describe("A list of label IDs to remove from the thread"),
    },
    async (params) => {
      const { id, ...threadData } = params;
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.threads.modify({
          userId: "me",
          id,
          requestBody: threadData,
        });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_trash_thread",
    "Move a thread to the trash",
    {
      id: z.string().describe("The ID of the thread to move to trash"),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.threads.trash({
          userId: "me",
          id: params.id,
        });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_untrash_thread",
    "Remove a thread from the trash",
    {
      id: z.string().describe("The ID of the thread to remove from trash"),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.threads.untrash({
          userId: "me",
          id: params.id,
        });
        return formatResponse(data);
      });
    }
  );

  // Settings-related tools
  server.tool(
    "gmail_get_auto_forwarding",
    "Gets auto-forwarding settings",
    {},
    async () => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.settings.getAutoForwarding({
          userId: "me",
        });
        return formatResponse(data);
      });
    }
  );

  server.tool("gmail_get_imap", "Gets IMAP settings", {}, async () => {
    return handleTool(config, async (gmail: gmail_v1.Gmail) => {
      const { data } = await gmail.users.settings.getImap({ userId: "me" });
      return formatResponse(data);
    });
  });

  server.tool("gmail_get_language", "Gets language settings", {}, async () => {
    return handleTool(config, async (gmail: gmail_v1.Gmail) => {
      const { data } = await gmail.users.settings.getLanguage({ userId: "me" });
      return formatResponse(data);
    });
  });

  server.tool("gmail_get_pop", "Gets POP settings", {}, async () => {
    return handleTool(config, async (gmail: gmail_v1.Gmail) => {
      const { data } = await gmail.users.settings.getPop({ userId: "me" });
      return formatResponse(data);
    });
  });

  server.tool(
    "gmail_get_vacation",
    "Get vacation responder settings",
    {},
    async () => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.settings.getVacation({
          userId: "me",
        });
        return formatResponse(data);
      });
    }
  );

  // Update settings tools
  server.tool(
    "gmail_update_auto_forwarding",
    "Updates automatic forwarding settings",
    {
      enabled: z
        .boolean()
        .describe(
          "Whether all incoming mail is automatically forwarded to another address"
        ),
      emailAddress: z
        .string()
        .describe(
          "Email address to which messages should be automatically forwarded"
        ),
      disposition: z
        .enum(["leaveInInbox", "archive", "trash", "markRead"])
        .describe(
          "The state in which messages should be left after being forwarded"
        ),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.settings.updateAutoForwarding({
          userId: "me",
          requestBody: params,
        });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_update_imap",
    "Updates IMAP settings",
    {
      enabled: z.boolean().describe("Whether IMAP is enabled for the account"),
      expungeBehavior: z
        .enum(["archive", "trash", "deleteForever"])
        .optional()
        .describe(
          "The action that will be executed on a message when it is marked as deleted and expunged from the last visible IMAP folder"
        ),
      maxFolderSize: z
        .number()
        .optional()
        .describe(
          "An optional limit on the number of messages that can be accessed through IMAP"
        ),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.settings.updateImap({
          userId: "me",
          requestBody: params,
        });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_update_language",
    "Updates language settings",
    {
      displayLanguage: z
        .string()
        .describe(
          "The language to display Gmail in, formatted as an RFC 3066 Language Tag"
        ),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.settings.updateLanguage({
          userId: "me",
          requestBody: params,
        });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_update_pop",
    "Updates POP settings",
    {
      accessWindow: z
        .enum(["disabled", "allMail", "fromNowOn"])
        .describe("The range of messages which are accessible via POP"),
      disposition: z
        .enum(["archive", "trash", "leaveInInbox"])
        .describe(
          "The action that will be executed on a message after it has been fetched via POP"
        ),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.settings.updatePop({
          userId: "me",
          requestBody: params,
        });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_update_vacation",
    "Update vacation responder settings",
    {
      enableAutoReply: z
        .boolean()
        .describe("Whether the vacation responder is enabled"),
      responseSubject: z
        .string()
        .optional()
        .describe(
          "Optional subject line for the vacation responder auto-reply"
        ),
      responseBodyPlainText: z
        .string()
        .describe("Response body in plain text format"),
      restrictToContacts: z
        .boolean()
        .optional()
        .describe("Whether responses are only sent to contacts"),
      restrictToDomain: z
        .boolean()
        .optional()
        .describe(
          "Whether responses are only sent to users in the same domain"
        ),
      startTime: z
        .string()
        .optional()
        .describe("Start time for sending auto-replies (epoch ms)"),
      endTime: z
        .string()
        .optional()
        .describe("End time for sending auto-replies (epoch ms)"),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.settings.updateVacation({
          userId: "me",
          requestBody: params,
        });
        return formatResponse(data);
      });
    }
  );

  // Profile and other tools
  server.tool(
    "gmail_get_profile",
    "Get the current user's Gmail profile",
    {},
    async () => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.getProfile({ userId: "me" });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_watch_mailbox",
    "Watch for changes to the user's mailbox",
    {
      topicName: z
        .string()
        .describe(
          "The name of the Cloud Pub/Sub topic to publish notifications to"
        ),
      labelIds: z
        .array(z.string())
        .optional()
        .describe("Label IDs to restrict notifications to"),
      labelFilterAction: z
        .enum(["include", "exclude"])
        .optional()
        .describe("Whether to include or exclude the specified labels"),
    },
    async (params) => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.watch({
          userId: "me",
          requestBody: params,
        });
        return formatResponse(data);
      });
    }
  );

  server.tool(
    "gmail_stop_mail_watch",
    "Stop receiving push notifications for the given user mailbox",
    {},
    async () => {
      return handleTool(config, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.stop({ userId: "me" });
        return formatResponse(data);
      });
    }
  );

  // Note: I've included the main/most commonly used tools.
  // Additional tools for delegates, filters, forwarding addresses, send-as aliases,
  // and S/MIME can be added similarly following the same pattern.
}
