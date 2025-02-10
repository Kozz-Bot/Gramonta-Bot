import fs from 'fs/promises';

export const checkAndCreateFile = async (filePath: string) => {
	try {
		await fs.access(filePath, fs.constants.F_OK);
	} catch (err) {
		try {
			await fs.writeFile(filePath, '');
		} catch (writeErr) {
			console.error(`Error creating file: ${writeErr}`);
		}
	}
};
