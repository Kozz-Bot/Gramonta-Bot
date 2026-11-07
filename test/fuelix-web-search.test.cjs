const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const observability = require('../dist/API/AiObservability');
const FuelIXApi = require('../dist/API/FuelIXApi').default;
const { talkTools } = require('../dist/Handlers/AI/tools');

async function withProvider(post, run) {
	const originalCreate = axios.create;
	const originalLog = observability.logAiUsage;
	const originalKey = process.env.FUELIX_API_KEY;
	const events = [];
	process.env.FUELIX_API_KEY = 'test-placeholder';
	axios.create = () => ({ post });
	observability.logAiUsage = async event => events.push(event);
	try {
		await run(events);
	} finally {
		axios.create = originalCreate;
		observability.logAiUsage = originalLog;
		if (originalKey === undefined) delete process.env.FUELIX_API_KEY;
		else process.env.FUELIX_API_KEY = originalKey;
	}
}

test('hosted search returns a reply with clickable, deduplicated citation URLs', async () => {
	await withProvider(
		async (url, body) => {
			assert.equal(url, '/responses');
			assert.ok(body.tools.some(tool => tool.type === 'web_search'));
			assert.ok(!body.tools.some(tool => tool.name === 'search_web'));
			assert.ok(
				body.tools.some(
					tool => tool.type === 'function' && tool.name === 'generate_speech'
				)
			);
			return {
				data: {
					id: 'response-1',
					output: [
						{ type: 'web_search_call', status: 'completed' },
						{
							type: 'message',
							content: [
								{
									type: 'output_text',
									text: '[#CalvoGPT]: Achei a documentação. https://example.com/already',
									annotations: [
										{ type: 'url_citation', url: 'https://example.com/docs' },
										{ type: 'url_citation', url: 'https://example.com/docs' },
										{ type: 'url_citation', url: 'https://example.com/already' },
										{ type: 'url_citation', url: 'javascript:invalid' },
									],
								},
							],
						},
					],
				},
			};
		},
		async events => {
			const response = await FuelIXApi.createToolResponseCompletion({
				messages: [{ role: 'user', content: 'Pesquise a documentação' }],
				tools: talkTools,
			});
			assert.deepEqual(response.tool_calls, []);
			assert.equal(
				response.content,
				'[#CalvoGPT]: Achei a documentação. https://example.com/already\n\nFontes:\nhttps://example.com/docs'
			);
			assert.equal(events[0].metadata.webSearchCalls, 1);
		}
	);
});

test('search can coexist with local tools and conversation continuation', async () => {
	await withProvider(
		async (url, body) => {
			assert.equal(body.previous_response_id, 'previous-response');
			assert.deepEqual(body.input, [
				{
					type: 'function_call_output',
					call_id: 'context-call',
					output: 'Contexto do chat',
				},
			]);
			return {
				data: {
					id: 'response-2',
					output: [
						{ type: 'web_search_call', status: 'completed' },
						{
							type: 'function_call',
							call_id: 'audio-call',
							name: 'generate_speech',
							arguments: '{"input":"Resultado da pesquisa"}',
						},
					],
				},
			};
		},
		async () => {
			const response = await FuelIXApi.createToolResponseCompletion({
				messages: [
					{
						role: 'tool',
						tool_call_id: 'context-call',
						content: 'Contexto do chat',
					},
				],
				tools: talkTools,
				previousResponseId: 'previous-response',
			});
			assert.equal(response.tool_calls.length, 1);
			assert.equal(response.tool_calls[0].function.name, 'generate_speech');
			assert.equal(response.responseId, 'response-2');
		}
	);
});

test('provider failure is reported without trying a legacy MCP fallback', async () => {
	const failure = new Error('Provider unavailable');
	let calls = 0;
	await withProvider(
		async () => {
			calls++;
			throw failure;
		},
		async events => {
			await assert.rejects(
				FuelIXApi.createToolResponseCompletion({ messages: [], tools: talkTools }),
				error => error === failure
			);
			assert.equal(calls, 1);
			assert.equal(events[0].status, 'error');
		}
	);
});

test('response input can replay original messages and local function calls when a continuation ID is absent', async () => {
	await withProvider(
		async (_url, body) => {
			assert.equal(body.previous_response_id, undefined);
			assert.deepEqual(body.input, [
				{ role: 'user', content: 'Crie um evento e um lembrete' },
				{
					type: 'function_call',
					call_id: 'first',
					name: 'chat_create_event',
					arguments: '{}',
				},
				{
					type: 'function_call_output',
					call_id: 'first',
					output: '{"status":"submitted"}',
				},
			]);
			return {
				data: {
					id: 'next',
					output: [
						{
							type: 'message',
							content: [
								{ type: 'output_text', text: 'Continuando com o lembrete.' },
							],
						},
					],
				},
			};
		},
		async () => {
			await FuelIXApi.createToolResponseCompletion({
				messages: [
					{ role: 'user', content: 'Crie um evento e um lembrete' },
					{
						type: 'function_call',
						call_id: 'first',
						name: 'chat_create_event',
						arguments: '{}',
					},
					{ role: 'tool', tool_call_id: 'first', content: '{"status":"submitted"}' },
				],
				tools: talkTools,
			});
		}
	);
});

test('on-demand media tool output and attributed frames are sent together as multimodal Responses input', async () => {
	await withProvider(
		async (url, body) => {
			assert.equal(body.previous_response_id, 'media-response');
			assert.deepEqual(body.input[0], {
				type: 'function_call_output',
				call_id: 'media-call',
				output: '{"success":true}',
			});
			assert.equal(body.input[1].role, 'user');
			assert.equal(body.input[1].content[0].type, 'input_text');
			assert.match(body.input[1].content[0].text, /Ana/);
			assert.deepEqual(body.input[1].content[1], {
				type: 'input_image',
				image_url: 'https://example.invalid/frame.jpg',
			});
			return {
				data: {
					id: 'answer',
					output: [
						{
							type: 'message',
							content: [{ type: 'output_text', text: 'Entendi o vídeo.' }],
						},
					],
				},
			};
		},
		async () => {
			const result = await FuelIXApi.createToolResponseCompletion({
				previousResponseId: 'media-response',
				tools: talkTools,
				messages: [
					{
						role: 'tool',
						tool_call_id: 'media-call',
						name: 'get_chat_media',
						content: '{"success":true}',
					},
					{
						role: 'user',
						content: [
							{
								type: 'text',
								text: 'Mídia de Ana, resposta a question, transcrição: Olá.',
							},
							{ type: 'image_url', image_url: 'https://example.invalid/frame.jpg' },
						],
					},
				],
			});
			assert.match(result.content, /Entendi/);
		}
	);
});
