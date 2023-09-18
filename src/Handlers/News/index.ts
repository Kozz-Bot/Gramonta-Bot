import { createModule, createMethod } from 'kozz-module-maker';
import { loadTemplates } from 'kozz-module-maker/dist/Message';
import { getHeadlines, searchNews } from 'src/API/NewsApi';
import { usePremiumCommand } from 'src/Middlewares/Coins';
import { getFormattedDateAndTime } from 'src/Utils/date';

const templatePath = 'src/Handlers/News/messages.kozz.md';
const templatesHelper = loadTemplates(templatePath);

const queryNews = createMethod(
	'fallback',
	usePremiumCommand(
		10,
		async (requester, args) => {
			try {
				const query = `${requester.rawCommand.method} ${
					requester.rawCommand.immediateArg || ''
				}`.trim();

				if (!query) {
					requester.reply.withTemplate('Help');
					return false;
				}

				const articles = await searchNews(query, args?.page, args?.amount);

				if (!articles) {
					requester.reply.withTemplate('NotFound');
					return false;
				}

				articles.forEach(article => {
					templatesHelper
						.getTextFromTemplate('Article', {
							headline: `*${article.title.toUpperCase()}*`,
							source_name: article.source.name,
							article_link: article.url,
							date: getFormattedDateAndTime(new Date(article.publishedAt)),
						})
						.then(text => {
							requester.reply.withMedia.fromUrl(
								article.urlToImage,
								'image',
								`${text}`
							);
						});
				});
			} catch (e) {
				requester.reply.withTemplate('Error', {
					error: e,
				});
				return false;
			}
		},
		'Você não possui CalvoCoins suficientes para esse comando'
	)
);

const getDaily = createMethod('today', async (requester, args: any) => {
	try {
		const news = await getHeadlines(args?.page, args?.amount);

		if (!news) return requester.reply.withTemplate('NotFound');

		const messages = await Promise.all(
			news.map(article =>
				templatesHelper.getTextFromTemplate('Article', {
					headline: `*${article.title.toUpperCase()}*`,
					source_name: article.source.name,
					article_link: article.url,
					date: getFormattedDateAndTime(new Date(article.publishedAt)),
				})
			)
		);

		return requester.reply(
			messages.join(`____________________________________________\n`)
		);
	} catch (e) {
		requester.reply.withTemplate('Error', {
			error: e,
		});
	}
});

const help = createMethod('help', requester => {
	requester.reply.withTemplate('Help');
});

export const startNewsHandler = () =>
	createModule({
		commands: {
			boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
			methods: {
				...queryNews,
				...getDaily,
				...help,
			},
		},
		name: 'news',
		address: `${process.env.GATEWAY_URL}`,
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);
