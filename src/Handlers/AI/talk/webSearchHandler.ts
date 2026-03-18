import { Message } from 'src/API/OpenAi';
import { createChatCompletion } from 'src/API/MistralApi';
import { webSearchSummaries, webSearchFull } from 'src/Agent/Tools/WebSearch';
import { searchSynthesisSystemPrompt } from 'src/Handlers/AI/prompts';

/**
 * Runs a web search via MCP and synthesizes the raw results into a
 * natural, conversational reply. Raw content is never returned directly.
 */
export const handleWebSearch = async (
	query: string,
	mode: 'summary' | 'full',
	originalMessages: Message[]
): Promise<string> => {
	console.log(`[AI:tool] search_web → query="${query}" mode="${mode}"`);

	const { rawText } =
		mode === 'full' ? await webSearchFull(query) : await webSearchSummaries(query);

	console.log(
		`[AI:tool] search_web result length=${rawText.length} chars (mode=${mode})`
	);

	return synthesizeSearchResult(originalMessages, rawText, query);
};

const synthesizeSearchResult = async (
	originalMessages: Message[],
	rawSearchText: string,
	query: string
): Promise<string> => {
	const synthesisMessages: Message[] = [
		{ role: 'system', content: searchSynthesisSystemPrompt },
		...originalMessages,
		{
			role: 'user',
			content: `[Resultado da pesquisa por "${query}"]\n\n${rawSearchText}`,
		},
	];

	const result = await createChatCompletion({ messages: synthesisMessages });

	return (
		result.content ??
		'[#CalvoGPT]: Encontrei algumas informações mas não consegui sintetizá-las adequadamente.'
	);
};
