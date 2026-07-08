// src/ebay.ts
import eBayApi from 'ebay-api';

const ebay = new eBayApi({
  appId: process.env.EBAY_CLIENT_ID!,
  certId: process.env.EBAY_CLIENT_SECRET!,
  devId: '',
  sandbox: false,
});

ebay.setToken(process.env.EBAY_USER_REFRESH_TOKEN!);

export const eBayService = {
  async stageListing(sku: string, data: any) {
    // 1. Create/Replace Inventory Item
    await ebay.inventory.createOrReplaceInventoryItem(sku, {
      availability: { shipToLocationAvailability: { quantity: 1 } },
      condition: 'USED',
      conditionDescription: data.condition_summary,
      product: {
        title: data.seo_title,
        description: data.description_body,
        aspects: {
          'Card Name': [data.item_specifics.card_name],
          'Set': [data.item_specifics.set_name],
          'Card Number': [data.item_specifics.card_number || 'N/A']
        },
        categoryIds: [data.ebay_category_id],
        imageUrls: [] // In production, upload buffers to eBay EPS first
      }
    });

    // 2. Create Offer (Draft State)
    return await ebay.inventory.createOffer({
      sku,
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      availableQuantity: 1,
      categoryId: data.ebay_category_id,
      listingDescription: data.description_body,
      pricingSummary: {
        price: { value: data.pricing_analysis.suggested_bin.toString(), currency: 'USD' },
        minimumAdvertisedPrice: { value: data.pricing_analysis.min_offer.toString(), currency: 'USD' }
      },
      listingPolicies: {
        fulfillmentPolicyId: process.env.EBAY_FULFILLMENT_POLICY_ID!,
        returnPolicyId: process.env.EBAY_RETURN_POLICY_ID!,
        paymentPolicyId: process.env.EBAY_PAYMENT_POLICY_ID!
      }
    });
  }
};