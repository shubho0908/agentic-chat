import { google } from 'googleapis';
import type { ToolHandlerContext } from '../types';

export async function handleSlidesCreate(
  context: ToolHandlerContext,
  args: { title: string }
): Promise<string> {
  const slides = google.slides({ version: 'v1', auth: context.oauth2Client });
  
  const response = await slides.presentations.create({
    requestBody: {
      title: args.title,
    },
  });

  return `Presentation created successfully!
**Title:** ${args.title}
**Presentation ID:** ${response.data.presentationId}
**Link:** https://docs.google.com/presentation/d/${response.data.presentationId}`;
}

export async function handleSlidesRead(
  context: ToolHandlerContext,
  args: { presentationId: string }
): Promise<string> {
  const slides = google.slides({ version: 'v1', auth: context.oauth2Client });
  
  const response = await slides.presentations.get({
    presentationId: args.presentationId,
  });

  const slideCount = response.data.slides?.length || 0;
  const title = response.data.title || 'Untitled';

  let output = `**Presentation:** ${title}\n**Slides:** ${slideCount}\n\n`;

  if (response.data.slides) {
    response.data.slides.forEach((slide, idx) => {
      output += `**Slide ${idx + 1}** (ID: ${slide.objectId})\n`;
      
      const pageElements = slide.pageElements || [];
      const textElements = pageElements.filter(el => el.shape?.text);
      
      if (textElements.length > 0) {
        textElements.forEach(el => {
          const text = el.shape?.text?.textElements
            ?.map(te => te.textRun?.content)
            .filter(Boolean)
            .join('');
          if (text) output += `  - ${text.trim()}\n`;
        });
      }
      
      output += '\n';
    });
  }

  return output;
}

export async function handleSlidesAddSlide(
  context: ToolHandlerContext,
  args: { presentationId: string; title?: string; body?: string }
): Promise<string> {
  const slides = google.slides({ version: 'v1', auth: context.oauth2Client });
  
  const presentation = await slides.presentations.get({
    presentationId: args.presentationId,
  });

  const slideId = `slide_${Date.now()}`;
  const titleBoxId = `titleBox_${Date.now()}`;
  const bodyBoxId = `bodyBox_${Date.now()}`;

  const requests: Array<{
    createSlide?: unknown;
    createShape?: unknown;
    insertText?: unknown;
  }> = [
    {
      createSlide: {
        objectId: slideId,
        insertionIndex: presentation.data.slides?.length || 0,
        slideLayoutReference: {
          predefinedLayout: 'TITLE_AND_BODY',
        },
      },
    },
  ];

  if (args.title) {
    requests.push({
      createShape: {
        objectId: titleBoxId,
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: slideId,
          size: {
            width: { magnitude: 600, unit: 'PT' },
            height: { magnitude: 50, unit: 'PT' },
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: 50,
            translateY: 50,
            unit: 'PT',
          },
        },
      },
    });

    requests.push({
      insertText: {
        objectId: titleBoxId,
        text: args.title,
      },
    });
  }

  if (args.body) {
    requests.push({
      createShape: {
        objectId: bodyBoxId,
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: slideId,
          size: {
            width: { magnitude: 600, unit: 'PT' },
            height: { magnitude: 300, unit: 'PT' },
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: 50,
            translateY: 150,
            unit: 'PT',
          },
        },
      },
    });

    requests.push({
      insertText: {
        objectId: bodyBoxId,
        text: args.body,
      },
    });
  }

  await slides.presentations.batchUpdate({
    presentationId: args.presentationId,
    requestBody: { requests: requests as never[] },
  });

  return `Slide added successfully!
${args.title ? `**Title:** ${args.title}\n` : ''}**Slide ID:** ${slideId}`;
}
