import { google } from 'googleapis';
import type { ToolHandlerContext } from '../types';
import type { SheetsCreateArgs, SheetsReadArgs, SheetsWriteArgs, SheetsAppendArgs, SheetsClearArgs } from '../types/handler-types';

export async function handleSheetsCreate(
  context: ToolHandlerContext,
  args: SheetsCreateArgs
): Promise<string> {
  const sheets = google.sheets({ version: 'v4', auth: context.oauth2Client });
  
  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: args.title },
    },
  });

  return `Spreadsheet created successfully!
**Title:** ${args.title}
**Spreadsheet ID:** ${response.data.spreadsheetId}
**Link:** ${response.data.spreadsheetUrl}`;
}

export async function handleSheetsRead(
  context: ToolHandlerContext,
  args: SheetsReadArgs
): Promise<string> {
  const sheets = google.sheets({ version: 'v4', auth: context.oauth2Client });
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: args.spreadsheetId,
    range: args.range,
  });

  if (!response.data.values || response.data.values.length === 0) {
    return 'No data found in the specified range.';
  }

  const formatted = response.data.values.map(row => row.join(' | ')).join('\n');
  return `**Range:** ${args.range}\n\n${formatted}`;
}

export async function handleSheetsWrite(
  context: ToolHandlerContext,
  args: SheetsWriteArgs
): Promise<string> {
  const sheets = google.sheets({ version: 'v4', auth: context.oauth2Client });
  
  await sheets.spreadsheets.values.update({
    spreadsheetId: args.spreadsheetId,
    range: args.range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: args.values },
  });

  return `Data written successfully to range: ${args.range}`;
}

export async function handleSheetsAppend(
  context: ToolHandlerContext,
  args: SheetsAppendArgs
): Promise<string> {
  const sheets = google.sheets({ version: 'v4', auth: context.oauth2Client });
  
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: args.spreadsheetId,
    range: args.range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: args.values },
  });

  return `Appended ${args.values.length} row(s) successfully!
**Range updated:** ${response.data.updates?.updatedRange}`;
}

export async function handleSheetsClear(
  context: ToolHandlerContext,
  args: SheetsClearArgs
): Promise<string> {
  const sheets = google.sheets({ version: 'v4', auth: context.oauth2Client });
  
  await sheets.spreadsheets.values.clear({
    spreadsheetId: args.spreadsheetId,
    range: args.range,
  });

  return `Successfully cleared range: ${args.range}`;
}
