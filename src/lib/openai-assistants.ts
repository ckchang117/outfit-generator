import OpenAI from "openai"
import { getSupabaseServer } from "./supabase/server-client"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

// Assistant IDs - these should be stored in env vars after creation
const CATALOG_ASSISTANT_ID = process.env.OPENAI_CATALOG_ASSISTANT_ID
const STYLIST_ASSISTANT_ID = process.env.OPENAI_STYLIST_ASSISTANT_ID

export type CatalogAnalysis = {
  description: string
  category: string
  subcategory: string
  colors: string[]
  primaryColor: string
  pattern?: string
  material?: string[]
  season: string[]
  formality: string
  styleTags: string[]
  brand?: string
  fit?: string
  aiAttributes: Record<string, any>
}

export type OutfitSuggestion = {
  itemIds: string[]
  rationale: string
  score: number
  occasion?: string
  alternates?: Array<{
    itemIds: string[]
    rationale: string
    score: number
  }>
}

// Initialize assistants if they don't exist
export async function initializeAssistants() {
  if (!CATALOG_ASSISTANT_ID) {
    const catalogAssistant = await openai.beta.assistants.create({
      name: "Fashion Catalog Analyst",
      description: "Analyzes clothing items from photos and extracts structured metadata",
      model: "gpt-4o",
      instructions: `You are a fashion expert who analyzes clothing items from photos. 
      Extract detailed information about each item including:
      - Accurate color detection (be specific: "navy blue" not just "blue")
      - Category classification (top, bottom, outerwear, dress, shoes, accessory, etc.)
      - Subcategory (t-shirt, jeans, blazer, etc.)
      - Material detection when visible
      - Season appropriateness
      - Formality level (casual, smart-casual, business, formal, etc.)
      - Style characteristics and tags
      - Pattern detection (solid, striped, plaid, floral, etc.)
      - Brand identification if visible
      - Fit assessment when possible
      
      Always return a JSON object with the exact schema provided.`,
      tools: [{ type: "file_search" }],
      response_format: { type: "json_object" },
    })
    console.log("Created Catalog Assistant:", catalogAssistant.id)
    console.log("Add to .env.local: OPENAI_CATALOG_ASSISTANT_ID=" + catalogAssistant.id)
  }

  if (!STYLIST_ASSISTANT_ID) {
    const stylistAssistant = await openai.beta.assistants.create({
      name: "Personal Fashion Stylist",
      description: "Creates outfit combinations based on user preferences and closet inventory",
      model: "gpt-4o",
      instructions: `You are a personal fashion stylist who creates outfit combinations.
      Consider:
      - Color coordination and complementary palettes
      - Season and weather appropriateness
      - Occasion and formality matching
      - Style coherence and personal aesthetic
      - Practical layering and coverage
      - Accessory pairing when appropriate
      
      Rules:
      - Always ensure proper coverage (top + bottom or dress)
      - Match formality levels across pieces
      - Consider color harmony
      - Account for weather and season
      - Only use items from the provided closet
      - Provide clear reasoning for choices
      
      Return JSON with outfit suggestions including rationale and alternatives.`,
      tools: [{ type: "file_search" }],
      response_format: { type: "json_object" },
    })
    console.log("Created Stylist Assistant:", stylistAssistant.id)
    console.log("Add to .env.local: OPENAI_STYLIST_ASSISTANT_ID=" + stylistAssistant.id)
  }
}

