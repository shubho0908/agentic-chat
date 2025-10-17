import { google } from 'googleapis';
import type { ToolHandlerContext } from '../types';

export async function handleCalendarListEvents(
  context: ToolHandlerContext,
  args: { calendarId?: string; timeMin?: string; timeMax?: string; maxResults?: number }
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
  args: {
    summary: string;
    startTime: string;
    endTime: string;
    description?: string;
    location?: string;
    attendees?: string[];
    timeZone?: string;
  }
): Promise<string> {
  const calendar = google.calendar({ version: 'v3', auth: context.oauth2Client });
  
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

  if (args.description) event.description = args.description;
  if (args.location) event.location = args.location;
  if (args.attendees) {
    event.attendees = args.attendees.map(email => ({ email }));
  }

  const response = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: event,
  });

  return `Event created successfully!
**Title:** ${args.summary}
**Start:** ${args.startTime}
**Link:** ${response.data.htmlLink}`;
}

export async function handleCalendarUpdateEvent(
  context: ToolHandlerContext,
  args: {
    eventId: string;
    summary?: string;
    startTime?: string;
    endTime?: string;
    description?: string;
    location?: string;
  }
): Promise<string> {
  const calendar = google.calendar({ version: 'v3', auth: context.oauth2Client });
  
  const event = await calendar.events.get({
    calendarId: 'primary',
    eventId: args.eventId,
  });

  const updatedEvent: Record<string, unknown> = { ...event.data };

  const timeZone = (event.data.start?.timeZone as string | undefined) || Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  if (args.summary) updatedEvent.summary = args.summary;
  if (args.startTime) updatedEvent.start = { dateTime: args.startTime, timeZone };
  if (args.endTime) updatedEvent.end = { dateTime: args.endTime, timeZone };
  if (args.description !== undefined) updatedEvent.description = args.description;
  if (args.location !== undefined) updatedEvent.location = args.location;

  const response = await calendar.events.update({
    calendarId: 'primary',
    eventId: args.eventId,
    requestBody: updatedEvent,
  });

  return `Event updated successfully!
**Title:** ${response.data.summary}
**Link:** ${response.data.htmlLink}`;
}

export async function handleCalendarDeleteEvent(
  context: ToolHandlerContext,
  args: { eventId: string; calendarId?: string }
): Promise<string> {
  const calendar = google.calendar({ version: 'v3', auth: context.oauth2Client });
  
  await calendar.events.delete({
    calendarId: args.calendarId || 'primary',
    eventId: args.eventId,
  });

  return `Event deleted successfully!`;
}
