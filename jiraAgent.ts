import { Chatbot } from './chatbot';
import { ConversationState, IssueCreationStep } from './types';
import { APP_CONFIG, OPENAI_API_KEY } from './config';
import { ZapierService } from './zapierService';
import { ConversationManager } from './conversationManager';

export class JiraAgent {
  private chatbot: Chatbot;
  private zapierService: ZapierService;
  private conversationManager: ConversationManager;
  private state: ConversationState = {
    isCreatingIssue: false,
    issueData: {},
    currentStep: IssueCreationStep.DETECTING_INTENT,
    hasAskedFor: new Set(),
    extractedParameters: undefined,
    missingParameters: undefined,
    pendingValidation: new Set()
  };

  constructor() {
    this.chatbot = new Chatbot(OPENAI_API_KEY || '');
    this.zapierService = new ZapierService();
    this.conversationManager = new ConversationManager();
  }

  async start(): Promise<void> {
    console.log(APP_CONFIG.WELCOME_MESSAGE);
    
    // Initialize Zapier service
    try {
      await this.zapierService.initialize();
    } catch (error) {
      console.error('⚠️  Warning: Could not connect to Zapier MCP server. Issue creation will not work.');
      console.error('Please check your ZAPIER_MCP_URL in .env file.\n');
    }
    
    await this.conversationLoop();
  }

  private async conversationLoop(): Promise<void> {
    while (true) {
      try {
        const userInput = await this.chatbot.getUserInput('You: ');
        
        if (userInput.toLowerCase().trim() === APP_CONFIG.EXIT_COMMAND) {
          console.log(APP_CONFIG.GOODBYE_MESSAGE);
          break;
        }

        if (userInput.trim() === '') {
          continue;
        }

        // Add user message to conversation history
        this.chatbot.addUserMessage(userInput);

        // Process the user input through conversation manager
        const result = await this.conversationManager.processUserInput(
          userInput, 
          this.state, 
          this.chatbot
        );

        await this.handleConversationResult(result);

      } catch (error) {
        console.error('❌ An error occurred:', error);
        console.log('Please try again.\n');
      }
    }

    // Cleanup
    await this.cleanup();
  }

  private async handleConversationResult(result: {
    action: 'continue' | 'create_issue' | 'search' | 'cancel' | 'regular_chat' | 'error';
    message?: string;
    searchQuery?: string;
  }): Promise<void> {
    switch (result.action) {
      case 'continue':
        if (result.message) {
          console.log(`\n🤖 Agent: ${result.message}\n`);
          this.chatbot.addAssistantMessage(result.message);
        }
        break;

      case 'create_issue':
        await this.executeIssueCreation();
        break;

      case 'search':
        if (result.searchQuery) {
          await this.handleSearchRequest(result.searchQuery);
        }
        break;

      case 'cancel':
        if (result.message) {
          console.log(`\n🤖 Agent: ${result.message}\n`);
          this.chatbot.addAssistantMessage(result.message);
        }
        break;

      case 'error':
        if (result.message) {
          console.log(`\n🤖 Agent: ${result.message}\n`);
          this.chatbot.addAssistantMessage(result.message);
        }
        break;

      case 'regular_chat':
        await this.handleRegularConversation();
        break;
    }
  }

  private async executeIssueCreation(): Promise<void> {
    if (!this.zapierService.isReady()) {
      console.log('❌ Cannot create issue: Zapier service not connected');
      this.conversationManager.resetConversationState(this.state);
      return;
    }

    try {
      // Display what we're about to create
      this.conversationManager.displayCreationDetails(this.state.issueData);

      // Execute the actual Jira creation via MCP
      const result = await this.zapierService.createJiraIssue(this.state.issueData);
      
      if (result.success) {
        // Display success details
        this.conversationManager.displaySuccessResult(result);
        
        // Add success message to chatbot
        const successMessage = this.conversationManager.formatSuccessMessage(result, this.state.issueData);
        this.chatbot.addAssistantMessage(successMessage);
        
      } else {
        // Display failure details
        this.conversationManager.displayFailureResult(result);
        
        // Add error message to chatbot
        const errorMessage = this.conversationManager.formatErrorMessage(result);
        this.chatbot.addAssistantMessage(errorMessage);
      }

    } catch (error) {
      console.error('❌ Failed to create Jira issue:', error);
      this.chatbot.addAssistantMessage(
        `❌ I encountered a technical error while trying to create the Jira issue: ${error}. Please check your connection and try again.`
      );
    } finally {
      this.conversationManager.resetConversationState(this.state);
    }
  }

  private async handleSearchRequest(searchQuery: string): Promise<void> {
    if (!this.zapierService.isReady()) {
      console.log('❌ Cannot search issues: Zapier service not connected');
      return;
    }

    if (searchQuery.length < 3) {
      console.log('Please provide a more specific search term.');
      return;
    }

    try {
      console.log(`🔍 Searching for: "${searchQuery}"`);
      const results = await this.zapierService.searchJiraIssues(searchQuery);
      
      if (results.length === 0) {
        console.log('No issues found matching your search.');
      } else {
        console.log(`\n📋 Found ${results.length} issue(s):`);
        results.slice(0, 5).forEach((issue, index) => {
          console.log(`  ${index + 1}. ${issue.key}: ${issue.summary}`);
        });
        if (results.length > 5) {
          console.log(`  ... and ${results.length - 5} more`);
        }
        console.log('');
      }
      
    } catch (error) {
      console.error('❌ Search failed:', error);
    }
  }

  private async handleRegularConversation(): Promise<void> {
    const response = await this.chatbot.getAIResponse();
    
    if (response) {
      console.log(`\n🤖 Agent: ${response}\n`);
      this.chatbot.addAssistantMessage(response);
    }
  }

  private async cleanup(): Promise<void> {
    this.chatbot.close();
    await this.zapierService.cleanup();
    console.log('🧹 Cleanup completed');
  }

  // Getters for testing and debugging
  getState(): ConversationState {
    return { ...this.state };
  }

  getConversationHistory() {
    return this.chatbot.getConversationHistory();
  }

  getZapierService(): ZapierService {
    return this.zapierService;
  }
}