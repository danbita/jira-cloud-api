import { ConversationState, IssueCreationStep } from './types';
import { InformationExtractor } from './informationExtractor';
import { IssueCreationFlow } from './issueCreationFlow';
import { AIParameterExtractor, ExtractedParameters } from './aiParameterExtractor';
import { Chatbot } from './chatbot';

export class ConversationManager {
  private extractor: InformationExtractor;
  private issueFlow: IssueCreationFlow;
  private aiExtractor: AIParameterExtractor;

  constructor() {
    this.extractor = new InformationExtractor();
    this.issueFlow = new IssueCreationFlow();
    this.aiExtractor = new AIParameterExtractor();
  }

  async processUserInput(
    userInput: string, 
    state: ConversationState, 
    chatbot: Chatbot
  ): Promise<{
    action: 'continue' | 'create_issue' | 'search' | 'cancel' | 'regular_chat' | 'error';
    message?: string;
    searchQuery?: string;
  }> {
    // If we're in issue creation mode, handle the flow
    if (state.isCreatingIssue) {
      return await this.handleIssueCreationFlow(userInput, state, chatbot);
    } else {
      // NEW LOGIC: Check for explicit non-issue intents first
      if (this.extractor.detectsSearchIntent(userInput)) {
        const searchQuery = this.extractor.extractSearchQuery(userInput);
        return { action: 'search', searchQuery };
      } 
      
      // Check for explicit chat/help requests
      if (this.extractor.detectsChatIntent(userInput)) {
        return { action: 'regular_chat' };
      }
      
      // DEFAULT: Assume issue creation intent for everything else
      return await this.startIssueCreationWithAI(userInput, state, chatbot);
    }
  }

  private async startIssueCreationWithAI(
    userInput: string, 
    state: ConversationState, 
    chatbot: Chatbot
  ): Promise<{
    action: 'continue' | 'create_issue' | 'error';
    message?: string;
  }> {
    console.log('🎯 Starting AI-enhanced issue creation...');
    
    state.isCreatingIssue = true;
    state.currentStep = IssueCreationStep.AI_EXTRACTING;

    try {
      // Phase 1: AI Parameter Extraction
      console.log('🤖 Extracting parameters with AI...');
      const extracted = await this.aiExtractor.extractParameters(userInput);
      const validated = this.aiExtractor.validateExtractedParameters(extracted);
      
      // Phase 2: Validate Required Parameters (NEW - replaces missing parameter collection)
      console.log('📋 Validating required parameters...');
      const validation = this.aiExtractor.validateRequiredParameters(validated, 0.6);
      
      if (!validation.isValid) {
        // Reset state and return error
        this.issueFlow.resetState(state);
        return {
          action: 'error',
          message: `❌ Missing required information: ${validation.missingRequired.join(' and ')}. Please provide both a title and description in your request.`
        };
      }
      
      // Phase 3: Convert extracted parameters to issueData and create
      this.convertExtractedToIssueData(validated, state);
      
      // Store extraction results for display
      state.extractedParameters = validated;
      
      console.log('🎉 All parameters available! Ready to create issue.');
      return { action: 'create_issue' };

    } catch (error) {
      console.error('❌ AI extraction failed, falling back to traditional flow:', error);
      
      // Fallback to traditional step-by-step flow
      this.issueFlow.startIssueCreation(userInput, state);
      const nextStep = this.issueFlow.determineNextStep(state);
      const question = this.issueFlow.getQuestionForStep(nextStep);
      
      state.currentStep = nextStep;
      this.markStepAsAsked(nextStep, state);

      return {
        action: 'continue',
        message: question
      };
    }
  }

