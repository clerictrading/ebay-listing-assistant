// src/worker.ts
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { eBayService } from './ebay';
import fs from 'fs';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Strict JSON Schema for Gemini
const listingSchema = {
  description: "Trading card and collectible listing data",
  type: SchemaType.OBJECT,
  properties: {
    pricing_analysis: {
      type: SchemaType.OBJECT,
      properties: {
        market_value: { type: SchemaType.NUMBER },
        sold_range: { type: SchemaType.STRING },
        suggested_bin: { type: SchemaType.NUMBER },
        min_offer: { type: SchemaType.NUMBER },
        auction_recommended: { type: SchemaType.BOOLEAN },
        notes: { type: SchemaType.STRING }
      },
      required: ['market_value', 'sold_range', 'suggested_bin', 'min_offer', 'auction_recommended', 'notes']
    },
    seo_title: { type: SchemaType.STRING },
    ebay_category_id: { type: SchemaType.STRING },
    item_specifics: {
      type: SchemaType.OBJECT,
      properties: {
        card_name: { type: SchemaType.STRING },
        set_name: { type: SchemaType.STRING },
        card_number: { type: SchemaType.STRING }
      },
      required: ['card_name', 'set_name']
    },
    condition_summary: { type: SchemaType.STRING },
    description_body: { type: SchemaType.STRING },
    shipping_recommendation: { type: SchemaType.STRING },
    search_keywords: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    photo_defect_log: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
  },
  required: ['pricing_analysis', 'seo_title', 'ebay_category_id', 'item_specifics', 'condition_summary', 'description_body', 'shipping_recommendation', 'search_keywords', 'photo_defect_log']
};

export async function startWorker() {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: process.env.BOT_EMAIL_USER!, pass: process.env.BOT_EMAIL_SECRET! }
  });

  await client.connect();
  let lock = await client.getMailboxLock('INBOX');

  try {
    for await (const message of client.list({ seen: false })) {
      const parsed = await simpleParser(await client.download(message.uid));
      
      // Filter by sender
      if (parsed.from?.value[0].address !== 'ccleric7@gmail.com') continue;

      const images = parsed.attachments
        .filter(att => att.contentType.startsWith('image/'))
        .map(att => ({
          inlineData: { data: att.content.toString('base64'), mimeType: att.contentType }
        }));

      if (images.length > 0) {
        console.log(`Processing ${images.length} images for new listing...`);
        const result = await processWithAI(images);
        const sku = `CLERIC-${Date.now()}`;
        
        // Backup locally
        fs.writeFileSync(`./storage/${sku}.json`, JSON.stringify(result, null, 2));

        // eBay Staging
        await eBayService.stageListing(sku, result);
        
        // Mark as read
        await client.messageFlagsAdd(message.uid, ['\\Seen']);
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }
}

async function processWithAI(imageParts: any[]) {
  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    generationConfig: { 
        responseMimeType: "application/json", 
        responseSchema: listingSchema,
        temperature: 0.1 
    }
  });

  const prompt = `You are the Cleric Trading Outpost eBay Listing Assistant... [System Prompt Provided in Requirements]`;
  const result = await model.generateContent([prompt, ...imageParts]);
  return JSON.parse(result.response.text());
}