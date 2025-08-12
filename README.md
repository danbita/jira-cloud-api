Jira API AI Agent - Project Documentation
Git: https://github.com/danbita/jira-cloud-api
Project Overview
This Jira API AI Agent is a cloud-based service that creates Jira issues through natural language processing. The system uses OpenAI's GPT-4 model to interpret user requests and automatically generate properly formatted Jira issues with appropriate project assignment, issue types, and priority levels.
API Details
Endpoint Information
Primary URL: https://us-central1-total-pad-467504-e2.cloudfunctions.net/jira-agent
 Alternative URL: https://jira-agent-aiovbl4w5q-uc.a.run.app
 Method: POST
 Content-Type: application/json
Request Structure
{
  "prompt": "Natural language description of the Jira issue request"
}

Request Validation Rules
The prompt field is mandatory
Prompt must be a non-empty string
Maximum character limit: 5,000 characters
Request body must be valid JSON format
Core Functionality
Intelligent Issue Creation
The system analyzes natural language prompts using GPT-4 to automatically extract and assign:
Project assignment based on keywords and context
Issue type classification (Bug, Task)
Priority level determination
Title and description generation
Automatic creation of actual Jira issues
Parameters
The agent looks for 5 parameters in order to create a new Jira issue:
Title
Project
Type
Priority
Description
Default Value Assignment
When specific parameters are not provided in the prompt, the system applies defaults:
Default Issue Type: Bug
Default Project: FV Demo (Issues)
Default Priority: Medium
Supported Projects
The agent supports four distinct Jira projects within the FanVoice workspace:
FV Demo (Issues)
 Keywords: "demo", "issues", "fv demo issues"
FV Demo (Product)
 Keywords: "demo product", "fv demo product"
FV Engineering
 Keywords: "engineering", "eng", "fv engineering"
FV Product
 Keywords: "product", "fv product"
Results
Upon execution of an API request, the API will send back a structured JSON response which is comprised of 6 components:
action: the action performed
success: whether or not the action was successfully executed
message: AI generated message summarizing the result of the request
issueData: complete details of the Jira issue created, including its key, url, and parameters
conversationHistory: a complete record of the user input and system response
processingTime: total duration of execution in milliseconds
Usage Examples
Basic Bug Report Creation
{
  "prompt": "Create a bug in FV Engineering called 'Login button not working' with description 'Users cannot authenticate on mobile devices'"
}

Simple Task Creation with Defaults
{
  "prompt": "Create a task called login issue about issues with logging into fanvoice"
}

Task Creation with only Parameter Definitions
{
  "prompt": "Title: 'Campaign not being created' Issue Description: 'I am unable to create a FanVoice campaign because the validation on last step isnt working even though the fields are filled'"
}


Response Format Specifications
Successful Issue Creation Response
{
    "action": "issue_created",
    "success": true,
    "message": "✅ Perfect! I've successfully created your Jira issue with key DPI-1091. The issue \"new test\" has been added to your FV Demo (Issues) project. You can view it at the link provided above. Is there anything else you'd like me to help you with?",
    "issueData": {
        "key": "DPI-1091",
        "url": "https://fankave.atlassian.net/browse/DPI-1091",
        "project": "FV Demo (Issues)",
        "summary": "new test",
        "issueType": "Bug",
        "priority": "Medium",
        "status": "To Do"
    },
    "conversationHistory": [
        {
            "role": "system",
            "content": "You are a helpful AI assistant that specializes in managing Jira issues. Your primary role is to help users create new Jira issues by gathering the necessary information in a conversational way.\n\nWhen a user wants to create a Jira issue, you should gather the following information:\n1. Project (which Jira project the issue belongs to)\n2. Issue Type (e.g., Bug, Task, Story, Epic)\n3. Title/Summary (brief description of the issue)\n4. Description (detailed description of the issue)\n5. Priority (e.g., Low, Medium, High, Critical)\n\nYou should ask for these details one at a time in a natural, conversational manner. Be friendly and helpful, and don't overwhelm the user by asking for everything at once.\n\nFor the bonus feature, you can also help users search for existing issues to check for duplicates.\n\nAlways be clear about what information you need and guide the user through the process step by step."
        },
        {
            "role": "user",
            "content": "can you please create a new issue called new test about testing the google cloud api's ability to create issues"
        },
        {
            "role": "assistant",
            "content": "✅ Perfect! I've successfully created your Jira issue with key DPI-1091. The issue \"new test\" has been added to your FV Demo (Issues) project. You can view it at the link provided above. Is there anything else you'd like me to help you with?"
        }
    ],
    "processingTime": 41399
}
  "processingTime": 2340
}

Error Response Format
{
    "action": "error",
    "message": "❌ Missing required information: title and description. Please provide both a title and description in your request.",
    "conversationHistory": [
        {
            "role": "system",
            "content": "You are a helpful AI assistant that specializes in managing Jira issues. Your primary role is to help users create new Jira issues by gathering the necessary information in a conversational way.\n\nWhen a user wants to create a Jira issue, you should gather the following information:\n1. Project (which Jira project the issue belongs to)\n2. Issue Type (e.g., Bug, Task, Story, Epic)\n3. Title/Summary (brief description of the issue)\n4. Description (detailed description of the issue)\n5. Priority (e.g., Low, Medium, High, Critical)\n\nYou should ask for these details one at a time in a natural, conversational manner. Be friendly and helpful, and don't overwhelm the user by asking for everything at once.\n\nFor the bonus feature, you can also help users search for existing issues to check for duplicates.\n\nAlways be clear about what information you need and guide the user through the process step by step."
        },
        {
            "role": "user",
            "content": "can you please create a new issue"
        },
        {
            "role": "assistant",
            "content": "❌ Missing required information: title and description. Please provide both a title and description in your request."
        }
    ],
    "processingTime": 2903
}