  private async handleIssueCreationFlow(
    userInput: string, 
    state: ConversationState, 
    chatbot: Chatbot
  ): Promise<{
    action: 'continue' | 'create_issue' | 'cancel';
    message?: string;
  }> {
    // Check for cancellation
    if (this.issueFlow.checkForCancellation(userInput)) {
      this.issueFlow.resetState(state);
      return {
        action: 'cancel',
        message: "No problem! Issue creation has been cancelled. Let me know if you need help with anything else."
      };
    }

    // Handle confirmation step in AI flow
    if (state.currentStep === IssueCreationStep.CONFIRMING_DETAILS && state.extractedParameters) {
      const lowerInput = userInput.toLowerCase();
      if (lowerInput.includes('yes') || lowerInput.includes('confirm') || lowerInput.includes('create')) {
        return { action: 'create_issue' };
      } else if (lowerInput.includes('no') || lowerInput.includes('cancel')) {
        this.issueFlow.resetState(state);
        return {
          action: 'cancel',
          message: "No problem! Issue creation has been cancelled. Let me know if you need help with anything else."
        };
      } else {
        return {
          action: 'continue',
          message: "Please confirm by saying 'yes' to create the issue, or 'no' to cancel."
        };
      }
    }

    // Fall back to traditional step-by-step flow (for error cases)
    const result = this.issueFlow.processResponse(userInput, state.currentStep, state);
    
    if (!result.success) {
      return {
        action: 'continue',
        message: result.errorMessage || "Please try again."
      };
    }

    if (state.currentStep === IssueCreationStep.CONFIRMING_DETAILS) {
      if (result.value === 'confirmed') {
        return { action: 'create_issue' };
      } else if (result.value === 'cancelled') {
        this.issueFlow.resetState(state);
        return {
          action: 'cancel',
          message: "No problem! Issue creation has been cancelled. Let me know if you need help with anything else."
        };
      }
    }

    const nextStep = this.issueFlow.determineNextStep(state);
    
    if (nextStep === IssueCreationStep.CONFIRMING_DETAILS) {
      this.issueFlow.displayIssueSummary(state.issueData);
      state.currentStep = nextStep;
      
      return {
        action: 'continue',
        message: this.issueFlow.getQuestionForStep(nextStep)
      };
    } else if (nextStep === IssueCreationStep.READY_TO_CREATE) {
      return { action: 'create_issue' };
    } else {
      state.currentStep = nextStep;
      this.markStepAsAsked(nextStep, state);
      
      return {
        action: 'continue',
        message: this.issueFlow.getQuestionForStep(nextStep)
      };
    }
  }

  private convertExtractedToIssueData(extracted: ExtractedParameters, state: ConversationState): void {
    // Convert extracted parameters to issueData
    // Always include values (with defaults already applied by AIParameterExtractor)
    if (extracted.title.value) {
      state.issueData.title = extracted.title.value;
    }
    if (extracted.type.value) {
      state.issueData.issueType = extracted.type.value;
    }
    if (extracted.project.value) {
      state.issueData.project = extracted.project.value;
    }
    if (extracted.priority.value) {
      state.issueData.priority = extracted.priority.value;
    }
    if (extracted.description.value) {
      state.issueData.description = extracted.description.value;
    }
  }

  private markStepAsAsked(step: IssueCreationStep, state: ConversationState): void {
    switch (step) {
      case IssueCreationStep.ASKING_PROJECT:
        state.hasAskedFor.add('project');
        break;
      case IssueCreationStep.ASKING_TYPE:
        state.hasAskedFor.add('type');
        break;
      case IssueCreationStep.ASKING_TITLE:
        state.hasAskedFor.add('title');
        break;
      case IssueCreationStep.ASKING_DESCRIPTION:
        state.hasAskedFor.add('description');
        break;
      case IssueCreationStep.ASKING_PRIORITY:
        state.hasAskedFor.add('priority');
        break;
    }
  }

