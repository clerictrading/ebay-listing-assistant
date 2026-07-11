Here is the comprehensive project handoff summary for the Cleric Trading Outpost Appraisal & Listing Automation application.

This summary details the architecture, implemented features, recent technical resolutions, environment requirements, and outstanding technical debt to facilitate a seamless transition to your new development environment.
1. Original Goal, Intent, & Key Architectural Choices

The core intent of this application is to serve as an intelligent, high-fidelity card appraisal, cataloging, and eBay staging system for Cleric Trading Outpost—an elite, mid-premium vault dealing in vintage Pokémon, Magic: The Gathering, Yu-Gi-Oh!, graded slabs, and sports trading cards.
Key Architectural Choices:

    Multimodal Gemini Appraisal Core: Leverages the @google/genai SDK with multimodal inputs (images) and live search grounding. This allows the system to visually inspect cards for physical defects (whitening, scratches, print lines) while dynamically retrieving baseline pricing statistics directly from TCGPlayer and eBay Solds.

    Strict Ground-Truth Valuation Math: Rather than relying on direct LLM guesses, a deterministic pricing algorithm blends TCGPlayer Near-Mint market indices (applying strict condition multipliers: NM=100%, LP=85%, MP=70%, HP=50%, DMG=30%) with average eBay Sold averages at a 70% eBay / 30% TCGPlayer weight.

    Idempotent eBay Inventory Engine: Leverages the modern eBay Sell Inventory REST API (using SKU-based inventory locations, items, and offers) rather than legacy trading APIs. This ensures listing setups are self-correcting and highly structured.

    Asynchronous Dual-Track Processing: The system is split into two phases:

        High-Speed Extraction: Connecting, downloading, and flagging inbox emails inside IMAP quickly to prevent connections from stalling.

        Slow Appraisal Pipeline: Processing visual analysis, grounding-web-searches, and eBay REST staging sequentially outside of the active IMAP socket lock.

2. Fully Implemented & Working Features

    Multimodal Defect Inspection: Real-time identification of condition tiering, automatic aspect recognition (Card Name, Set, Number), and professional description construction based on a customized medieval/mountain-outpost brand layout.

    Automated IMAP Inbox Synchronizer: Connects securely to imap.gmail.com to crawl unread card submissions sent from ccleric7@gmail.com. It processes images, marks crawled emails read (\Seen) to prevent loops, and initiates appraisals automatically.

    Dynamic Background Cron Crawler: An admin-dashboard controlled background scheduler (setInterval interval) that can be adjusted on-the-fly or switched to manual trigger modes.

    On-the-Fly Prompt Tuner: A direct interface to adjust Gemini’s system instruction template, automatically filtering out legacy terms like "specimen" or "sovereign" to maintain brand compliance.

    Robust Cost and Token Tracker: Monitors daily input/output token usage and model billing metrics locally, persisting logs in real-time.

    Central DB Usage Logger: Backs up cost metrics asynchronously in the background to central servers (Firestore, Supabase, MongoDB, or custom HTTP REST endpoints) for centralized organization.

    Admin Audit Logging & Workspace Stats: A fully interactive terminal activity feed and code-volume metric checker estimating workspace characters, lines, and token sizes.

3. Known Bugs, Critical API Limitations, & Workarounds (Recently Resolved)

The integration with eBay's strict, localization-sensitive REST API required several targeted workarounds that are now fully integrated and must be kept in mind:

    Parent vs. Leaf Category Mappings: eBay rejects inventory items mapped to high-level parent categories (e.g., 1834 for CCGs or 18305 for Sports Cards). The engine now dynamically maps these to strict leaf categories (e.g., 183447 for CCG Singles, 183454 for CCG Sealed Packs, 261328 for Sports Card Singles).

    Booster Packs & Boxes Restrictions: Sealed CCG products in categories 183454 or 183456 must be listed as Brand New (conditionId: 1000) and cannot include standard card condition descriptors. Individual cards, however, must use conditionId: 3000 combined with ungraded condition descriptor maps (such as 40001 with value IDs like 400011 for Near Mint or 400012 for Excellent).

    Offer State Locks on Condition Change: If a card is re-appraised and its condition or category changes (e.g., LP to NM), eBay's API blocks the underlying inventory PUT update due to an active, locked offer. The code safely checks for active offers first, deletes the outdated offer (DELETE /sell/inventory/v1/offer/{offerId}), updates the inventory item, and recreates the offer.

    Localization Header Requirements: When communicating with eBay's Inventory endpoints (especially DELETE operations), the API yields localization errors if language preferences aren't explicit. The engine enforces the presence of both 'Content-Language': 'en-US' AND 'Accept-Language': 'en-US,en;q=0.9' across all requests.

    Condition ID Data Type Encodings: The eBay PUT request strictly requires conditionId as a string ("1000" or "3000") rather than a raw integer, which the server enforces automatically.

4. Manual Setup & Configuration Requirements

To run this application in your new environment, you must configure the following keys in your .env file (refer to .env.example in the root directory):
code Env

# Server Ingress Url (For public image resolution on eBay listings)
APP_URL=https://your-domain.com

# Core AI Credentials
GEMINI_API_KEY=your_gemini_api_key_here

# Inbox Synchronization Credentials
BOT_EMAIL_USER=your_gmail_address@gmail.com
BOT_EMAIL_SECRET=your_gmail_app_password_here # (Requires a secure Google App Password, not raw account password)

# eBay REST API Credentials
EBAY_CLIENT_ID=your_ebay_client_id
EBAY_CLIENT_SECRET=your_ebay_client_secret
EBAY_USER_REFRESH_TOKEN=your_ebay_user_delegated_refresh_token

# eBay Merchant/Listing Policies
EBAY_FULFILLMENT_POLICY_ID=your_fulfillment_policy_id
EBAY_RETURN_POLICY_ID=your_return_policy_id
EBAY_PAYMENT_POLICY_ID=your_payment_policy_id

5. Technical Debt & Areas to Revisit

If you are expanding or productionizing this application, please address the following shortcuts and architectural bottlenecks:

    Single-User Flat-File Database (/data/db.json): All state (appraisals, configuration, logs) is saved to a local JSON file. If your new environment auto-scales or runs in stateless/ephemeral containers (such as multiple Google Cloud Run instances), you will encounter database write desynchronization. You should migrate the core data layer to a cloud-native database.

    Synchronous Image File I/O: When emails are sync'd, the attachment buffers are written to the disk synchronously (fs.writeFileSync). Under heavy batches of incoming emails, this will block the Node event loop and degrade API responsiveness. Consider shifting image writing to asynchronous streams or offloading them directly to an Object Storage Bucket (like Google Cloud Storage or AWS S3).

    Ephemeral Polling Intervals: The background poller utilizes standard setInterval routines. If running in a serverless setup, background intervals are often suspended when requests complete, or they can trigger multiple redundant polling crawlers across server nodes. This background routine should be replaced with a robust event-driven webhook or an external cron scheduler (such as Cloud Scheduler) hitting an /api/sync route.

    Heuristic Token Estimation: The workspace analysis tool estimates code token counts using a general character_count / 4 rule of thumb. While suitable for quick metrics, it does not represent actual Gemini tokenizer statistics and should be swapped with a native token encoder if precision billing analytics are required.