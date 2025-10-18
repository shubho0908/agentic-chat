import { google } from 'googleapis';
import type { ToolHandlerContext } from '../types';
import type { CalendarListEventsArgs, CalendarCreateEventArgs, CalendarUpdateEventArgs, CalendarDeleteEventArgs } from '../types/handler-types';

export async function handleCalendarListEvents(
  context: ToolHandlerContext,
  args: CalendarListEventsArgs
): Promise<string> {
  const calendar = google.calendar({ version: 'v3', auth: context.oauth2Client });
  
  const response = await calendar.events.list({
    calendarId: args.calendarId || 'primary',
    timeMin: args.timeMin || new Date().toISOString(),
    timeMax: args.timeMax,
    maxResults: args.maxResults || 10,
    singleEvents: true,
    orderBy: 'startTime',
  });

  if (!response.data.items || response.data.items.length === 0) {
    return 'No upcoming events found.';
  }

  const formatted = response.data.items.map((event, idx) => 
    `${idx + 1}. **${event.summary}**
   Start: ${event.start?.dateTime || event.start?.date}
   End: ${event.end?.dateTime || event.end?.date}
   ${event.location ? `Location: ${event.location}` : ''}`
  );

  return `Found ${response.data.items.length} event(s):\n\n${formatted.join('\n\n')}`;
}

export async function handleCalendarCreateEvent(
  context: ToolHandlerContext,
  args: CalendarCreateEventArgs
): Promise<string> {
  const calendar = google.calendar({ version: 'v3', auth: context.oauth2Client });
  
  const startDate = new Date(args.startTime);
  if (isNaN(startDate.getTime())) {
    console.error('[Calendar Handler] Invalid startTime:', args.startTime);
    throw new Error(`Invalid startTime format: "${args.startTime}". Expected ISO 8601 format (e.g., "2025-01-20T10:00:00Z")`);
  }
  const endDate = new Date(args.endTime);
  if (isNaN(endDate.getTime())) {
    console.error('[Calendar Handler] Invalid endTime:', args.endTime);
    throw new Error(`Invalid endTime format: "${args.endTime}". Expected ISO 8601 format (e.g., "2025-01-20T11:00:00Z")`);
  }
  
  if (endDate.getTime() <= startDate.getTime()) {
    console.error('[Calendar Handler] endTime must be after startTime');
    throw new Error(`endTime (${args.endTime}) must be after startTime (${args.startTime})`);
  }
  
  const timeZone = args.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  const event: {
    summary: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
    description?: string;
    location?: string;
    attendees?: Array<{ email: string }>;
  } = {
    summary: args.summary,
    start: { dateTime: args.startTime, timeZone },
    end: { dateTime: args.endTime, timeZone },
  };

  if (args.description) {
    event.description = args.description;
  }
  if (args.location) {
    event.location = args.location;
  }
  if (args.attendees) {
    event.attendees = args.attendees.map(email => ({ email }));
  }

  const calendarId = args.calendarId || 'primary';
  try {
    const response = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });

    return `Event created successfully!
**Title:** ${args.summary}
**Start:** ${args.startTime}
**End:** ${args.endTime}
${args.attendees ? `**Attendees:** ${args.attendees.join(', ')}\n` : ''}**Link:** ${response.data.htmlLink}`;
  } catch (error) {
    console.error('[Calendar Handler] ✗ Failed to create event');
    console.error('[Calendar Handler] Error:', error);
    throw error;
  }
}

export async function handleCalendarUpdateEvent(
  context: ToolHandlerContext,
  args: CalendarUpdateEventArgs
): Promise<string> {
  const calendar = google.calendar({ version: 'v3', auth: context.oauth2Client });
  
  const calendarId = args.calendarId || 'primary';
  
  const event = await calendar.events.get({
    calendarId,
    eventId: args.eventId,
  });

  const timeZone = (event.data.start?.timeZone as string | undefined) || Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  const updatedEvent: {
    summary?: string;
    start?: { dateTime: string; timeZone: string };
    end?: { dateTime: string; timeZone: string };
    description?: string;
    location?: string;
    attendees?: Array<{ email: string }>;
  } = {};
  
  if (args.summary !== undefined) {
    updatedEvent.summary = args.summary;
  } else if (event.data.summary) {
    updatedEvent.summary = event.data.summary;
  }
  
  if (args.startTime !== undefined) {
    const startDate = new Date(args.startTime);
    if (isNaN(startDate.getTime())) {
      throw new Error(`Invalid startTime format: "${args.startTime}". Expected ISO 8601 format (e.g., "2025-01-20T10:00:00Z")`);
    }
    updatedEvent.start = { dateTime: args.startTime, timeZone };
  } else if (event.data.start?.dateTime) {
    updatedEvent.start = { dateTime: event.data.start.dateTime, timeZone };
  }
  
  if (args.endTime !== undefined) {
    const endDate = new Date(args.endTime);
    if (isNaN(endDate.getTime())) {
      throw new Error(`Invalid endTime format: "${args.endTime}". Expected ISO 8601 format (e.g., "2025-01-20T11:00:00Z")`);
    }
    updatedEvent.end = { dateTime: args.endTime, timeZone };
  } else if (event.data.end?.dateTime) {
    updatedEvent.end = { dateTime: event.data.end.dateTime, timeZone };
  }
  
  if (updatedEvent.start?.dateTime && updatedEvent.end?.dateTime) {
    const startTimestamp = new Date(updatedEvent.start.dateTime).getTime();
    const endTimestamp = new Date(updatedEvent.end.dateTime).getTime();
    if (endTimestamp <= startTimestamp) {
      throw new Error(`endTime must be after startTime`);
    }
  }
  
  if (args.description !== undefined) updatedEvent.description = args.description;
  if (args.location !== undefined) updatedEvent.location = args.location;
  
  if (event.data.attendees) {
    updatedEvent.attendees = event.data.attendees as Array<{ email: string }>;
  }

  const response = await calendar.events.update({
    calendarId,
    eventId: args.eventId,
    requestBody: updatedEvent,
  });

  return `Event updated successfully!
**Title:** ${response.data.summary}
**Link:** ${response.data.htmlLink}`;
}

export async function handleCalendarDeleteEvent(
  context: ToolHandlerContext,
  args: CalendarDeleteEventArgs
): Promise<string> {
  const calendar = google.calendar({ version: 'v3', auth: context.oauth2Client });
  
  await calendar.events.delete({
    calendarId: args.calendarId || 'primary',
    eventId: args.eventId,
  });

  return `Event deleted successfully!`;
}
