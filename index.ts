import * as functions from '@google-cloud/functions-framework';
import OpenAI from 'openai';
import { ConversationManager } from './conversationManager';
import { ZapierService } from './zapierService';
import { ConversationState, IssueCreationStep } from './types';
import { Chatbot } from './chatbot';

// Enhanced mock chatbot class that implements the Chatbot interface
class CloudChatbot extends Chatbot {
  constructor() {
    // Pass a dummy API key since we won't use OpenAI features in cloud context
    super(process.env.OPENAI_API_KEY || 'dummy-key');
  }

  addUserMessage(content: string): void {
    super.addUserMessage(content);
  }

  addAssistantMessage(content: string): void {
    super.addAssistantMessage(content);
  }

  getConversationHistory(): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return super.getConversationHistory();
  }

  // Override methods that don't make sense in cloud function context
  async getUserInput(prompt: string): Promise<string> {
    throw new Error('getUserInput not supported in cloud function context');
  }

  async getAIResponse(): Promise<string | null> {
    throw new Error('getAIResponse not supported in cloud function context');
  }

  close(): void {
    // No-op in cloud function context - override the parent's readline close
  }
}

// Validate request payload
function validateRequest(body: any): { isValid: boolean; error?: string; prompt?: string } {
  if (!body) {
    return { isValid: false, error: 'Request body is required' };
  }

  const { prompt } = body;
  
  if (!prompt) {
    return { isValid: false, error: 'A "prompt" field is required in the request body' };
  }
  
  if (typeof prompt !== 'string') {
    return { isValid: false, error: 'The "prompt" field must be a string' };
  }
  
  if (prompt.trim().length === 0) {
    return { isValid: false, error: 'The "prompt" field cannot be empty' };
  }
  
  if (prompt.length > 5000) {
    return { isValid: false, error: 'The "prompt" field cannot exceed 5000 characters' };
  }
  
  return { isValid: true, prompt: prompt.trim() };
}

// Initialize services with error handling
async function initializeServices(): Promise<{
  conversationManager: ConversationManager;
  zapierService: ZapierService;
}> {
  const conversationManager = new ConversationManager();
  const zapierService = new ZapierService();
  
  try {
    await zapierService.initialize();
    console.log('✅ Services initialized successfully');
    return { conversationManager, zapierService };
  } catch (error) {
    console.error('❌ Service initialization failed:', error);
    throw new Error(`Service initialization failed: ${error}`);
  }
}

// Separate handler for issue creation
async function handleIssueCreation(
  res: any,
  state: ConversationState,
  conversationManager: ConversationManager,
  zapierService: ZapierService,
  mockChatbot: CloudChatbot,
  startTime: number
): Promise<void> {
  console.log('🚀 Creating Jira issue...');
  conversationManager.displayCreationDetails(state.issueData);
  
  try {
    const jiraResult = await zapierService.createJiraIssue(state.issueData);
    
    if (jiraResult.success) {
      conversationManager.displaySuccessResult(jiraResult);
      const successMessage = conversationManager.formatSuccessMessage(jiraResult, state.issueData);
      mockChatbot.addAssistantMessage(successMessage);
      
      res.json({
        action: 'issue_created',
        success: true,
        message: successMessage,
        issueData: {
          key: jiraResult.key,
          url: jiraResult.url,
          project: jiraResult.project,
          summary: jiraResult.summary || state.issueData.title,
          issueType: jiraResult.issueType || state.issueData.issueType,
          priority: jiraResult.priority || state.issueData.priority,
          status: jiraResult.status
        },
        conversationHistory: mockChatbot.getConversationHistory(),
        processingTime: Date.now() - startTime
      });
    } else {
      conversationManager.displayFailureResult(jiraResult);
      const errorMessage = conversationManager.formatErrorMessage(jiraResult);
      mockChatbot.addAssistantMessage(errorMessage);
      
      res.json({
        action: 'issue_creation_failed',
        success: false,
        message: errorMessage,
        error: jiraResult.error,
        conversationHistory: mockChatbot.getConversationHistory(),
        processingTime: Date.now() - startTime
      });
    }
  } catch (issueCreationError) {
    console.error('❌ Issue creation failed:', issueCreationError);
    const errorMessage = `Failed to create Jira issue: ${issueCreationError}`;
    
    res.status(500).json({
      action: 'issue_creation_failed',
      success: false,
      message: errorMessage,
      error: String(issueCreationError),
      conversationHistory: mockChatbot.getConversationHistory(),
      processingTime: Date.now() - startTime
    });
  }
}

// Separate handler for search functionality
async function handleSearch(
  res: any,
  searchQuery: string | undefined,
  zapierService: ZapierService,
  mockChatbot: CloudChatbot,
  startTime: number
): Promise<void> {
  if (!searchQuery || !zapierService.isReady()) {
    res.json({
      action: 'search_failed',
      message: searchQuery ? 'Search functionality is not available' : 'No search query provided',
      conversationHistory: mockChatbot.getConversationHistory(),
      processingTime: Date.now() - startTime
    });
    return;
  }

  try {
    console.log(`🔍 Searching for: "${searchQuery}"`);
    const searchResults = await zapierService.searchJiraIssues(searchQuery);
    
    const message = searchResults.length > 0 
      ? `Found ${searchResults.length} issue(s) matching "${searchQuery}"`
      : `No issues found matching "${searchQuery}"`;
    
    mockChatbot.addAssistantMessage(message);
    
    res.json({
      action: 'search_results',
      searchQuery,
      results: searchResults,
      message,
      conversationHistory: mockChatbot.getConversationHistory(),
      processingTime: Date.now() - startTime
    });
  } catch (searchError) {
    console.error('❌ Search failed:', searchError);
    const errorMessage = `Search failed: ${searchError}`;
    mockChatbot.addAssistantMessage(errorMessage);
    
    res.status(500).json({
      action: 'search_failed',
      message: errorMessage,
      error: String(searchError),
      conversationHistory: mockChatbot.getConversationHistory(),
      processingTime: Date.now() - startTime
    });
  }
}

