import { ConversationState, IssueData, IssueCreationStep } from './types';
import { InformationExtractor } from './informationExtractor';

export class IssueCreationFlow {
  private extractor: InformationExtractor;

  constructor() {
    this.extractor = new InformationExtractor();
  }

  startIssueCreation(userInput: string, state: ConversationState): void {
    state.isCreatingIssue = true;
    state.currentStep = IssueCreationStep.ASKING_PROJECT;
    console.log('🎯 Starting issue creation process');
    
    // Try to extract any explicit information from the initial request
    const extractedData = this.extractor.extractExplicitInformation(userInput);
    Object.assign(state.issueData, extractedData);
  }

  determineNextStep(state: ConversationState): IssueCreationStep {
    if (!state.issueData.project && !state.hasAskedFor.has('project')) {
      return IssueCreationStep.ASKING_PROJECT;
    } else if (!state.issueData.issueType && !state.hasAskedFor.has('type')) {
      return IssueCreationStep.ASKING_TYPE;
    } else if (!state.issueData.title && !state.hasAskedFor.has('title')) {
      return IssueCreationStep.ASKING_TITLE;
    } else if (!state.issueData.description && !state.hasAskedFor.has('description')) {
      return IssueCreationStep.ASKING_DESCRIPTION;
    } else if (!state.issueData.priority && !state.hasAskedFor.has('priority')) {
      return IssueCreationStep.ASKING_PRIORITY;
    } else if (this.hasAllRequiredData(state.issueData)) {
      return IssueCreationStep.CONFIRMING_DETAILS;
    }
    return IssueCreationStep.READY_TO_CREATE;
  }

  getQuestionForStep(step: IssueCreationStep): string {
    switch (step) {
      case IssueCreationStep.ASKING_PROJECT:
        return "I'll help you create a Jira issue! First, which project should this issue be created in? Please choose from: FV Product, FV Engineering, FV Demo (Issues), or FV Demo (Product). You can also just say 'demo' for FV Demo (Issues).";
      
      case IssueCreationStep.ASKING_TYPE:
        return "What type of issue would you like to create? Please choose from: Bug, Task, Story, or Epic.";
      
      case IssueCreationStep.ASKING_TITLE:
        return "What should be the title (summary) of this issue? Please provide a brief, descriptive title.";
      
      case IssueCreationStep.ASKING_DESCRIPTION:
        return "Please provide a description for this issue. Include any relevant details, steps to reproduce (for bugs), or requirements (for features). You can also say 'skip' if you don't want to add a description.";
      
      case IssueCreationStep.ASKING_PRIORITY:
        return "What priority should this issue have? Please choose from: Lowest, Low, Medium, High, or Highest. (Note: Priority may not apply to all issue types in your Jira configuration)";
      
      case IssueCreationStep.CONFIRMING_DETAILS:
        return "Please review the issue details above. Would you like me to create this issue? (yes/no)";
      
      default:
        return "I need more information to proceed.";
    }
  }

  processResponse(userInput: string, currentStep: IssueCreationStep, state: ConversationState): {
    success: boolean;
    errorMessage?: string;
    value?: any;
  } {
    switch (currentStep) {
      case IssueCreationStep.ASKING_PROJECT:
        return this.handleProjectResponse(userInput, state);
      
      case IssueCreationStep.ASKING_TYPE:
        return this.handleTypeResponse(userInput, state);
      
      case IssueCreationStep.ASKING_TITLE:
        return this.handleTitleResponse(userInput, state);
      
      case IssueCreationStep.ASKING_DESCRIPTION:
        return this.handleDescriptionResponse(userInput, state);
      
      case IssueCreationStep.ASKING_PRIORITY:
        return this.handlePriorityResponse(userInput, state);
      
      case IssueCreationStep.CONFIRMING_DETAILS:
        return this.handleConfirmationResponse(userInput);
      
      default:
        return { success: false, errorMessage: "Unknown step" };
    }
  }

