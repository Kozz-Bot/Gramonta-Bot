import axios from 'axios';
import Memo from 'html-memo';

const newsApi = axios.create({
	baseURL: 'https://newsapi.org/v2/',
	headers: {
		//Free API key
		Authorization: process.env.NEWS_API_KEY,
	},
});

const hundrethOfADay = 846000;

const newsMemo = new Memo(json => JSON.parse(json) as NewsResponse, hundrethOfADay);

/**
 * Stringifies JSON so that it can be compatible with
 * my lib `html-memo`.
 * [TODO]: Adapt html-memo so that it can memoize anything
 */
newsApi.interceptors.response.use(response => {
	response.data = JSON.stringify(response.data);
	return response;
});

export type NewsResponse = {
	status: 'ok';
	totalResults: number;
	articles: Article[];
};

export type Article = {
	source: {
		id: string;
		name: string;
	};
	authod: string;
	title: string;
	description: string | null;
	url: string;
	urlToImage: string;
	publishedAt: string;
	content: string | null;
};

export const getHeadlines = async (page = 0, count = 5) => {
	const fetchHeadlines = async () => {
		// response.data is string because of html-memo
		const { data } = await newsApi.get<string>('/top-headlines', {
			params: {
				country: 'br',
			},
		});

		return data;
	};

	const newsResponse = await newsMemo.getWebsite('daily-headlines', fetchHeadlines);

	if (!newsResponse?.articles.length) {
		return undefined;
	}

	const sortedArticles = sortArticles(newsResponse.articles).filter(
		article => article.title !== '[Removed]'
	);

	const startIndex = page * count;
	const endIndex = startIndex + count;
	return sortedArticles.slice(startIndex, endIndex);
};

export const searchNews = async (query: string, page = 0, count = 5) => {
	const fetchSearch = async () => {
		const { data } = await newsApi.get<string>('/everything', {
			params: {
				language: 'pt',
				q: query,
			},
		});

		return data;
	};

	const newsResponse = await newsMemo.getWebsite(`search-${query}`, fetchSearch);

	if (!newsResponse?.articles.length) {
		return undefined;
	}

	const sortedArticles = sortArticles(newsResponse.articles).filter(
		article => article.title !== '[Removed]'
	);

	const startIndex = page * count;
	const endIndex = startIndex + count;
	return sortedArticles.slice(startIndex, endIndex);
};

const sortArticles = (articles: Article[]) => {
	// for some reason, my typescript is not ok with `[].toSorted()` method;
	const articlesCopy = [...articles];
	articlesCopy.sort(
		(a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
	);
	return articlesCopy.reverse();
};
