import OpenAI from 'openai';
import * as readline from 'readline';
import { ConversationState, IssueData } from './types';
import { SYSTEM_PROMPT } from './config';

export class Chatbot {
  private openai: OpenAI;
  private rl: readline.Interface;
  private conversationHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Add system message to conversation history
    this.conversationHistory.push({
      role: 'system',
      content: SYSTEM_PROMPT
    });
  }

  async getUserInput(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  }

  async getAIResponse(): Promise<string | null> {
    try {
      console.log('🤔 Thinking...');
      
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: this.conversationHistory,
        max_tokens: 500,
        temperature: 0.7,
        stream: false,
      });

      const response = completion.choices[0]?.message?.content;
      
      // Clear the "Thinking..." line
      process.stdout.write('\r\x1b[K');
      
      return response || null;

    } catch (error) {
      console.error('Error getting AI response:', error);
      return 'Sorry, I encountered an error. Please try again.';
    }
  }

  addUserMessage(content: string): void {
    this.conversationHistory.push({
      role: 'user',
      content
    });
  }

  addAssistantMessage(content: string): void {
    this.conversationHistory.push({
      role: 'assistant',
      content
    });
  }

  getConversationHistory(): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return [...this.conversationHistory];
  }

  close(): void {
    this.rl.close();
  }
}