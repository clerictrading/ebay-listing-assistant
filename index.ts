import { GoogleGenAI } from '@google/genai';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import eBayApi from 'ebay-api';
import FormData from 'form-data';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

// ==========================================
// 1. TYPED STRUCTURE FOR DETERMINISTIC OUTPUT
// ==========================================
const EbayListingSchema = {
  type: 'object',
  properties: {
    pricing_analysis: {
      type: 'object',
      properties: {
        market_value: { type: 'number' },
        sold_range: { type: 'string' },
        suggested_bin: { type: 'number' },
        min_offer: { type: 'number' },
        auction_recommended: { type: 'boolean' },
        notes: { type: 'string' }
      },
      required: ['market_value', 'sold_range', 'suggested_bin', 'min_offer', 'auction_recommended', 'notes']
    },
    seo_title: { type: 'string', description: 'Max 80 characters, front-loaded keywords' },
    subtitle: { type: 'string', nullable: true },
    ebay_category_id: { type: 'string', description: 'Standardized numeric leaf category ID' },
    item_specifics: {
      type: 'object',
      properties: {
        card_name: { type: 'string' },
        set_name: { type: 'string' },
        card_number: { type: 'string', nullable: true }
      },
      required: ['card_name', 'set_name']
    },
    condition_summary: { type: 'string' },
    description_body: { type: 'string' },
    shipping_recommendation: { type: 'string' },
    search_keywords: { type: 'array', items: { type: 'string' } },
    photo_defect_log: { type: 'array', items: { type: 'string' } }
  },
  required: [
    'pricing_analysis', 'seo_title', 'ebay_category_id', 'item_specifics', 
    'condition_summary', 'description_body', 'shipping_recommendation', 
    'search_keywords', 'photo_defect_log'
  ]
};

// ==========================================
// 2. EBAY API INTEGRATION WORKFLOW (STAGE DRAFT)
// ==========================================
interface ImageAttachment {
  buffer: Buffer;
  mimeType: string;
}

// Uploads each photo to eBay Picture Services (EPS) so the listing has
// publicly-hosted image URLs to reference — the Inventory API only
// accepts image URLs, not raw binary data, in the listing payload itself.
async function uploadImagesToEbay(ebay: eBayApi, images: ImageAttachment[]): Promise<string[]> {
  const imageUrls: string[] = [];

  for (const [index, image] of images.entries()) {
    const response = await ebay.trading.UploadSiteHostedPictures({
      ExtensionInDays: 30
    }, {
      hook: (xml: string) => {
        const form = new FormData();
        // XML control block must be the first part of the multipart body.
        form.append('XML Payload', xml, 'payload.xml');
        form.append('image', image.buffer, {
          filename: `photo-${index}.jpg`,
          contentType: image.mimeType
        });
        return { body: form, headers: form.getHeaders() };
      }
    });

    imageUrls.push(response.SiteHostedPictureDetails.FullURL);
  }

  return imageUrls;
}

async function stageEbayDraft(listingData: any, sku: string, images: ImageAttachment[]): Promise<void> {
  const ebay = new eBayApi({
    appId: process.env.EBAY_CLIENT_ID!,
    certId: process.env.EBAY_CLIENT_SECRET!,
    devId: process.env.EBAY_DEV_ID!,
    sandbox: false,
    marketplaceId: eBayApi.MarketplaceId.EBAY_US,
    scope: [
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.account'
    ]
  });

  ebay.OAuth2.setCredentials({
    refresh_token: process.env.EBAY_USER_REFRESH_TOKEN!
  });

  console.log(`[*] Syncing inventory profile to eBay repository for SKU: ${sku}...`);

  try {
    console.log(`[*] Uploading ${images.length} photo(s) to eBay Picture Services...`);
    const imageUrls = await uploadImagesToEbay(ebay, images);

    // Pipeline Component A: Register physical SKU metadata
    await ebay.sell.inventory.createOrReplaceInventoryItem({
      sku: sku,
      body: {
        availability: {
          shipToLocationAvailability: { quantity: 1 }
        },
        condition: 'USED',
        conditionDescription: listingData.condition_summary,
        product: {
          title: listingData.seo_title,
          description: listingData.description_body,
          imageUrls,
          categoryPolicies: { productIdentifierUnavailableText: 'Does Not Apply' },
          aspects: {
            'Card Name': [listingData.item_specifics.card_name],
            'Set': [listingData.item_specifics.set_name],
            'Features': ['Holofoil', 'Unlimited']
          }
        }
      }
    });

    // Pipeline Component B: Create marketplace offer context (Keeps it as a Draft)
    console.log(`[*] Injecting marketplace listing mechanics and policies...`);
    const offerResponse = await ebay.sell.inventory.createOffer({
      body: {
        sku: sku,
        marketplaceId: 'EBAY_US',
        format: 'FIXED_PRICE',
        availableQuantity: 1,
        categoryId: listingData.ebay_category_id,
        listingDescription: listingData.description_body,
        price: {
          value: listingData.pricing_analysis.suggested_bin.toString(),
          currency: 'USD'
        },
        listingPolicies: {
          fulfillmentPolicyId: process.env.EBAY_FULFILLMENT_POLICY_ID!,
          returnPolicyId: process.env.EBAY_RETURN_POLICY_ID!,
          paymentPolicyId: process.env.EBAY_PAYMENT_POLICY_ID!
        },
        pricingSummary: {
          minimumAdvertisedPrice: {
            value: listingData.pricing_analysis.min_offer.toString(),
            currency: 'USD'
          }
        }
      }
    });

    console.log(`\n[🎉] SUCCESS: Listing staged as a draft! Offer ID: ${offerResponse.offerId}`);
  } catch (err: any) {
    console.error('[-] eBay API Transaction Error:', err?.meta?.errors || err);
  }
}