  private displayAIExtractedSummary(state: ConversationState): void {
    console.log('\n📋 Issue Summary:');
    console.log('══════════════════════════════════════');
    
    if (state.issueData.project) {
      const source = state.extractedParameters?.project?.source === 'default' ? '🔧' :
                     state.extractedParameters?.project?.confidence >= 0.6 ? '🤖' : '💬';
      console.log(`📂 Project: ${state.issueData.project} ${source}`);
    }
    
    if (state.issueData.issueType) {
      const source = state.extractedParameters?.type?.source === 'default' ? '🔧' :
                     state.extractedParameters?.type?.confidence >= 0.6 ? '🤖' : '💬';
      console.log(`🏷️  Type: ${state.issueData.issueType} ${source}`);
    }
    
    if (state.issueData.title) {
      const source = state.extractedParameters?.title?.confidence >= 0.6 ? '🤖' : '💬';
      console.log(`📝 Title: ${state.issueData.title} ${source}`);
    }
    
    if (state.issueData.priority) {
      const source = state.extractedParameters?.priority?.source === 'default' ? '🔧' :
                     state.extractedParameters?.priority?.confidence >= 0.6 ? '🤖' : '💬';
      console.log(`⚡ Priority: ${state.issueData.priority} ${source}`);
    }
    
    if (state.issueData.description) {
      const source = state.extractedParameters?.description?.confidence >= 0.6 ? '🤖' : '💬';
      const truncated = state.issueData.description.length > 100 
        ? state.issueData.description.substring(0, 100) + '...' 
        : state.issueData.description;
      console.log(`📄 Description: ${truncated} ${source}`);
    }
    
    console.log('══════════════════════════════════════');
    console.log('🤖 = AI extracted, 🔧 = Default value, 💬 = Follow-up question');
  }

  formatSuccessMessage(result: any, issueData: any): string {
    return `✅ Perfect! I've successfully created your Jira issue with key ${result.key || 'N/A'}. The issue "${result.summary || issueData.title}" has been added to your ${result.project || issueData.project} project. You can view it at the link provided above. Is there anything else you'd like me to help you with?`;
  }

  formatErrorMessage(result: any): string {
    return `❌ I encountered an issue while creating your Jira ticket. The error was: ${result.error || result.response || 'Unknown error'}. Would you like to try again?`;
  }

  displayCreationDetails(issueData: any): void {
    console.log('🚀 Creating Jira issue with collected information...');
    console.log('📋 Issue Details:');
    console.log(`   Project: ${issueData.project}`);
    console.log(`   Title: ${issueData.title}`);
    console.log(`   Type: ${issueData.issueType}`);
    console.log(`   Priority: ${issueData.priority}`);
    if (issueData.description) {
      console.log(`   Description: ${issueData.description.substring(0, 100)}${issueData.description.length > 100 ? '...' : ''}`);
    }
    console.log('');
  }

  displaySuccessResult(result: any): void {
    console.log('🎉 SUCCESS! Jira issue has been created!');
    console.log('═'.repeat(50));
    
    if (result.key) {
      console.log(`📝 Issue Key: ${result.key}`);
    }
    
    if (result.url) {
      console.log(`🔗 Issue Link: ${result.url}`);
    }
    
    if (result.project) {
      console.log(`📂 Project: ${result.project}`);
    }
    
    if (result.summary) {
      console.log(`📋 Summary: ${result.summary}`);
    }
    
    if (result.issueType) {
      console.log(`🏷️  Type: ${result.issueType}`);
    }
    
    if (result.priority) {
      console.log(`⚡ Priority: ${result.priority}`);
    }
    
    if (result.status) {
      console.log(`📊 Status: ${result.status}`);
    }
    
    console.log('═'.repeat(50));
    console.log(`✨ ${result.response}`);
  }

  displayFailureResult(result: any): void {
    console.log('❌ FAILED: Issue creation was not successful');
    console.log('═'.repeat(50));
    
    if (result.error) {
      console.log(`💥 Error: ${result.error}`);
    }
    
    if (result.response) {
      console.log(`📄 Details: ${result.response}`);
    }
    
    console.log('═'.repeat(50));
  }

  resetConversationState(state: ConversationState): void {
    this.issueFlow.resetState(state);
  }
}