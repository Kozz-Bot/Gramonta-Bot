import { createModule, createMethod } from 'kozz-module-maker';
import { getHeadlines, searchNews } from 'src/API/NewsApi';
import { usePremiumCommand } from 'src/Middlewares/Coins';
import { getFormattedDateAndTime } from 'src/Utils/date';
import { ErrorMessage, formatArticle, Help, NotFound } from './messages';

const queryNews = createMethod(
	'fallback',
	usePremiumCommand(
		10,
		async (requester, args) => {
			try {
				const query = requester.rawCommand?.query;

				if (!query) {
					requester.reply(Help());
					return false;
				}

				const articles = await searchNews(query, args?.page, args?.amount);

				if (!articles) {
					requester.reply(NotFound());
					return false;
				}

				articles.forEach(article => {
					const text = formatArticle({
						headline: `*${article.title.toUpperCase()}*`,
						sourceName: article.source.name,
						articleLink: article.url,
						date: getFormattedDateAndTime(new Date(article.publishedAt)),
					});
					requester.reply.withMedia.fromUrl(article.urlToImage, 'image', text);
				});
			} catch (e) {
				requester.reply(ErrorMessage({ error: e }));
				return false;
			}
		},
		'Você não possui CalvoCoins suficientes para esse comando'
	)
);

const getDaily = createMethod('today', async (requester, args: any) => {
	try {
		const news = await getHeadlines(args?.page, args?.amount);

		if (!news) return requester.reply(NotFound());

		const messages = news.map(article =>
			formatArticle({
				headline: `*${article.title.toUpperCase()}*`,
				sourceName: article.source.name,
				articleLink: article.url,
				date: getFormattedDateAndTime(new Date(article.publishedAt)),
			})
		);

		return requester.reply(
			messages.join(`____________________________________________\n`)
		);
	} catch (e) {
		requester.reply(ErrorMessage({ error: e }));
	}
});

const help = createMethod('help', requester => {
	requester.reply(Help());
});

export const startNewsHandler = () => {
	const instance = createModule({
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
		customSocketPath: process.env.SOCKET_PATH,
	}).resources.upsertResource('help', () => Help());

	return instance;
};