// ==========================================
// 3. CORE AUTOMATION WORKFLOW ENGINE
// ==========================================
async function runClericAutomationPipeline() {
  console.log('[*] System waking up. Accessing IMAP server metrics...');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.BOT_EMAIL_USER!,
      pass: process.env.BOT_EMAIL_SECRET!,
    },
    logger: false
  });

  await client.connect();
  const lock = await client.getMailboxLock('Personal');

  try {
    const messages = await client.search({ seen: false, from: 'ccleric7@gmail.com' });

    if (messages.length === 0) {
      console.log('[+] Queue empty. No unread entries from target supplier found.');
      return;
    }

    // Capture the latest single unread package thread
    const targetMsgId = messages[messages.length - 1];
    const fetchedMessage = await client.fetchOne(targetMsgId, { source: true });
    const rawMessageSource = fetchedMessage.source;

    if (!rawMessageSource) {
      console.log('[-] Process halted: fetched message contains no source content.');
      return;
    }

    const parsedEmail = await simpleParser(
      typeof rawMessageSource === 'string'
        ? rawMessageSource
        : Buffer.from(rawMessageSource)
    );
    const imageParts: any[] = [];
    const imageAttachments: ImageAttachment[] = [];

    if (parsedEmail.attachments) {
      for (const attachment of parsedEmail.attachments) {
        if (attachment.contentType.startsWith('image/')) {
          imageParts.push({
            inlineData: {
              data: attachment.content.toString('base64'),
              mimeType: attachment.contentType,
            },
          });
          imageAttachments.push({
            buffer: attachment.content,
            mimeType: attachment.contentType,
          });
        }
      }
    }

    if (imageParts.length === 0) {
      console.log('[-] Process halted: Source package contains no image attachments.');
      return;
    }

    console.log(`[+] Download complete. ${imageParts.length} assets converted to memory arrays.`);
    console.log('[*] Dispatched to Gemini-2.5-Flash processing loop...');

    const promptText = `
      You are the Cleric Trading Outpost eBay Listing Assistant.
      Priorities: Accuracy, Honesty, SEO, Sales Conversion, Professionalism.
      Perform detailed damage assessment. Map categories exactly to eBay standard leaf IDs.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [promptText, ...imageParts],
      config: {
        responseMimeType: 'application/json',
        responseSchema: EbayListingSchema,
        temperature: 0.1,
      },
    });

    const structuredListing = JSON.parse(response.text!);
    
    // Output 1: Local Printable Inventory manifest configuration
    const generatedSku = `CLERIC-${Date.now()}`;
    console.log(`\n[*] Generation verified. Writing local system backup to manifest...`);
    fs.writeFileSync(`${generatedSku}-manifest.json`, JSON.stringify(structuredListing, null, 2));

    // Output 2: Export to active eBay dashboard draft status
    await stageEbayDraft(structuredListing, generatedSku, imageAttachments);

    await client.messageFlagsAdd(targetMsgId, ['\\Seen']);

  } catch (error) {
    console.error('[-] Critical Engine Exception:', error);
  } finally {
    lock.release();
    await client.logout();
    console.log('[*] Core application shutdown.');
  }
}

runClericAutomationPipeline();