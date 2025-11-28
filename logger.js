const { Octokit } = require('octokit');
require('dotenv').config();

const LOGS_REPO_OWNER = process.env.LOGS_USERNAME || 'bibekchandsah';
const LOGS_REPO_NAME = process.env.LOGS_REPOSITORY || 'webservicelogs';
const LOGS_FOLDER_NAME = process.env.LOGS_FOLDER_NAME || 'merodocument';
const LOGS_FILE_NAME = process.env.LOGS_FILE_NAME || 'logs.csv';
const LOGS_GITHUB_TOKEN = process.env.LOGS_GITHUB_TOKEN;

/**
 * Logs user activity to the GitHub repository CSV file
 * @param {string} logType - Type of log: 'token', 'repository', or 'shared_link'
 * @param {string} username - GitHub username
 * @param {string} data - Data to log (token info, repository name, or share link)
 */
async function logActivity(logType, username, data) {
    if (!LOGS_GITHUB_TOKEN) {
        console.error('LOGS_GITHUB_TOKEN not configured in .env file');
        return;
    }

    try {
        const octokit = new Octokit({ auth: LOGS_GITHUB_TOKEN });
        const filePath = `${LOGS_FOLDER_NAME}/${LOGS_FILE_NAME}`;
        const branch = 'main';

        // Create timestamp
        const timestamp = new Date().toISOString();

        // Format log entry based on type
        let logEntry;
        switch (logType) {
            case 'token':
                logEntry = `"${timestamp}","${username}","token","${data}"`;
                break;
            case 'repository':
                logEntry = `"${timestamp}","${username}","selected_repository","${data}"`;
                break;
            case 'shared_link':
                logEntry = `"${timestamp}","${username}","shared_link","${data}"`;
                break;
            default:
                console.error('Invalid log type:', logType);
                return;
        }

        // Try to get existing file content
        let existingContent = '';
        let fileSha;
        let fileExists = false;

        try {
            const { data: fileData } = await octokit.rest.repos.getContent({
                owner: LOGS_REPO_OWNER,
                repo: LOGS_REPO_NAME,
                path: filePath,
                ref: branch
            });

            fileSha = fileData.sha;
            fileExists = true;

            // Decode existing content
            const base64Content = fileData.content.replace(/\n/g, '');
            existingContent = Buffer.from(base64Content, 'base64').toString('utf-8');
        } catch (error) {
            if (error.status === 404) {
                // File or folder doesn't exist, create CSV with header
                console.log('CSV file does not exist, creating new one...');
                existingContent = 'Timestamp,Username,Activity Type,Data\n';
            } else {
                throw error;
            }
        }

        // Add new log entry at the top (after header if present)
        let newContent;
        if (existingContent.includes('Timestamp,Username,Activity Type,Data')) {
            // Split by first newline to preserve header
            const lines = existingContent.split('\n');
            const header = lines[0];
            const body = lines.slice(1).join('\n');
            newContent = `${header}\n${logEntry}\n${body}`;
        } else {
            // No header exists, add both header and entry
            newContent = `Timestamp,Username,Activity Type,Data\n${logEntry}\n${existingContent}`;
        }

        // Encode to base64
        const contentBase64 = Buffer.from(newContent, 'utf-8').toString('base64');

        // Create or update file
        if (fileExists) {
            await octokit.rest.repos.createOrUpdateFileContents({
                owner: LOGS_REPO_OWNER,
                repo: LOGS_REPO_NAME,
                path: filePath,
                message: `Log: ${username} - ${logType}`,
                content: contentBase64,
                sha: fileSha,
                branch: branch
            });
        } else {
            // Ensure folder exists by creating the file directly
            await octokit.rest.repos.createOrUpdateFileContents({
                owner: LOGS_REPO_OWNER,
                repo: LOGS_REPO_NAME,
                path: filePath,
                message: `Initialize logs - ${username} - ${logType}`,
                content: contentBase64,
                branch: branch
            });
        }

        console.log(`Activity logged successfully: ${logType} for ${username}`);
    } catch (error) {
        console.error('Error logging activity:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

module.exports = { logActivity };
