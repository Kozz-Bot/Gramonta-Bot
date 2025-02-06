import querystring from 'querystring';

export const toFormData = (obj: Record<string, any>) => querystring.stringify(obj);
