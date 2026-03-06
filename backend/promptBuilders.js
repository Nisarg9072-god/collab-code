/**
 * Prompt Builders to generate context-aware prompts for each AI action.
 * Optimized for clean code output and workspace awareness.
 */
export const buildPrompt = (action, context) => {
  const { fileName, language, selection, fullCode, userPrompt, problems, nearbyFiles, workspaceId, fileList, workspaceName } = context;

  const workspaceInfo = workspaceName
    ? `Workspace: ${workspaceName}${fileList && fileList.length > 0 ? ` (${fileList.length} files: ${fileList.slice(0, 8).join(', ')}${fileList.length > 8 ? '...' : ''})` : ''}`
    : '';

  const contextInfo = [
    `Current File: ${fileName}`,
    `Language: ${language}`,
    workspaceInfo,
    nearbyFiles ? `Nearby Files: ${nearbyFiles.join(', ')}` : '',
    problems && problems.length > 0 ? `Active Issues: ${JSON.stringify(problems.map(p => ({ line: p.line, msg: p.message })))}` : ''
  ].filter(Boolean).join('\n');

  const systemInstruction = "You are an expert software engineer. Provide high-quality, idiomatic code. When asked to generate or fix code, provide the code within a single markdown code block.";

  switch (action) {
    case 'explain':
      return `${systemInstruction}\n\nContext:\n${contextInfo}\n\nExplain the following ${language} code logic and purpose clearly:\n\n\`\`\`${language}\n${selection || fullCode}\n\`\`\``;

    case 'generate':
      return `${systemInstruction}\n\nContext:\n${contextInfo}\n\nTask: ${userPrompt}\n\nGenerate the necessary ${language} code. Provide only the code block.`;

    case 'fix':
      return `${systemInstruction}\n\nContext:\n${contextInfo}\n\nTask: Fix the following ${language} code. Address any reported issues if present.\n\nCode to fix:\n\`\`\`${language}\n${selection || fullCode}\n\`\`\``;

    case 'refactor':
      return `${systemInstruction}\n\nContext:\n${contextInfo}\n\nTask: Refactor the following ${language} code for better readability and performance.\n\nCode:\n\`\`\`${language}\n${selection || fullCode}\n\`\`\``;

    case 'test':
      return `${systemInstruction}\n\nContext:\n${contextInfo}\n\nTask: Generate comprehensive unit tests for the following ${language} code.\n\nCode:\n\`\`\`${language}\n${selection || fullCode}\n\`\`\``;

    case 'review':
      return `You are an expert code reviewer. Analyze the following ${language} code from file "${fileName}" and identify bugs, code smells, security issues, and style problems.

Context:\n${contextInfo}

Code to review:
\`\`\`${language}\n${fullCode}\n\`\`\`

Respond ONLY with a valid JSON array (no markdown wrapping, no extra text). Each element must have exactly these fields:
- "line": integer (1-based line number where the issue is, or 0 if file-level)
- "severity": one of "error", "warning", "info"
- "message": string describing the issue
- "fix": string with a concise suggested fix or corrected code snippet (empty string if no specific fix)

Example output format:
[{"line":5,"severity":"error","message":"Potential null dereference","fix":"Add null check before accessing .id"},{"line":12,"severity":"warning","message":"Unused variable 'temp'","fix":"Remove the variable declaration"}]

If the code looks clean, return an empty array: []`;

    case 'commitMessage': {
      const { changedFiles = [], diffSummary = '' } = context;
      const filesList = changedFiles.length > 0 ? changedFiles.join(', ') : 'unknown files';
      const boundedDiff = diffSummary.length > 3000 ? diffSummary.slice(0, 3000) + '\n... (truncated)' : diffSummary;
      return `You are an expert software engineer writing Git commit messages.

Changed files: ${filesList}

Diff (may be truncated):
${boundedDiff}

Write 1 to 3 concise, professional commit messages for these changes.
Use imperative mood (e.g. "Add", "Fix", "Update", "Refactor").
Follow conventional commits format where appropriate (e.g. "feat:", "fix:", "refactor:").

Respond ONLY with a valid JSON array of strings (no markdown, no extra text):
["First commit message", "Second alternative message"]

If only one message makes sense, return a single-element array.`;
    }

    case 'semanticSearch': {
      const { query: searchQuery = '', fileList: files = [], workspaceName: wsName = '' } = context;
      const fileNames = (files || []).slice(0, 120).join('\n');
      return `You are a code navigation assistant for a software project${wsName ? ` called "${wsName}"` : ''}.

The developer is searching with this intent: "${searchQuery}"

Available files in the workspace:
${fileNames}

Identify the files most likely relevant to this intent. Think about what code concept or feature is being asked about, then match it to the file names.

Respond ONLY with a valid JSON array (no markdown, no extra text). Each item must have:
- "fileName": the exact file name from the list above
- "reason": one concise sentence explaining why this file is relevant

Return at most 8 results, ordered by relevance (most relevant first).
If no files seem relevant, return an empty array: []

Example: [{"fileName":"auth/loginHandler.ts","reason":"Handles user authentication and login logic"}]`;
    }

    case 'multiFileReview': {
      const { currentFile = {}, relatedFiles = [] } = context;
      const currentBlock = `=== ${currentFile.name || 'current'} (${currentFile.language || ''}) ===\n${currentFile.content || ''}`;
      const relatedBlocks = relatedFiles.map(f =>
        `=== ${f.name} (${f.language || ''}) — excerpt ===\n${f.excerpt || ''}`
      ).join('\n\n');

      return `You are a senior software architect performing a cross-file code review.

Review the following files together and identify cross-cutting concerns, integration risks, and architectural issues.

${currentBlock}

${relatedBlocks ? `Related files:\n${relatedBlocks}` : ''}

Respond ONLY with a valid JSON object (no markdown, no extra text) with exactly these fields:
- "summary": string — 2-3 sentence overall assessment
- "crossFileIssues": array of objects with fields:
    - "files": array of file name strings involved in the issue
    - "severity": "error" | "warning" | "info"
    - "message": string describing the cross-file issue
    - "suggestion": string with a recommended fix or improvement
- "architectureSuggestions": array of strings — high-level design improvement suggestions
- "integrationRisks": array of strings — potential runtime or integration issues

If the code looks well-integrated, return empty arrays for the issues fields but always include a summary.

Example: {"summary":"...","crossFileIssues":[{"files":["api.ts","auth.ts"],"severity":"warning","message":"Token not validated","suggestion":"Add JWT check in middleware"}],"architectureSuggestions":["Extract shared types"],"integrationRisks":["No error boundary around WebSocket"]}`;
    }

    case 'projectSummary': {
      const { workspaceName: wsName2 = '', fileList: files2 = [], currentFileName = '' } = context;
      const fileNames2 = (files2 || []).slice(0, 100).join('\n');
      const folders = [...new Set((files2 || []).map(f => f.includes('/') ? f.split('/')[0] : '(root)'))].slice(0, 20).join(', ');

      return `You are a senior software engineer documenting a codebase for a new contributor.

Project: "${wsName2 || 'Unknown Project'}"
Currently open file: ${currentFileName || 'none'}
Top-level folders: ${folders}

All files:
${fileNames2}

Respond ONLY with a valid JSON object (no markdown, no extra text) with exactly these fields:
- "overview": string — 3-4 sentences describing what this project does and its tech stack
- "mainFiles": array of objects { "file": string, "role": string } — at most 8 most important files
- "keyFlows": array of strings — important user/data flows
- "risks": array of strings — visible technical risks or concerns
- "nextSteps": array of strings — recommended improvements for a new contributor`;
    }

    case 'prSummary': {
      const { changedFiles = [], diffSummary = '', branchName = '', workspaceName: wsName3 = '' } = context;
      const boundedDiff = diffSummary.length > 4000 ? diffSummary.slice(0, 4000) + '\n... (truncated)' : diffSummary;
      const filesList = changedFiles.slice(0, 20).join('\n');
      
      return `You are a senior software engineer writing a Pull Request description.

Project: "${wsName3 || 'Unknown'}"
Branch: ${branchName || 'feature branch'}

Changed files:
${filesList}

Diff (may be truncated):
${boundedDiff}

Write a professional, concise PR description for these changes.

Respond ONLY with a valid JSON object (no markdown, no extra text) with exactly these fields:
- "title": string — a clear, concise PR title (e.g. "feat: Add user authentication flow")
- "summary": string — 2-3 sentences describing what this PR does and why
- "keyChanges": array of strings — bullet points of the most important changes (max 8)
- "testingChecklist": array of strings — what reviewers should verify/test (max 6)
- "risksAndNotes": array of strings — breaking changes, migration notes, or risks (empty array if none)

Example: {"title":"feat: Add JWT authentication","summary":"Implements JWT-based auth...","keyChanges":["Added login endpoint","Added token refresh"],"testingChecklist":["Test login with valid credentials","Test expired token handling"],"risksAndNotes":["Requires AUTH_SECRET env var"]}`;
    }

    case 'releaseNotes': {
      const { commitMessages = [], diffSummary = '', version = '', workspaceName: wsName4 = '' } = context;
      const boundedDiff = diffSummary.length > 3000 ? diffSummary.slice(0, 3000) + '\n... (truncated)' : diffSummary;
      const commits = commitMessages.slice(0, 30).join('\n');
      
      return `You are a technical writer generating release notes for a software project.

Project: "${wsName4 || 'Unknown'}"
Version: ${version || 'next'}

Recent commit messages:
${commits || '(no commits provided)'}

Recent changes (diff, may be truncated):
${boundedDiff || '(no diff provided)'}

Generate concise, developer-friendly release notes.

Respond ONLY with a valid JSON object (no markdown, no extra text) with exactly these fields:
- "releaseSummary": string — 2-3 sentence overview of this release
- "features": array of strings — new features or capabilities added (empty if none)
- "fixes": array of strings — bugs fixed or issues resolved (empty if none)
- "improvements": array of strings — performance, refactor, or DX improvements (empty if none)
- "knownIssues": array of strings — known limitations or issues (empty if none)
- "upgradeNotes": array of strings — migration steps or breaking changes (empty if none)

Example: {"releaseSummary":"v1.2.0 adds real-time collaboration...","features":["Real-time cursor sharing"],"fixes":["Fixed token expiry bug"],"improvements":["Reduced bundle size by 20%"],"knownIssues":[],"upgradeNotes":["Run npm install after update"]}`;
    }

    case 'repoHealth': {
      const { workspaceName: wsName5 = '', fileList: files5 = [], projectSummary: pSummary = '', commitMessages: cMsgs = [] } = context;
      const fileNames5 = (files5 || []).slice(0, 100).join('\n');
      const recentCommits = (cMsgs || []).slice(0, 20).join('\n');
      const folders5 = [...new Set((files5 || []).map(f => f.includes('/') ? f.split('/')[0] : '(root)'))].slice(0, 20).join(', ');
      
      return `You are a senior software architect performing a repository health review.

Project: "${wsName5 || 'Unknown'}"
Top-level folders: ${folders5}

Files:
${fileNames5}

${recentCommits ? `Recent commit messages (for context):\n${recentCommits}` : ''}
${pSummary ? `\nProject overview:\n${pSummary}` : ''}

Assess the overall health of this repository based on the file structure, naming conventions, and inferred architecture.

Respond ONLY with a valid JSON object (no markdown, no extra text) with exactly these fields:
- "healthScore": integer 1-10 (overall health rating)
- "healthLabel": string — one of "Poor", "Fair", "Good", "Excellent"
- "architectureConcerns": array of strings — structural or design issues
- "maintainabilityRisks": array of strings — things that will make maintenance harder
- "testingGaps": array of strings — testing concerns or missing coverage areas
- "consistencyIssues": array of strings — naming, style, or structural inconsistencies
- "topRecommendations": array of strings — top 5 recommended improvements (ordered by priority)

Example: {"healthScore":7,"healthLabel":"Good","architectureConcerns":["Mixed concerns in index.js"],"maintainabilityRisks":["No TypeScript on backend"],"testingGaps":["No test files found for auth module"],"consistencyIssues":["Some files use camelCase, others snake_case"],"topRecommendations":["Add backend TypeScript","Write auth module tests"]}`;
    }

    case 'chat':
    default:
      return `${systemInstruction}\n\nContext:\n${contextInfo}\n\nUser Question: ${userPrompt}\n\nRelevant Code:\n\`\`\`${language}\n${selection || fullCode}\n\`\`\``;
  }
};