// Main cloud function handler
functions.http('jiraAgent', async (req, res) => {
  const startTime = Date.now();
  console.log(`🚀 Request received: ${req.method} ${req.url}`);
  
  // Set comprehensive CORS headers
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '3600',
    'Content-Type': 'application/json'
  });

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  // Allow GET for health check on main endpoint
  if (req.method === 'GET') {
    res.json({
      status: 'healthy',
      service: 'jira-agent-cloud-function',
      timestamp: new Date().toISOString(),
      message: 'Send a POST request with a "prompt" field to use the Jira agent'
    });
    return;
  }

  // Only allow POST requests for main functionality
  if (req.method !== 'POST') {
    res.status(405).json({ 
      error: 'Method Not Allowed',
      message: 'Only POST requests are supported for agent functionality',
      allowedMethods: ['POST', 'OPTIONS', 'GET']
    });
    return;
  }

  let zapierService: ZapierService | null = null;

  try {
    // Validate request
    const validation = validateRequest(req.body);
    if (!validation.isValid) {
      res.status(400).json({ 
        error: 'Bad Request',
        message: validation.error
      });
      return;
    }

    const prompt = validation.prompt!;
    console.log(`📝 Processing prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);

    // Initialize services
    let conversationManager: ConversationManager;
    try {
      const services = await initializeServices();
      conversationManager = services.conversationManager;
      zapierService = services.zapierService;
    } catch (initError) {
      console.error('⚠️ Service initialization failed:', initError);
      res.status(503).json({
        error: 'Service Unavailable',
        message: 'Could not initialize Jira service. Please try again later.',
        details: String(initError)
      });
      return;
    }

    const mockChatbot = new CloudChatbot();

    // Create conversation state
    const state: ConversationState = {
      isCreatingIssue: false,
      issueData: {},
      currentStep: IssueCreationStep.DETECTING_INTENT,
      hasAskedFor: new Set(),
      extractedParameters: undefined,
      missingParameters: undefined,
      pendingValidation: new Set()
    };

    // Add user message to conversation
    mockChatbot.addUserMessage(prompt);

    // Process the user input (pass null for chatbot since it's not used in this context)
    const result = await conversationManager.processUserInput(
      prompt,
      state,
      mockChatbot as any  // Type assertion to bypass the type check
    );

    console.log(`🎯 Processing result: ${result.action}`);

    // Handle the conversation result
    switch (result.action) {
      case 'continue':
        if (result.message) {
          mockChatbot.addAssistantMessage(result.message);
        }
        res.json({
          action: 'continue',
          message: result.message || 'Please provide more information.',
          state: {
            isCreatingIssue: state.isCreatingIssue,
            currentStep: state.currentStep,
            hasExtractedParameters: !!state.extractedParameters,
            missingParametersCount: state.missingParameters?.length || 0
          },
          conversationHistory: mockChatbot.getConversationHistory(),
          processingTime: Date.now() - startTime
        });
        break;

      case 'create_issue':
        await handleIssueCreation(res, state, conversationManager, zapierService, mockChatbot, startTime);
        break;

      case 'search':
        await handleSearch(res, result.searchQuery, zapierService, mockChatbot, startTime);
        break;

      case 'cancel':
        if (result.message) {
          mockChatbot.addAssistantMessage(result.message);
        }
        res.json({
          action: 'cancelled',
          message: result.message || 'Operation cancelled.',
          conversationHistory: mockChatbot.getConversationHistory(),
          processingTime: Date.now() - startTime
        });
        break;

      case 'error':
        if (result.message) {
          mockChatbot.addAssistantMessage(result.message);
        }
        res.json({
          action: 'error',
          message: result.message || 'An error occurred while processing your request.',
          conversationHistory: mockChatbot.getConversationHistory(),
          processingTime: Date.now() - startTime
        });
        break;

      case 'regular_chat':
        const chatMessage = 'I can help you create Jira issues or search for existing ones. What would you like to do?';
        mockChatbot.addAssistantMessage(chatMessage);
        res.json({
          action: 'chat_response',
          message: chatMessage,
          conversationHistory: mockChatbot.getConversationHistory(),
          processingTime: Date.now() - startTime
        });
        break;

      default:
        const unknownMessage = 'I\'m not sure how to help with that. You can ask me to create Jira issues or search for existing ones.';
        mockChatbot.addAssistantMessage(unknownMessage);
        res.json({
          action: 'unknown',
          message: unknownMessage,
          conversationHistory: mockChatbot.getConversationHistory(),
          processingTime: Date.now() - startTime
        });
    }

  } catch (error) {
    console.error('❌ Unexpected error in cloud function:', error);
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while processing your request.',
      details: String(error),
      processingTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    });
  } finally {
    // Cleanup resources
    if (zapierService) {
      try {
        await zapierService.cleanup();
      } catch (cleanupError) {
        console.error('⚠️ Cleanup error:', cleanupError);
      }
    }
    
    console.log(`⏱️ Total request time: ${Date.now() - startTime}ms`);
  }
});

// Health check endpoint
functions.http('health', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'jira-agent-cloud-function',
    version: '1.0.0',
    endpoints: {
      main: '/jira-agent',
      health: '/health'
    }
  });
});