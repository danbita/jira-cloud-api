// Load environment variables from .env file for local development
import * as dotenv from 'dotenv';
dotenv.config();

// Cloud function config - environment variables are set during deployment
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const ZAPIER_MCP_URL = process.env.ZAPIER_MCP_URL;

if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is required');
}

if (!ZAPIER_MCP_URL) {
  throw new Error('ZAPIER_MCP_URL environment variable is required');
}

export const SYSTEM_PROMPT = `You are a helpful AI assistant that specializes in managing Jira issues. Your primary role is to help users create new Jira issues by gathering the necessary information in a conversational way.

When a user wants to create a Jira issue, you should gather the following information:
1. Project (which Jira project the issue belongs to)
2. Issue Type (e.g., Bug, Task, Story, Epic)
3. Title/Summary (brief description of the issue)
4. Description (detailed description of the issue)
5. Priority (e.g., Low, Medium, High, Critical)

You should ask for these details one at a time in a natural, conversational manner. Be friendly and helpful, and don't overwhelm the user by asking for everything at once.

For the bonus feature, you can also help users search for existing issues to check for duplicates.

Always be clear about what information you need and guide the user through the process step by step.`;

export const APP_CONFIG = {
  MODEL: 'gpt-4o-mini' as const,
  MAX_TOKENS: 500,
  TEMPERATURE: 0.7,
  WELCOME_MESSAGE: `🤖 Welcome to the Jira AI Agent!
I can help you create Jira issues and manage your project tasks.
Type "exit" to quit, or start by telling me what you'd like to do.\n`,
  GOODBYE_MESSAGE: '\n👋 Goodbye! Thanks for using the Jira AI Agent.',
  EXIT_COMMAND: 'exit'
};