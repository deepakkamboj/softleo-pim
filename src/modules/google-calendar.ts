import { google, calendar_v3 } from "googleapis";
import { createOAuth2Client, validateCredentials } from "../oauth/index.js";
import { getDefaultOAuth2Client } from "../oauth/providers/google.js";

export type Calendar = calendar_v3.Schema$Calendar;
export type CalendarEvent = calendar_v3.Schema$Event;
export type CalendarList = calendar_v3.Schema$CalendarListEntry;
export type EventAttendee = calendar_v3.Schema$EventAttendee;
export type EventDateTime = calendar_v3.Schema$EventDateTime;

// Lazy-loaded to avoid issues during testing
let _defaultCalendarClient: any = null;

export const getDefaultCalendarClient = () => {
  if (!_defaultCalendarClient) {
    const client = getDefaultOAuth2Client();
    _defaultCalendarClient = client
      ? google.calendar({ version: "v3", auth: client })
      : null;
  }
  return _defaultCalendarClient;
};

export const formatResponse = (response: any) => ({
  content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
});

export const handleTool = async (
  queryConfig: Record<string, any> | undefined,
  apiCall: (calendar: calendar_v3.Calendar) => Promise<any>
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

    const calendarClient = queryConfig
      ? google.calendar({ version: "v3", auth: oauth2Client })
      : getDefaultCalendarClient();
    if (!calendarClient)
      throw new Error(
        "Calendar client could not be created, please check your credentials"
      );

    const result = await apiCall(calendarClient);
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

export const formatDate = (dateString: string): string => {
  // Handle relative dates
  const today = new Date();
  const now = new Date();

  switch (dateString.toLowerCase()) {
    case "today":
      return today.toISOString().split("T")[0];
    case "tomorrow":
      today.setDate(today.getDate() + 1);
      return today.toISOString().split("T")[0];
    case "yesterday":
      today.setDate(today.getDate() - 1);
      return today.toISOString().split("T")[0];
    default:
      // Try to parse as ISO date or other formats
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        // If parsing fails, return the original string
        return dateString;
      }
      return date.toISOString().split("T")[0];
  }
};

export const parseDateTime = (dateTimeString: string): string => {
  // Handle natural language dates
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // Handle relative times
  if (dateTimeString.toLowerCase().includes("today")) {
    const timeMatch = dateTimeString.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      const minute = parseInt(timeMatch[2]);
      const ampm = timeMatch[3]?.toLowerCase();

      if (ampm === "pm" && hour !== 12) hour += 12;
      if (ampm === "am" && hour === 12) hour = 0;

      const date = new Date(today);
      date.setHours(hour, minute, 0, 0);
      return date.toISOString();
    }
  }

  if (dateTimeString.toLowerCase().includes("tomorrow")) {
    const timeMatch = dateTimeString.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      const minute = parseInt(timeMatch[2]);
      const ampm = timeMatch[3]?.toLowerCase();

      if (ampm === "pm" && hour !== 12) hour += 12;
      if (ampm === "am" && hour === 12) hour = 0;

      const date = new Date(today);
      date.setDate(date.getDate() + 1);
      date.setHours(hour, minute, 0, 0);
      return date.toISOString();
    }
  }

  // Try to parse as ISO date or other standard formats
  const date = new Date(dateTimeString);
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }

  // If all else fails, return current time
  return new Date().toISOString();
};

export const formatEventDateTime = (
  dateTime: EventDateTime | null | undefined
): string => {
  if (!dateTime) return "";
  return dateTime.dateTime || dateTime.date || "";
};

export const createEventDateTime = (dateTimeString: string): EventDateTime => {
  const isoString = parseDateTime(dateTimeString);
  return {
    dateTime: isoString,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
};
