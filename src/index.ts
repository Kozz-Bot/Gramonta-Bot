import dotenv from 'dotenv';
dotenv.config();

import * as handleStarters from './Handlers/';

Object.values(handleStarters).forEach(starter => {
	starter();
});
