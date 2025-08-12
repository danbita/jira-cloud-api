import OpenAI from 'openai';
import { OPENAI_API_KEY } from './config';

export interface ExtractedParameter {
  value: string | null;
  confidence: number;
  source: 'ai_extracted' | 'user_confirmed' | 'follow_up_question' | 'default';
}

export interface ExtractedParameters {
  title: ExtractedParameter;
  type: ExtractedParameter;
  project: ExtractedParameter;
  priority: ExtractedParameter;
  description: ExtractedParameter;
}

export class AIParameterExtractor {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  }

  async extractParameters(userInput: string): Promise<ExtractedParameters> {
    try {
      console.log('🤖 Analyzing user input with AI...');
      
      // Pre-process input to help AI better identify project location
      const preprocessedInput = this.preprocessProjectMentions(userInput);
      
      const extractionPrompt = this.buildExtractionPrompt(preprocessedInput);
      
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',  // Change to 'gpt-5' if you upgraded
        messages: [
          {
            role: 'system',
            content: 'You are an expert at extracting structured data from natural language requests for Jira issue creation. Pay special attention to Title: and Description: patterns. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: extractionPrompt
          }
        ],
        max_tokens: 800,
        temperature: 0.1, // Low temperature for consistent extraction
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from AI extraction');
      }

      console.log('📋 AI extraction response:', response);
      
      const extracted = this.parseAIResponse(response);
      
      // NEW: If AI failed to extract title or description, try fallback
      if ((!extracted.title.value || !extracted.description.value) && 
          (userInput.includes('Title:') || userInput.includes('Description:'))) {
        console.log('🔄 AI extraction incomplete, trying fallback...');
        const fallback = this.fallbackExtraction(userInput);
        
        // Use fallback values if AI didn't extract them
        if (!extracted.title.value && fallback.title.value) {
          extracted.title = fallback.title;
        }
        if (!extracted.description.value && fallback.description.value) {
          extracted.description = fallback.description;
        }
      }
      
      // Apply defaults for missing parameters
      const extractedWithDefaults = this.applyDefaults(extracted);
      
      this.logExtractionResults(extractedWithDefaults);
      
      return extractedWithDefaults;

    } catch (error) {
      console.error('❌ AI extraction failed:', error);
      
      // NEW: If AI completely fails, try fallback extraction
      console.log('🔄 AI failed completely, trying fallback extraction...');
      const fallback = this.fallbackExtraction(userInput);
      const fallbackWithDefaults = this.applyDefaults(fallback);
      
      if (fallbackWithDefaults.title.value || fallbackWithDefaults.description.value) {
        console.log('✅ Fallback extraction successful');
        return fallbackWithDefaults;
      }
      
      return this.createDefaultExtraction();
    }
  }

  // NEW: Fallback extraction using regex patterns when AI fails
  private fallbackExtraction(userInput: string): ExtractedParameters {
    const result = this.createEmptyExtraction();
    
    // Extract title using multiple patterns
    const titlePatterns = [
      /Title:\s*['"]([^'"]+)['"]/i,  // Title: 'text' or Title: "text"
      /Title:\s*([^,\n]+?)(?=\s+(?:Issue Description|Description|$))/i  // Title: text (without quotes)
    ];
    
    for (const pattern of titlePatterns) {
      const match = userInput.match(pattern);
      if (match && match[1].trim()) {
        result.title = {
          value: match[1].trim(),
          confidence: 0.9,
          source: 'ai_extracted'
        };
        console.log(`📝 Fallback extracted title: "${result.title.value}"`);
        break;
      }
    }
    
    // Extract description using multiple patterns
    const descriptionPatterns = [
      /Issue Description:\s*['"]([^'"]+)['"]/i,  // Issue Description: 'text'
      /Description:\s*['"]([^'"]+)['"]/i,        // Description: 'text'
      /Issue Description:\s*([^,\n]+?)$/i,       // Issue Description: text (to end)
      /Description:\s*([^,\n]+?)$/i              // Description: text (to end)
    ];
    
    for (const pattern of descriptionPatterns) {
      const match = userInput.match(pattern);
      if (match && match[1].trim()) {
        result.description = {
          value: match[1].trim(),
          confidence: 0.9,
          source: 'ai_extracted'
        };
        console.log(`📄 Fallback extracted description: "${result.description.value}"`);
        break;
      }
    }
    
    return result;
  }

  // UPDATED: Enhanced preprocessing for title/description patterns
  private preprocessProjectMentions(userInput: string): string {
    let processed = userInput;
    
    // First, enhance title/description patterns for better AI recognition
    processed = processed.replace(/Title:\s*['"]([^'"]+)['"]/, 'TITLE_FIELD: "$1"');
    processed = processed.replace(/Issue Description:\s*['"]([^'"]+)['"]/, 'DESCRIPTION_FIELD: "$1"');
    processed = processed.replace(/Description:\s*['"]([^'"]+)['"]/, 'DESCRIPTION_FIELD: "$1"');
    
    // Handle cases without quotes
    processed = processed.replace(/Title:\s*([^,]+?)(?=\s+(?:Issue Description|Description|$))/i, 'TITLE_FIELD: "$1"');
    processed = processed.replace(/Issue Description:\s*([^,]+?)$/i, 'DESCRIPTION_FIELD: "$1"');
    
    // Add explicit markers around project mentions to help AI identify them
    const projectPatterns = [
      { pattern: /\bin\s+(fv\s+demo\s+product)\b/gi, replacement: 'in [PROJECT:FV Demo Product]' },
      { pattern: /\bin\s+(demo\s+product)\b/gi, replacement: 'in [PROJECT:FV Demo Product]' },
      { pattern: /\bin\s+(fv\s+product)\b/gi, replacement: 'in [PROJECT:FV Product]' },
      { pattern: /\bin\s+(fv\s+engineering)\b/gi, replacement: 'in [PROJECT:FV Engineering]' },
      { pattern: /\bin\s+(engineering)\b/gi, replacement: 'in [PROJECT:FV Engineering]' },
      { pattern: /\bin\s+(fv\s+demo\s+issues)\b/gi, replacement: 'in [PROJECT:FV Demo Issues]' },
      { pattern: /\bin\s+(demo\s+issues)\b/gi, replacement: 'in [PROJECT:FV Demo Issues]' },
      { pattern: /\bin\s+(demo)\b/gi, replacement: 'in [PROJECT:FV Demo Issues]' },
      
      // Handle "for" and "to" patterns as well
      { pattern: /\bfor\s+(fv\s+demo\s+product)\b/gi, replacement: 'for [PROJECT:FV Demo Product]' },
      { pattern: /\bfor\s+(demo\s+product)\b/gi, replacement: 'for [PROJECT:FV Demo Product]' },
      { pattern: /\bfor\s+(fv\s+product)\b/gi, replacement: 'for [PROJECT:FV Product]' },
      { pattern: /\bfor\s+(fv\s+engineering)\b/gi, replacement: 'for [PROJECT:FV Engineering]' },
      { pattern: /\bfor\s+(engineering)\b/gi, replacement: 'for [PROJECT:FV Engineering]' },
      
      { pattern: /\bto\s+(fv\s+demo\s+product)\b/gi, replacement: 'to [PROJECT:FV Demo Product]' },
      { pattern: /\bto\s+(demo\s+product)\b/gi, replacement: 'to [PROJECT:FV Demo Product]' },
      { pattern: /\bto\s+(fv\s+product)\b/gi, replacement: 'to [PROJECT:FV Product]' },
      { pattern: /\bto\s+(fv\s+engineering)\b/gi, replacement: 'to [PROJECT:FV Engineering]' },
      { pattern: /\bto\s+(engineering)\b/gi, replacement: 'to [PROJECT:FV Engineering]' }
    ];
    
    for (const { pattern, replacement } of projectPatterns) {
      if (pattern.test(processed)) {
        processed = processed.replace(pattern, replacement);
        console.log(`🔍 Preprocessed: "${userInput}" → "${processed}"`);
        break; // Only apply the first match to avoid conflicts
      }
    }
    
    return processed;
  }

  // UPDATED: Enhanced extraction prompt with better Title/Description handling
  private buildExtractionPrompt(userInput: string): string {
    return `Analyze this user request for creating a Jira issue and extract parameters:

"${userInput}"

Extract these parameters ONLY if they are clearly and explicitly mentioned:

TITLE: The issue title/summary. Look for these patterns:
- Text in quotes after "Title:" (e.g., Title: 'Login broken')
- Text after "Title:" without quotes
- Text after "TITLE_FIELD:" (preprocessed format)
- Clear subject mentioned in the request
- If the user provides "Title: 'some text'" format, extract 'some text' as the title

DESCRIPTION: Detailed explanation. Look for these patterns:
- Text after "Description:" or "Issue Description:"
- Text after "DESCRIPTION_FIELD:" (preprocessed format)
- Text after "Problem:" or "Details:"
- Any detailed explanation of the issue
- If the user provides "Issue Description: 'some text'" format, extract 'some text' as the description

TYPE: Must be exactly one of: Bug, Task, Story, Epic (case-sensitive)

PROJECT: Project name ONLY if mentioned with "in", "for", "to" keywords. Look for these exact patterns:
- "in [PROJECT:project name]" (preprocessed format)
- "in [project name]" or "in the [project name]" 
- "for [project name]" or "for the [project name]"
- "to [project name]" or "to the [project name]"
Valid project names: "FV Demo Product", "FV Demo Issues", "FV Engineering", "FV Product", "demo product", "demo issues", "engineering", "product"

PRIORITY: Must be exactly one of: Lowest, Low, Medium, High, Highest (case-sensitive)

CRITICAL EXTRACTION RULES:
1. For "Title: 'text'" format → extract 'text' (without the quotes) as title
2. For "Issue Description: 'text'" format → extract 'text' as description  
3. For "Description: text" format → extract text as description
4. For "TITLE_FIELD: text" format → extract text as title
5. For "DESCRIPTION_FIELD: text" format → extract text as description
6. If you see both title and description patterns, extract both with high confidence (0.9+)
7. Always extract content from structured formats like "Title: ..." and "Description: ..."

Confidence scoring (0.0-1.0):
- 1.0: Explicitly stated with clear keywords or structured format
- 0.9: Clearly formatted (Title: ..., Description: ..., TITLE_FIELD:, DESCRIPTION_FIELD:)
- 0.8: Strongly implied with high certainty
- 0.6: Reasonably inferred from context
- 0.4: Weakly suggested
- 0.2: Very uncertain
- 0.0: Not mentioned or completely unclear

RESPOND WITH VALID JSON ONLY:
{
  "title": { "value": "extracted title" | null, "confidence": 0.9 },
  "type": { "value": "Bug" | null, "confidence": 0.8 },
  "project": { "value": "FV Demo Product" | null, "confidence": 0.7 },
  "priority": { "value": "High" | null, "confidence": 0.6 },
  "description": { "value": "extracted description" | null, "confidence": 0.9 }
}

Examples:
- "Title: 'Login broken' Description: 'Users cannot authenticate'" 
  → title: "Login broken" (conf: 0.9), description: "Users cannot authenticate" (conf: 0.9)
- "TITLE_FIELD: Campaign not working DESCRIPTION_FIELD: Unable to create campaigns"
  → title: "Campaign not working" (conf: 0.9), description: "Unable to create campaigns" (conf: 0.9)
- "Create a bug called 'API Error'" → title: "API Error", type: "Bug"
- "Issue Description: 'The system crashes when loading'" → description: "The system crashes when loading" (conf: 0.9)

DO NOT invent information. Only extract what is clearly present. Use null for missing parameters.`;
  }

  private parseAIResponse(response: string): ExtractedParameters {
    try {
      // Clean the response to ensure valid JSON
      let cleanResponse = response.trim();
      
      // Remove any markdown code blocks
      cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      // Try to find JSON object in the response
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanResponse = jsonMatch[0];
      }

      const parsed = JSON.parse(cleanResponse);
      
      // Validate and normalize the structure
      return {
        title: this.normalizeParameter(parsed.title),
        type: this.normalizeParameter(parsed.type),
        project: this.normalizeParameter(parsed.project),
        priority: this.normalizeParameter(parsed.priority),
        description: this.normalizeParameter(parsed.description)
      };

    } catch (error) {
      console.error('❌ Failed to parse AI response:', error);
      console.error('Raw response:', response);
      return this.createEmptyExtraction();
    }
  }

  private normalizeParameter(param: any): ExtractedParameter {
    if (!param || typeof param !== 'object') {
      return { value: null, confidence: 0, source: 'ai_extracted' };
    }

    return {
      value: param.value || null,
      confidence: Math.max(0, Math.min(1, param.confidence || 0)),
      source: 'ai_extracted'
    };
  }

  private createEmptyExtraction(): ExtractedParameters {
    return {
      title: { value: null, confidence: 0, source: 'ai_extracted' },
      type: { value: null, confidence: 0, source: 'ai_extracted' },
      project: { value: null, confidence: 0, source: 'ai_extracted' },
      priority: { value: null, confidence: 0, source: 'ai_extracted' },
      description: { value: null, confidence: 0, source: 'ai_extracted' }
    };
  }

  private createDefaultExtraction(): ExtractedParameters {
    return {
      title: { value: null, confidence: 0, source: 'ai_extracted' },
      type: { value: 'Bug', confidence: 1.0, source: 'default' },
      project: { value: 'FV Demo (Issues)', confidence: 1.0, source: 'default' },
      priority: { value: 'Medium', confidence: 1.0, source: 'default' },
      description: { value: null, confidence: 0, source: 'ai_extracted' }
    };
  }

  // Apply defaults for missing parameters
  private applyDefaults(extracted: ExtractedParameters): ExtractedParameters {
    const result = { ...extracted };

    // Apply defaults for type, project, and priority if not extracted with high confidence
    if (!result.type.value || result.type.confidence < 0.6) {
      result.type = { value: 'Bug', confidence: 1.0, source: 'default' };
      console.log('🔧 Applied default type: Bug');
    }

    if (!result.project.value || result.project.confidence < 0.6) {
      result.project = { value: 'FV Demo (Issues)', confidence: 1.0, source: 'default' };
      console.log('🔧 Applied default project: FV Demo (Issues)');
    }

    if (!result.priority.value || result.priority.confidence < 0.6) {
      result.priority = { value: 'Medium', confidence: 1.0, source: 'default' };
      console.log('🔧 Applied default priority: Medium');
    }

    return result;
  }

  private logExtractionResults(extracted: ExtractedParameters): void {
    console.log('🎯 AI Extraction Results:');
    
    Object.entries(extracted).forEach(([key, param]) => {
      if (param.value) {
        let icon = '❌';
        if (param.source === 'default') {
          icon = '🔧'; // Default value
        } else if (param.confidence >= 0.8) {
          icon = '✅'; // High confidence
        } else if (param.confidence >= 0.6) {
          icon = '🟡'; // Medium confidence
        } else {
          icon = '🟠'; // Low confidence
        }
        
        const sourceLabel = param.source === 'default' ? ' (default)' : ` (${(param.confidence * 100).toFixed(0)}%)`;
        console.log(`   ${icon} ${key}: "${param.value}"${sourceLabel}`);
      } else {
        console.log(`   ❌ ${key}: not detected`);
      }
    });
    console.log('');
  }

  // Validate that required parameters are present with sufficient confidence
  validateRequiredParameters(extracted: ExtractedParameters, confidenceThreshold: number = 0.6): { isValid: boolean; missingRequired: string[] } {
    const missing: string[] = [];
    
    if (!extracted.title.value || extracted.title.confidence < confidenceThreshold) {
      missing.push('title');
    }
    
    if (!extracted.description.value || extracted.description.confidence < confidenceThreshold) {
      missing.push('description');
    }
    
    console.log(`📋 Required parameter validation:`, missing.length === 0 ? 'All required params present' : `Missing: ${missing.join(', ')}`);
    
    return {
      isValid: missing.length === 0,
      missingRequired: missing
    };
  }

  // Validate extracted parameters against known valid values
  validateExtractedParameters(extracted: ExtractedParameters): ExtractedParameters {
    const validated = { ...extracted };

    // Validate issue type
    if (validated.type.value) {
      const validTypes = ['Bug', 'Task', 'Story', 'Epic'];
      if (!validTypes.includes(validated.type.value)) {
        console.log(`⚠️  Invalid type "${validated.type.value}", using default: Bug`);
        validated.type = { value: 'Bug', confidence: 1.0, source: 'default' };
      }
    }

    // Validate priority
    if (validated.priority.value) {
      const validPriorities = ['Lowest', 'Low', 'Medium', 'High', 'Highest'];
      if (!validPriorities.includes(validated.priority.value)) {
        console.log(`⚠️  Invalid priority "${validated.priority.value}", using default: Medium`);
        validated.priority = { value: 'Medium', confidence: 1.0, source: 'default' };
      }
    }

    // Validate project with enhanced precision mapping
    if (validated.project.value) {
      const normalizedProject = validated.project.value.toLowerCase().trim();
      
      // Precise project mapping with exact matching
      const projectMapping: { [key: string]: string } = {
        // FV Demo Product variations
        'fv demo product': 'FV Demo (Product)',
        'demo product': 'FV Demo (Product)',
        'fv demo (product)': 'FV Demo (Product)',
        'dpd': 'FV Demo (Product)',
        
        // FV Demo Issues variations  
        'fv demo issues': 'FV Demo (Issues)',
        'demo issues': 'FV Demo (Issues)',
        'fv demo (issues)': 'FV Demo (Issues)',
        'demo': 'FV Demo (Issues)',
        'fvdemo': 'FV Demo (Issues)',
        'dpi': 'FV Demo (Issues)',
        'issues': 'FV Demo (Issues)',
        
        // FV Engineering variations
        'fv engineering': 'FV Engineering',
        'engineering': 'FV Engineering',
        'eng': 'FV Engineering',
        
        // FV Product variations (distinct from demo product)
        'fv product': 'FV Product',
        'prod': 'FV Product'
      };

      // Check for exact matches first
      if (projectMapping[normalizedProject]) {
        const mappedProject = projectMapping[normalizedProject];
        console.log(`📂 Mapped project "${normalizedProject}" → "${mappedProject}"`);
        validated.project.value = mappedProject;
      } else {
        // If no exact match, check if it's already a valid full project name
        const validFullNames = ['FV Demo (Product)', 'FV Demo (Issues)', 'FV Engineering', 'FV Product'];
        const matchingFullName = validFullNames.find(name => 
          name.toLowerCase() === normalizedProject || 
          normalizedProject === name
        );
        
        if (matchingFullName) {
          console.log(`📂 Validated full project name: "${matchingFullName}"`);
          validated.project.value = matchingFullName;
        } else {
          // Handle special cases for partial matches that might be ambiguous
          if (normalizedProject === 'product' || normalizedProject === 'fv') {
            console.log(`⚠️  Ambiguous project "${normalizedProject}", using default: FV Demo (Issues)`);
            validated.project = { value: 'FV Demo (Issues)', confidence: 1.0, source: 'default' };
          } else {
            console.log(`⚠️  Unknown project "${normalizedProject}", using default: FV Demo (Issues)`);
            validated.project = { value: 'FV Demo (Issues)', confidence: 1.0, source: 'default' };
          }
        }
      }
    }

    return validated;
  }

  // Build a context phrase for displaying issue details
  buildContextPhrase(extracted: ExtractedParameters): string {
    const parts: string[] = [];
    
    if (extracted.type.value && extracted.type.confidence >= 0.6) {
      parts.push(`${extracted.type.value.toLowerCase()}`);
    } else {
      parts.push('issue');
    }

    if (extracted.title.value && extracted.title.confidence >= 0.6) {
      parts.push(`titled "${extracted.title.value}"`);
    }

    if (extracted.project.value && extracted.project.confidence >= 0.6) {
      parts.push(`in ${extracted.project.value} project`);
    }

    if (extracted.priority.value && extracted.priority.confidence >= 0.6) {
      parts.push(`with ${extracted.priority.value.toLowerCase()} priority`);
    }

    if (parts.length > 1) {
      return `Creating a ${parts.join(' ')}`;
    } else {
      return 'Creating this issue';
    }
  }
}