// Get or create a thread for a user and assistant type
export async function getUserThread(userId: string, assistantType: 'catalog' | 'stylist'): Promise<string> {
  const sb = await getSupabaseServer()
  if (!sb) throw new Error("Supabase not configured")

  // Check for existing thread
  const { data: existing } = await sb
    .from("assistant_threads")
    .select("thread_id")
    .eq("user_id", userId)
    .eq("assistant_type", assistantType)
    .single()

  if (existing?.thread_id) {
    // Update last used timestamp
    await sb
      .from("assistant_threads")
      .update({ last_used_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("assistant_type", assistantType)
    
    return existing.thread_id
  }

  // Create new thread
  const thread = await openai.beta.threads.create()
  
  // Store thread reference
  await sb
    .from("assistant_threads")
    .insert({
      user_id: userId,
      thread_id: thread.id,
      assistant_type: assistantType,
    })

  return thread.id
}

// Analyze a clothing item using the catalog assistant
export async function analyzeClothingItem(
  itemId: string,
  userId: string,
  photoUrls: string[],
  itemName: string,
  itemNotes?: string
): Promise<CatalogAnalysis> {
  if (!CATALOG_ASSISTANT_ID) {
    throw new Error("Catalog assistant not configured")
  }

  const threadId = await getUserThread(userId, 'catalog')

  // Create message with images
  const content: any[] = [
    {
      type: "text",
      text: `Analyze this clothing item:
Name: ${itemName}
${itemNotes ? `Notes: ${itemNotes}` : ''}

Please provide a detailed analysis in JSON format with these fields:
{
  "description": "Detailed description of the item",
  "category": "top|bottom|outerwear|dress|shoes|accessory|underwear|swimwear|activewear|sleepwear|bag|jewelry|other",
  "subcategory": "Specific type (e.g., t-shirt, jeans, blazer)",
  "colors": ["Array of all colors present"],
  "primaryColor": "Main/dominant color",
  "pattern": "solid|striped|plaid|floral|geometric|abstract|other",
  "material": ["Detected or likely materials"],
  "season": ["spring", "summer", "fall", "winter", "all-season"],
  "formality": "casual|smart-casual|business|business-formal|formal|athleisure|loungewear",
  "styleTags": ["Style descriptors like minimalist, streetwear, vintage, etc."],
  "brand": "Brand if visible",
  "fit": "slim|regular|relaxed|oversized",
  "aiAttributes": { "Additional properties as key-value pairs" }
}`
    }
  ]

  // Add images
  for (const url of photoUrls.slice(0, 5)) { // Limit to 5 images
    content.push({
      type: "image_url",
      image_url: { url }
    })
  }

  await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content
  })

  // Run the assistant
  const run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: CATALOG_ASSISTANT_ID,
  })

  // Wait for completion
  let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id)
  while (runStatus.status !== 'completed' && runStatus.status !== 'failed') {
    await new Promise(resolve => setTimeout(resolve, 1000))
    runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id)
  }

  if (runStatus.status === 'failed') {
    throw new Error('Assistant run failed: ' + runStatus.last_error?.message)
  }

  // Get the response
  const messages = await openai.beta.threads.messages.list(threadId, {
    order: 'desc',
    limit: 1
  })

  const assistantMessage = messages.data[0]
  if (!assistantMessage || assistantMessage.role !== 'assistant') {
    throw new Error('No assistant response found')
  }

  const textContent = assistantMessage.content.find(c => c.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text content in response')
  }

  try {
    return JSON.parse(textContent.text.value)
  } catch (e) {
    console.error('Failed to parse assistant response:', textContent.text.value)
    throw new Error('Invalid JSON response from assistant')
  }
}

// Generate outfit suggestions using the stylist assistant
export async function generateOutfitSuggestions(
  userId: string,
  request: string,
  closetItems: Array<{
    id: string
    name: string
    category?: string
    subcategory?: string
    colors?: string[]
    season?: string[]
    formality?: string
    styleTags?: string[]
    description?: string
  }>,
  preferences?: {
    pieceCount?: number
    excludeCategories?: string[]
    weather?: string
    occasion?: string
  }
): Promise<OutfitSuggestion> {
  if (!STYLIST_ASSISTANT_ID) {
    throw new Error("Stylist assistant not configured")
  }

  const threadId = await getUserThread(userId, 'stylist')

  // Prepare closet summary
  const closetSummary = closetItems.map(item => ({
    id: item.id,
    n: item.name,
    c: item.category,
    sc: item.subcategory,
    col: item.colors,
    s: item.season,
    f: item.formality,
    t: item.styleTags,
  }))

  const message = `Create an outfit for: ${request}

Preferences:
- Piece count: ${preferences?.pieceCount || '3-5'}
- Occasion: ${preferences?.occasion || 'Not specified'}
- Weather: ${preferences?.weather || 'Not specified'}
${preferences?.excludeCategories ? `- Exclude: ${preferences.excludeCategories.join(', ')}` : ''}

Closet inventory:
${JSON.stringify(closetSummary, null, 2)}

Return JSON with this structure:
{
  "itemIds": ["Array of selected item IDs"],
  "rationale": "Explanation of why these items work together",
  "score": 0.0-1.0 confidence score,
  "occasion": "Detected or specified occasion",
  "alternates": [
    {
      "itemIds": ["Alternative combination"],
      "rationale": "Why this alternative works",
      "score": 0.0-1.0
    }
  ]
}`

  await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content: message
  })

  // Run the assistant
  const run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: STYLIST_ASSISTANT_ID,
  })

  // Wait for completion
  let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id)
  const startTime = Date.now()
  while (runStatus.status !== 'completed' && runStatus.status !== 'failed') {
    if (Date.now() - startTime > 30000) { // 30 second timeout
      throw new Error('Assistant timeout')
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
    runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id)
  }

  if (runStatus.status === 'failed') {
    throw new Error('Assistant run failed: ' + runStatus.last_error?.message)
  }

  // Get the response
  const messages = await openai.beta.threads.messages.list(threadId, {
    order: 'desc',
    limit: 1
  })

  const assistantMessage = messages.data[0]
  if (!assistantMessage || assistantMessage.role !== 'assistant') {
    throw new Error('No assistant response found')
  }

  const textContent = assistantMessage.content.find(c => c.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text content in response')
  }

  try {
    return JSON.parse(textContent.text.value)
  } catch (e) {
    console.error('Failed to parse assistant response:', textContent.text.value)
    throw new Error('Invalid JSON response from assistant')
  }
}
