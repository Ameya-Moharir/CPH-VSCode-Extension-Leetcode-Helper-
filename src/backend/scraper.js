const { request, gql } = require('graphql-request');
const cheerio = require('cheerio');

class LeetCodeScraper {
    constructor() {
        this.endpoint = 'https://leetcode.com/graphql';
    }

    
    async fetchTestCases(url) {
        try {
            const titleSlug = this.extractTitleSlug(url);
            const query = gql`
                query getQuestionDetail($titleSlug: String!) {
                    question(titleSlug: $titleSlug) {
                        title
                        titleSlug
                        content
                        metaData
                        codeSnippets {
                            lang
                            langSlug
                            code
                        }
                    }
                }
            `;

            const variables = { titleSlug };
            const data = await request(this.endpoint, query, variables);
            const $ = cheerio.load(data.question.content);
            
            const testCases = this.parseTestCasesFromHTML($);
            
            // Parse the metadata and ensure it includes the title
            const metadata = {
                title: data.question.title || titleSlug,
                titleSlug: data.question.titleSlug,
                ...JSON.parse(data.question.metaData),
                expectedOutputs: testCases.outputs
            };

            // Transform codeSnippets to match the old templates format
            const templates = data.question.codeSnippets.map(snippet => ({
                langSlug: snippet.langSlug,
                lang: snippet.lang,
                code: snippet.code
            }));

            // Validate metadata before returning
            if (!metadata.title) {
                throw new Error('Failed to get problem title from LeetCode');
            }

            return {
                testCases: testCases.inputs,
                metadata: metadata,
                templates: templates
            };
        } catch (error) {
            if (error.message.includes('Failed to get problem title')) {
                throw error;
            }
            throw new Error(`Failed to fetch test cases: ${error.message}`);
        }
    }


    parseTestCasesFromHTML($) {
        const inputs = [];
        const outputs = [];
        
        $('pre').each((_, elem) => {
            const text = $(elem).text();
            if (text.includes('Input:') && text.includes('Output:')) {
                const [input, output] = this.parseTestCase(text);
                if (input && output) {
                    inputs.push(input);
                    outputs.push(output);
                }
            }
        });

        return { inputs, outputs };
    }

    parseTestCase(text) {
        const inputMatch = text.match(/Input:(.+?)Output:/s);
        const outputMatch = text.match(/Output:(.+?)(?:Explanation:|$)/s);

        if (!inputMatch || !outputMatch) return [null, null];

        const input = this.parseInput(inputMatch[1].trim());
        const output = outputMatch[1].trim();

        return [input, output];
    }

    parseInput(text) {
        const params = {};
        // Updated regex to handle negative numbers and single values
        const paramRegex = /(\w+)\s*=\s*(-?\d+|\[[^\]]+\]|"[^"]+")/g;
        let match;

        while ((match = paramRegex.exec(text)) !== null) {
            let [_, key, value] = match;
            
            // Handle negative numbers
            if (/^-?\d+$/.test(value)) {
                params[key] = value;
            }
            // Handle arrays
            else if (value.startsWith('[') && value.endsWith(']')) {
                value = value.replace(/\s+/g, '');
                while (value.startsWith('[[') && value.endsWith(']]')) {
                    value = value.slice(1, -1);
                }
                params[key] = value;
            }
            // Handle strings
            else {
                params[key] = value;
            }
        }

        return JSON.stringify(params);
    }
    parseTreeNode(str) {
        // Remove spaces and brackets
        str = str.replace(/\s+/g, '').slice(1, -1);
        if (!str) return 'null';
        
        const values = str.split(',');
        return JSON.stringify(values);
    }
    parseListNode(str) {
        // Remove spaces and brackets
        str = str.replace(/\s+/g, '').slice(1, -1);
        if (!str) return 'null';
        
        const values = str.split(',');
        return JSON.stringify(values);
    }




    processParam(paramStr, params) {
        if (!paramStr) return;
        
        const [key, value] = paramStr.split('=').map(s => s.trim());
        if (!key || !value) return;
        
        // Clean up array values - remove extra brackets
        if (value.startsWith('[') && value.endsWith(']')) {
            let cleanValue = value;
            // Remove extra outer brackets if present
            while (cleanValue.startsWith('[[') && cleanValue.endsWith(']]')) {
                cleanValue = cleanValue.slice(1, -1);
            }
            params[key] = cleanValue;
        } else {
            params[key] = value;
        }
    }

    parseOutput(text) {
        return text.trim();
    }

    extractTitleSlug(url) {
        const match = url.match(/problems\/([^/]+)/);
        return match ? match[1] : null;
    }
}

module.exports = { LeetCodeScraper };