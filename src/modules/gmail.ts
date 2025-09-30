import { z } from "zod";
import { google, gmail_v1 } from "googleapis";
import { createOAuth2Client, validateCredentials } from "../oauth/index.js";
import { getDefaultOAuth2Client } from "../oauth/providers/google.js";

export type Draft = gmail_v1.Schema$Draft;
export type DraftCreateParams = gmail_v1.Params$Resource$Users$Drafts$Create;
export type DraftUpdateParams = gmail_v1.Params$Resource$Users$Drafts$Update;
export type Message = gmail_v1.Schema$Message;
export type MessagePart = gmail_v1.Schema$MessagePart;
export type MessagePartBody = gmail_v1.Schema$MessagePartBody;
export type MessagePartHeader = gmail_v1.Schema$MessagePartHeader;
export type MessageSendParams = gmail_v1.Params$Resource$Users$Messages$Send;
export type Thread = gmail_v1.Schema$Thread;

export type NewMessage = {
  threadId?: string;
  raw?: string;
  to?: string[] | undefined;
  cc?: string[] | undefined;
  bcc?: string[] | undefined;
  subject?: string | undefined;
  body?: string | undefined;
  includeBodyHtml?: boolean;
};

export const RESPONSE_HEADERS_LIST = [
  "Date",
  "From",
  "To",
  "Subject",
  "Message-ID",
  "In-Reply-To",
  "References",
];

// Lazy-loaded to avoid issues during testing
let _defaultGmailClient: any = null;

export const getDefaultGmailClient = () => {
  if (!_defaultGmailClient) {
    const client = getDefaultOAuth2Client();
    _defaultGmailClient = client
      ? google.gmail({ version: "v1", auth: client })
      : null;
  }
  return _defaultGmailClient;
};

export const formatResponse = (response: any) => ({
  content: [{ type: "text", text: JSON.stringify(response) }],
});

export const handleTool = async (
  queryConfig: Record<string, any> | undefined,
  apiCall: (gmail: gmail_v1.Gmail) => Promise<any>
) => {
  try {
    const oauth2Client = queryConfig
      ? createOAuth2Client(queryConfig)
      : getDefaultOAuth2Client();
    if (!oauth2Client)
      throw new Error(
        "OAuth2 client could not be created, please check your credentials"
      );

    const credentialsAreValid = await validateCredentials(oauth2Client);
    if (!credentialsAreValid)
      throw new Error("OAuth2 credentials are invalid, please re-authenticate");

    const gmailClient = queryConfig
      ? google.gmail({ version: "v1", auth: oauth2Client })
      : getDefaultGmailClient();
    if (!gmailClient)
      throw new Error(
        "Gmail client could not be created, please check your credentials"
      );

    const result = await apiCall(gmailClient);
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
        error: `Authentication failed: ${error.message}. Please re-authenticate by running: npx @softleolabs/pa-mcp auth`,
      });
    }

    return formatResponse({ error: `Tool execution failed: ${error.message}` });
  }
};

export const decodedBody = (body: MessagePartBody) => {
  if (!body?.data) return body;

  const decodedData = Buffer.from(body.data, "base64").toString("utf-8");
  const decodedBody: MessagePartBody = {
    data: decodedData,
    size: body.data.length,
    attachmentId: body.attachmentId,
  };
  return decodedBody;
};

export const processMessagePart = (
  messagePart: MessagePart,
  includeBodyHtml = false
): MessagePart => {
  if (
    (messagePart.mimeType !== "text/html" || includeBodyHtml) &&
    messagePart.body
  ) {
    messagePart.body = decodedBody(messagePart.body);
  }

  if (messagePart.parts) {
    messagePart.parts = messagePart.parts.map((part) =>
      processMessagePart(part, includeBodyHtml)
    );
  }

  if (messagePart.headers) {
    messagePart.headers = messagePart.headers.filter((header) =>
      RESPONSE_HEADERS_LIST.includes(header.name || "")
    );
  }

  return messagePart;
};

export const getNestedHistory = (
  messagePart: MessagePart,
  level = 1
): string => {
  if (messagePart.mimeType === "text/plain" && messagePart.body?.data) {
    const { data } = decodedBody(messagePart.body);
    if (!data) return "";
    return data
      .split("\n")
      .map((line) => ">" + (line.startsWith(">") ? "" : " ") + line)
      .join("\n");
  }

  return (messagePart.parts || [])
    .map((p) => getNestedHistory(p, level + 1))
    .filter((p) => p)
    .join("\n");
};

