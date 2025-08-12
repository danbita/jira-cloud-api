import { MCPClient } from './mcpClient';
import { 
  IssueData, 
  ZapierJiraCreateIssueArgs, 
  ZapierJiraSearchArgs, 
  ZapierJiraProjectSearchArgs,
  JiraIssue,
  JiraProject,
  MCPToolResult 
} from './types';

export class ZapierService {
  private mcpClient: MCPClient;
  private isInitialized: boolean = false;
  private availableProjects: JiraProject[] = [];

  constructor() {
    this.mcpClient = new MCPClient();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.mcpClient.connect();
      this.isInitialized = true;
      console.log('🚀 Zapier service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Zapier service:', error);
      throw error;
    }
  }

  async testConnection(): Promise<void> {
    console.log('🚀 Zapier service connection ready');
  }

  async fetchAndCacheProjects(): Promise<void> {
    if (!this.isInitialized) {
      console.warn('⚠️  Cannot fetch projects: Zapier service not initialized');
      return;
    }

    // No longer need to cache projects - we validate them dynamically
    console.log('📂 Using dynamic project validation');
  }

  // Remove unused methods
  private getFallbackProjects(): JiraProject[] {
    return [];
  }

  private displayAvailableProjects(): void {
    // No longer needed with dynamic validation
  }

  getAvailableProjects(): JiraProject[] {
    return [...this.availableProjects];
  }

  // NEW: Validate and find a project by user input
  async validateAndFindProject(userInput: string): Promise<JiraProject | null> {
    if (!userInput || !this.isInitialized) {
      return null;
    }

    console.log(`🔍 Validating project: "${userInput}"`);

    try {
      // First try direct search with the user input
      const result = await this.mcpClient.callTool({
        name: 'jira_software_cloud_find_project',
        arguments: {
          instructions: `Search for project: ${userInput}`,
          name: userInput
        }
      });

      const responseText = this.extractResponseText(result);
      const projects = this.parseProjectResponse(responseText);
      
      if (projects.length > 0) {
        const project = projects[0]; // Take the first match
        console.log(`✅ Found project: ${project.name} (${project.key})`);
        return project;
      }

      // If direct search fails, try common abbreviation expansions
      const expandedNames = this.expandAbbreviation(userInput);
      
      for (const expandedName of expandedNames) {
        console.log(`🔍 Trying expanded name: "${expandedName}"`);
        
        const expandedResult = await this.mcpClient.callTool({
          name: 'jira_software_cloud_find_project',
          arguments: {
            instructions: `Search for project: ${expandedName}`,
            name: expandedName
          }
        });

        const expandedResponseText = this.extractResponseText(expandedResult);
        const expandedProjects = this.parseProjectResponse(expandedResponseText);
        
        if (expandedProjects.length > 0) {
          const project = expandedProjects[0];
          console.log(`✅ Found project via expansion: ${project.name} (${project.key})`);
          return project;
        }
      }

      console.log(`❌ No project found for: "${userInput}"`);
      return null;

    } catch (error) {
      console.error(`❌ Error validating project "${userInput}":`, error);
      return null;
    }
  }

  // Parse the project response from find_project tool
  private parseProjectResponse(responseText: string): JiraProject[] {
    try {
      const response = JSON.parse(responseText);
      
      if (response.results && Array.isArray(response.results) && response.results.length > 0) {
        return response.results.map((project: any) => ({
          key: project.key || project.name,
          name: project.name || project.key,
          id: project.id || project.key,
          type: project.projectTypeKey || 'software'
        }));
      }
      
      return [];
    } catch (error) {
      console.error('Error parsing project response:', error);
      return [];
    }
  }

  // Expand common abbreviations to full project names
  private expandAbbreviation(input: string): string[] {
    const lowerInput = input.toLowerCase().trim();
    const expansions: string[] = [];

    // Common project name patterns
    const expansionMap: { [key: string]: string[] } = {
      'demo': ['FV Demo (Issues)', 'FV Demo (Product)'],
      'product': ['FV Product', 'FV Demo (Product)'],
      'engineering': ['FV Engineering'],
      'eng': ['FV Engineering'],
      'fv': ['FV Product', 'FV Engineering', 'FV Demo (Issues)', 'FV Demo (Product)']
    };

    if (expansionMap[lowerInput]) {
      expansions.push(...expansionMap[lowerInput]);
    }

    // Try with "FV" prefix if not already present
    if (!lowerInput.startsWith('fv')) {
      expansions.push(`FV ${input}`);
    }

    return expansions;
  }

  formatProjectSelectionPrompt(): string {
    if (this.availableProjects.length === 0) {
      return "Which project should this issue be created in? (Please provide the project key)";
    }

    const projectList = this.availableProjects
      .map((p, i) => `${i + 1}. ${p.key}${p.name !== p.key ? ` (${p.name})` : ''}`)
      .join('\n   ');

    return `Which project should this issue be created in?\n\nAvailable projects:\n   ${projectList}\n\nYou can use the project key, name, or common abbreviations (demo, eng, product):`;
  }

  async cleanup(): Promise<void> {
    if (this.isInitialized) {
      await this.mcpClient.disconnect();
      this.isInitialized = false;
    }
  }

  async createJiraIssue(issueData: IssueData): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Zapier service not initialized. Call initialize() first.');
    }

    // Validate required fields
    if (!issueData.project) {
      throw new Error('Project is required to create a Jira issue');
    }
    if (!issueData.title) {
      throw new Error('Title/Summary is required to create a Jira issue');
    }

    const args: ZapierJiraCreateIssueArgs = {
      instructions: `Create a new Jira issue with the following details. IMPORTANT: Do not change or guess any values, use exactly what is specified:
        - Project: ${issueData.project}
        - Summary: ${issueData.title}
        - Description: ${issueData.description || 'No description provided'}
        - Issue Type: ${issueData.issueType || 'Task'}
        - Priority: ${issueData.priority || 'Medium'} (MANDATORY: Set priority to exactly "${issueData.priority}", do not use Medium or any other value)`,
      project: issueData.project,
      summary: issueData.title,
      description: issueData.description,
      issueType: issueData.issueType,
      priority: issueData.priority
    };

    try {
      console.log('📝 Creating Jira issue via Zapier MCP...');
      
      const result = await this.mcpClient.callTool({
        name: 'jira_software_cloud_create_issue',
        arguments: args
      });

      if (result.isError) {
        throw new Error(this.extractErrorMessage(result));
      }

      const responseText = this.extractResponseText(result);
      const parsedResult = this.parseCreatedIssueResponse(responseText);
      
      return parsedResult;
      
    } catch (error) {
      console.error('💥 Exception during Jira issue creation:', error);
      throw new Error(`Failed to create Jira issue: ${error}`);
    }
  }

  async searchJiraIssues(query: string): Promise<any[]> {
    if (!this.isInitialized) {
      throw new Error('Zapier service not initialized. Call initialize() first.');
    }

    const args: ZapierJiraSearchArgs = {
      instructions: `Search for Jira issues related to: "${query}"`,
      summary: query
    };

    try {
      const result = await this.mcpClient.callTool({
        name: 'jira_software_cloud_find_issue',
        arguments: args
      });

      if (result.isError) {
        throw new Error(this.extractErrorMessage(result));
      }

      const responseText = this.extractResponseText(result);
      return this.parseSearchResults(responseText);
      
    } catch (error) {
      console.error('❌ Failed to search Jira issues:', error);
      throw new Error(`Failed to search Jira issues: ${error}`);
    }
  }

  async findSimilarIssues(title: string, description?: string): Promise<any[]> {
    if (!this.isInitialized) {
      throw new Error('Zapier service not initialized. Call initialize() first.');
    }

    const searchTerms = [title];
    if (description) {
      const descWords = description.split(' ')
        .filter(word => word.length > 3)
        .slice(0, 3);
      searchTerms.push(...descWords);
    }

    const searchQuery = searchTerms.join(' ');
    
    try {
      const results = await this.searchJiraIssues(searchQuery);
      
      const similarIssues = results.filter(issue => 
        this.calculateSimilarity(title, issue.summary || '') > 0.3
      );

      return similarIssues;
      
    } catch (error) {
      console.error('Error finding similar issues:', error);
      return [];
    }
  }

  // Utility methods
  private extractResponseText(result: MCPToolResult): string {
    if (result.content && result.content.length > 0) {
      return result.content[0].text || '';
    }
    return '';
  }

  private extractErrorMessage(result: MCPToolResult): string {
    const text = this.extractResponseText(result);
    return text || 'Unknown error occurred';
  }

  private parseCreatedIssueResponse(responseText: string): any {
    try {
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        return this.parseTextResponse(responseText);
      }
      
      const execution = responseData.execution;
      const results = responseData.results;
      const issueUrl = responseData.issueUrl;
      
      if (execution && execution.status === 'SUCCESS') {
        let issueData = null;
        
        if (results && Array.isArray(results) && results.length > 0) {
          issueData = results[0];
        }
        
        const result = {
          success: true,
          key: issueData?.key || null,
          url: issueUrl || this.constructIssueUrl(issueData?.key, responseData),
          issueId: issueData?.id,
          project: issueData?.fields?.project?.name || issueData?.fields?.project?.key,
          summary: issueData?.fields?.summary,
          status: issueData?.fields?.status?.name,
          priority: issueData?.fields?.priority?.name,
          issueType: issueData?.fields?.issuetype?.name,
          created: issueData?.fields?.created,
          response: this.buildSuccessMessage(issueData, issueUrl)
        };
        
        return result;
        
      } else if (execution && (execution.status === 'FAILED' || execution.status === 'ERROR')) {
        return {
          success: false,
          error: `Zapier execution failed with status: ${execution.status}`,
          response: execution.error || 'Unknown execution error'
        };
      }
      
      return this.parseTextResponse(responseText);
      
    } catch (error) {
      return {
        success: false,
        error: `JSON parsing error: ${(error as Error).message}`,
        response: responseText
      };
    }
  }

  private buildSuccessMessage(issueData: any, issueUrl: string): string {
    if (!issueData) {
      return 'Issue created successfully (details not available)';
    }
    
    const parts = [];
    parts.push(`Issue ${issueData.key} created successfully`);
    
    if (issueData.fields?.project?.name) {
      parts.push(`in project "${issueData.fields.project.name}"`);
    }
    
    if (issueData.fields?.summary) {
      parts.push(`with summary "${issueData.fields.summary}"`);
    }
    
    if (issueData.fields?.issuetype?.name) {
      parts.push(`as ${issueData.fields.issuetype.name}`);
    }
    
    if (issueData.fields?.priority?.name) {
      parts.push(`with ${issueData.fields.priority.name} priority`);
    }
    
    return parts.join(' ');
  }

  private constructIssueUrl(issueKey: string, responseData?: any): string | null {
    if (!issueKey) return null;
    
    let domain = 'fankave.atlassian.net';
    
    if (responseData) {
      const responseStr = JSON.stringify(responseData);
      const domainMatch = responseStr.match(/https:\/\/([^.]+\.atlassian\.net)/);
      if (domainMatch) {
        domain = domainMatch[1];
      }
    }
    
    return `https://${domain}/browse/${issueKey}`;
  }

  private parseTextResponse(responseText: string): any {
    try {
      const hasSuccess = responseText.toLowerCase().includes('success') ||
                        responseText.includes('"status":"SUCCESS"') ||
                        responseText.toLowerCase().includes('created');
      
      const hasFailure = responseText.toLowerCase().includes('error') ||
                        responseText.toLowerCase().includes('failed') ||
                        responseText.includes('"status":"FAILED"') ||
                        responseText.toLowerCase().includes('unable');
      
      const issueKeyMatch = responseText.match(/([A-Z]+-\d+)/);
      const issueKey = issueKeyMatch ? issueKeyMatch[1] : null;
      
      const urlMatch = responseText.match(/(https?:\/\/[^\s"]+browse\/[A-Z]+-\d+)/);
      const issueUrl = urlMatch ? urlMatch[1] : null;
      
      const success = (hasSuccess || issueKey !== null) && !hasFailure;
      
      return {
        success: success,
        key: issueKey,
        url: issueUrl,
        response: success ? 
          `Text parsing detected successful creation${issueKey ? ` of ${issueKey}` : ''}` :
          'Text parsing could not confirm successful creation',
        error: hasFailure ? 'Text parsing detected failure indicators' : null
      };
      
    } catch (error) {
      return {
        success: false,
        response: responseText,
        error: `Text parsing error: ${(error as Error).message}`
      };
    }
  }

  private parseSearchResults(responseText: string): any[] {
    try {
      const results = [];
      const lines = responseText.split('\n');
      
      for (const line of lines) {
        const issueKeyMatch = line.match(/([A-Z]+-\d+)/);
        if (issueKeyMatch) {
          results.push({
            key: issueKeyMatch[1],
            summary: line.replace(issueKeyMatch[1], '').trim(),
            raw: line
          });
        }
      }
      
      return results;
    } catch (error) {
      return [];
    }
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.toLowerCase().split(' '));
    const words2 = new Set(str2.toLowerCase().split(' '));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  isReady(): boolean {
    return this.isInitialized && this.mcpClient.isClientConnected();
  }
}