  private handleProjectResponse(userInput: string, state: ConversationState): { success: boolean; errorMessage?: string } {
    const project = this.extractor.extractProjectFromResponse(userInput);
    if (project) {
      state.issueData.project = project;
      console.log(`📂 Project set to: ${state.issueData.project}`);
      return { success: true };
    } else {
      return { 
        success: false, 
        errorMessage: "I couldn't identify a valid project key. Please provide a project key like DEMO, TEST, or PROJ (usually uppercase letters and numbers)." 
      };
    }
  }

  private handleTypeResponse(userInput: string, state: ConversationState): { success: boolean; errorMessage?: string } {
    const issueType = this.extractor.extractIssueTypeFromResponse(userInput);
    if (issueType) {
      state.issueData.issueType = issueType;
      console.log(`🏷️  Issue type set to: ${state.issueData.issueType}`);
      return { success: true };
    } else {
      return { 
        success: false, 
        errorMessage: "Please specify one of the valid issue types: Bug, Task, Story, or Epic." 
      };
    }
  }

  private handleTitleResponse(userInput: string, state: ConversationState): { success: boolean; errorMessage?: string } {
    const title = this.extractor.extractTitleFromResponse(userInput);
    if (title) {
      state.issueData.title = title;
      console.log(`📝 Title set to: ${state.issueData.title}`);
      return { success: true };
    } else {
      return { 
        success: false, 
        errorMessage: "Please provide a more descriptive title for the issue (at least 5 characters)." 
      };
    }
  }

  private handleDescriptionResponse(userInput: string, state: ConversationState): { success: boolean; errorMessage?: string } {
    const description = this.extractor.extractDescriptionFromResponse(userInput);
    state.issueData.description = description;
    
    if (description === '') {
      console.log('📄 Description skipped');
    } else {
      console.log('📄 Description added');
    }
    
    return { success: true };
  }

  private handlePriorityResponse(userInput: string, state: ConversationState): { success: boolean; errorMessage?: string } {
    const priority = this.extractor.extractPriorityFromResponse(userInput);
    if (priority) {
      state.issueData.priority = priority;
      console.log(`⚡ Priority set to: ${state.issueData.priority}`);
      return { success: true };
    } else {
      return { 
        success: false, 
        errorMessage: "Please specify one of the valid priorities: Lowest, Low, Medium, High, or Highest." 
      };
    }
  }

  private handleConfirmationResponse(userInput: string): { success: boolean; errorMessage?: string; value?: string } {
    const lowerInput = userInput.toLowerCase();
    if (lowerInput.includes('yes') || lowerInput.includes('confirm') || lowerInput.includes('create')) {
      return { success: true, value: 'confirmed' };
    } else if (lowerInput.includes('no') || lowerInput.includes('cancel')) {
      return { success: true, value: 'cancelled' };
    } else {
      return { 
        success: false, 
        errorMessage: "Please confirm by saying 'yes' to create the issue, or 'no' to cancel." 
      };
    }
  }

  hasAllRequiredData(issueData: IssueData): boolean {
    return !!(
      issueData.project && 
      issueData.issueType && 
      issueData.title && 
      issueData.priority
    );
  }

  displayIssueSummary(issueData: IssueData): void {
    console.log('\n📋 Issue Summary:');
    console.log('══════════════════════════════════════');
    console.log(`📂 Project: ${issueData.project}`);
    console.log(`🏷️  Type: ${issueData.issueType}`);
    console.log(`📝 Title: ${issueData.title}`);
    console.log(`⚡ Priority: ${issueData.priority}`);
    if (issueData.description) {
      console.log(`📄 Description: ${issueData.description.substring(0, 100)}${issueData.description.length > 100 ? '...' : ''}`);
    }
    console.log('══════════════════════════════════════');
  }

  checkForCancellation(userInput: string): boolean {
    const lowerInput = userInput.toLowerCase();
    return lowerInput.includes('cancel') || lowerInput.includes('stop') || lowerInput.includes('abort');
  }

  resetState(state: ConversationState): void {
    state.isCreatingIssue = false;
    state.issueData = {};
    state.currentStep = IssueCreationStep.DETECTING_INTENT;
    state.hasAskedFor.clear();
    // Clear AI extraction fields
    state.extractedParameters = undefined;
    state.missingParameters = undefined;
    state.pendingValidation?.clear();
    console.log('🔄 Ready for next operation\n');
  }
}