export const findHeader = (
  headers: MessagePartHeader[] | undefined,
  name: string
) => {
  if (!headers || !Array.isArray(headers) || !name) return undefined;
  return (
    headers.find((h) => h?.name?.toLowerCase() === name.toLowerCase())?.value ??
    undefined
  );
};

export const formatEmailList = (emailList: string | null | undefined) => {
  if (!emailList) return [];
  return emailList.split(",").map((email) => email.trim());
};

export const getQuotedContent = (thread: Thread) => {
  if (!thread.messages?.length) return "";

  const sentMessages = thread.messages.filter(
    (msg) =>
      msg.labelIds?.includes("SENT") ||
      (!msg.labelIds?.includes("DRAFT") &&
        findHeader(msg.payload?.headers || [], "date"))
  );

  if (!sentMessages.length) return "";

  const lastMessage = sentMessages[sentMessages.length - 1];
  if (!lastMessage?.payload) return "";

  let quotedContent = [];

  if (lastMessage.payload.headers) {
    const fromHeader = findHeader(lastMessage.payload.headers || [], "from");
    const dateHeader = findHeader(lastMessage.payload.headers || [], "date");
    if (fromHeader && dateHeader) {
      quotedContent.push("");
      quotedContent.push(`On ${dateHeader} ${fromHeader} wrote:`);
      quotedContent.push("");
    }
  }

  const nestedHistory = getNestedHistory(lastMessage.payload);
  if (nestedHistory) {
    quotedContent.push(nestedHistory);
    quotedContent.push("");
  }

  return quotedContent.join("\n");
};

export const getThreadHeaders = (thread: Thread) => {
  let headers: string[] = [];

  if (!thread.messages?.length) return headers;

  const lastMessage = thread.messages[thread.messages.length - 1];
  const references: string[] = [];

  let subjectHeader = findHeader(lastMessage.payload?.headers || [], "subject");
  if (subjectHeader) {
    if (!subjectHeader.toLowerCase().startsWith("re:")) {
      subjectHeader = `Re: ${subjectHeader}`;
    }
    headers.push(`Subject: ${subjectHeader}`);
  }

  const messageIdHeader = findHeader(
    lastMessage.payload?.headers || [],
    "message-id"
  );
  if (messageIdHeader) {
    headers.push(`In-Reply-To: ${messageIdHeader}`);
    references.push(messageIdHeader);
  }

  const referencesHeader = findHeader(
    lastMessage.payload?.headers || [],
    "references"
  );
  if (referencesHeader) references.unshift(...referencesHeader.split(" "));

  if (references.length > 0)
    headers.push(`References: ${references.join(" ")}`);

  return headers;
};

export const wrapTextBody = (text: string): string =>
  text
    .split("\n")
    .map((line) => {
      if (line.length <= 76) return line;
      const chunks = line.match(/.{1,76}/g) || [];
      return chunks.join("=\n");
    })
    .join("\n");

export const constructRawMessage = async (
  gmail: gmail_v1.Gmail,
  params: NewMessage
) => {
  let thread: Thread | null = null;
  if (params.threadId) {
    const threadParams = { userId: "me", id: params.threadId, format: "full" };
    const { data } = await gmail.users.threads.get(threadParams);
    thread = data;
  }

  const message = [];
  if (params.to?.length)
    message.push(`To: ${wrapTextBody(params.to.join(", "))}`);
  if (params.cc?.length)
    message.push(`Cc: ${wrapTextBody(params.cc.join(", "))}`);
  if (params.bcc?.length)
    message.push(`Bcc: ${wrapTextBody(params.bcc.join(", "))}`);
  if (thread) {
    message.push(
      ...getThreadHeaders(thread).map((header) => wrapTextBody(header))
    );
  } else if (params.subject) {
    message.push(`Subject: ${wrapTextBody(params.subject)}`);
  } else {
    message.push("Subject: (No Subject)");
  }
  message.push('Content-Type: text/plain; charset="UTF-8"');
  message.push("Content-Transfer-Encoding: quoted-printable");
  message.push("MIME-Version: 1.0");
  message.push("");

  if (params.body) message.push(wrapTextBody(params.body));

  if (thread) {
    const quotedContent = getQuotedContent(thread);
    if (quotedContent) {
      message.push("");
      message.push(wrapTextBody(quotedContent));
    }
  }

  return Buffer.from(message.join("\r\n"))
    .toString("base64url")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};
