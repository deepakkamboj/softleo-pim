import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { calendar_v3 } from "googleapis";
import {
  handleTool,
  formatResponse,
  formatDate,
  parseDateTime,
  createEventDateTime,
  Calendar,
  CalendarEvent,
} from "../modules/google-calendar.js";

export function registerGoogleCalendarTools(
  server: McpServer,
  config?: Record<string, any>
) {
  server.tool(
    "calendar_get_events",
    "Get calendar events within a specified time range",
    {
      startDate: z
        .string()
        .describe(
          "Start date in ISO format (YYYY-MM-DD) or relative format like 'today', 'tomorrow'"
        ),
      endDate: z
        .string()
        .optional()
        .describe(
          "End date in ISO format (YYYY-MM-DD) or relative format like 'today', 'tomorrow'"
        ),
      calendarId: z
        .string()
        .optional()
        .describe(
          "ID of the calendar to fetch events from (defaults to primary calendar)"
        ),
      maxResults: z
        .number()
        .optional()
        .describe("Maximum number of events to return (default: 10)"),
    },
    async (params) => {
      return handleTool(config, async (calendar: calendar_v3.Calendar) => {
        const {
          startDate,
          endDate,
          calendarId = "primary",
          maxResults = 10,
        } = params;

        // Format dates
        const timeMin = new Date(formatDate(startDate)).toISOString();
        const timeMax = endDate
          ? new Date(formatDate(endDate)).toISOString()
          : undefined;

        const { data } = await calendar.events.list({
          calendarId,
          timeMin,
          timeMax,
          maxResults,
          singleEvents: true,
          orderBy: "startTime",
        });

        const events =
          data.items?.map((event: any) => ({
            id: event.id,
            summary: event.summary || "No title",
            description: event.description || "",
            location: event.location || "",
            start: event.start?.dateTime || event.start?.date,
            end: event.end?.dateTime || event.end?.date,
            attendees: event.attendees?.map((a: any) => a.email) || [],
            link: event.htmlLink,
            created: event.created,
            updated: event.updated,
            status: event.status,
          })) || [];

        return formatResponse({ events, count: events.length });
      });
    }
  );

  server.tool(
    "calendar_create_event",
    "Create a new calendar event",
    {
      summary: z.string().describe("Title/summary of the event"),
      startDateTime: z
        .string()
        .describe("Start date and time in ISO format or natural language"),
      endDateTime: z
        .string()
        .optional()
        .describe("End date and time in ISO format or natural language"),
      description: z.string().optional().describe("Description of the event"),
      location: z.string().optional().describe("Location of the event"),
      attendees: z
        .array(z.string())
        .optional()
        .describe("List of email addresses of attendees"),
      calendarId: z
        .string()
        .optional()
        .describe(
          "ID of the calendar to create the event in (defaults to primary calendar)"
        ),
    },
    async (params) => {
      return handleTool(config, async (calendar: calendar_v3.Calendar) => {
        const {
          summary,
          startDateTime,
          endDateTime,
          description,
          location,
          attendees,
          calendarId = "primary",
        } = params;

        // Parse start and end times
        const startTime = parseDateTime(startDateTime);
        const endTime = endDateTime
          ? parseDateTime(endDateTime)
          : new Date(new Date(startTime).getTime() + 3600000).toISOString(); // Default to 1 hour later

        const event: any = {
          summary,
          description: description || "",
          location: location || "",
          start: {
            dateTime: startTime,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          end: {
            dateTime: endTime,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        };

        // Add attendees if provided
        if (attendees && attendees.length > 0) {
          event.attendees = attendees.map((email: string) => ({ email }));
        }

        const { data } = await calendar.events.insert({
          calendarId,
          requestBody: event,
          sendUpdates: "all",
        });

        const createdEvent = {
          id: data.id,
          summary: data.summary,
          description: data.description,
          location: data.location,
          start: data.start?.dateTime,
          end: data.end?.dateTime,
          attendees: data.attendees?.map((a: any) => a.email) || [],
          link: data.htmlLink,
        };

        return formatResponse(createdEvent);
      });
    }
  );

  server.tool(
    "calendar_update_event",
    "Update an existing calendar event",
    {
      eventId: z.string().describe("ID of the event to update"),
      summary: z.string().optional().describe("New title/summary of the event"),
      startDateTime: z
        .string()
        .optional()
        .describe("New start date and time in ISO format or natural language"),
      endDateTime: z
        .string()
        .optional()
        .describe("New end date and time in ISO format or natural language"),
      description: z
        .string()
        .optional()
        .describe("New description of the event"),
      location: z.string().optional().describe("New location of the event"),
      attendees: z
        .array(z.string())
        .optional()
        .describe("New list of email addresses of attendees"),
      calendarId: z
        .string()
        .optional()
        .describe(
          "ID of the calendar containing the event (defaults to primary calendar)"
        ),
    },
    async (params) => {
      return handleTool(config, async (calendar: calendar_v3.Calendar) => {
        const { eventId, calendarId = "primary", ...updates } = params;

        // Get existing event
        const { data: existingEvent } = await calendar.events.get({
          calendarId,
          eventId,
        });

        // Prepare updates
        const updatedEvent = { ...existingEvent };

        if (updates.summary) updatedEvent.summary = updates.summary;
        if (updates.description !== undefined)
          updatedEvent.description = updates.description;
        if (updates.location !== undefined)
          updatedEvent.location = updates.location;

        if (updates.startDateTime) {
          updatedEvent.start = {
            dateTime: parseDateTime(updates.startDateTime),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          };
        }

        if (updates.endDateTime) {
          updatedEvent.end = {
            dateTime: parseDateTime(updates.endDateTime),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          };
        }

        if (updates.attendees) {
          updatedEvent.attendees = updates.attendees.map((email: string) => ({
            email,
          }));
        }

        const { data } = await calendar.events.update({
          calendarId,
          eventId,
          requestBody: updatedEvent,
          sendUpdates: "all",
        });

        const updated = {
          id: data.id,
          summary: data.summary,
          description: data.description,
          location: data.location,
          start: data.start?.dateTime,
          end: data.end?.dateTime,
          attendees: data.attendees?.map((a: any) => a.email) || [],
          link: data.htmlLink,
        };

        return formatResponse(updated);
      });
    }
  );

  server.tool(
    "calendar_delete_event",
    "Delete a calendar event",
    {
      eventId: z.string().describe("ID of the event to delete"),
      calendarId: z
        .string()
        .optional()
        .describe(
          "ID of the calendar containing the event (defaults to primary calendar)"
        ),
    },
    async (params) => {
      return handleTool(config, async (calendar: calendar_v3.Calendar) => {
        const { eventId, calendarId = "primary" } = params;

        await calendar.events.delete({
          calendarId,
          eventId,
          sendUpdates: "all",
        });

        return formatResponse({
          success: true,
          message: `Event ${eventId} deleted successfully`,
        });
      });
    }
  );

  server.tool(
    "calendar_list_calendars",
    "List available calendars",
    {},
    async () => {
      return handleTool(config, async (calendar: calendar_v3.Calendar) => {
        const { data } = await calendar.calendarList.list();

        const calendars =
          data.items?.map((cal: any) => ({
            id: cal.id,
            summary: cal.summary,
            description: cal.description || "",
            primary: cal.primary || false,
            accessRole: cal.accessRole,
            timeZone: cal.timeZone,
          })) || [];

        return formatResponse({ calendars, count: calendars.length });
      });
    }
  );

  server.tool(
    "calendar_get_info",
    "Get details of a specific calendar",
    {
      calendarId: z
        .string()
        .optional()
        .describe(
          "ID of the calendar to get info for (defaults to primary calendar)"
        ),
    },
    async (params) => {
      return handleTool(config, async (calendar: calendar_v3.Calendar) => {
        const { calendarId = "primary" } = params;

        const { data } = await calendar.calendars.get({
          calendarId,
        });

        const calendarInfo = {
          id: data.id,
          summary: data.summary,
          description: data.description || "",
          timeZone: data.timeZone,
          location: data.location || "",
        };

        return formatResponse(calendarInfo);
      });
    }
  );
}
