const fs = require('fs').promises;
const path = require('path');
const vscode = require('vscode');

class FileHandler {
  constructor() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder found. Please open a folder first.');
    }
    this.workspaceRoot = workspaceFolders[0].uri.fsPath;
    this.cphDir = path.join(this.workspaceRoot, '.cph');
  }

  async ensureDirectoryExists(problemTitle) {
    // Create base .cph directory
    await fs.mkdir(this.cphDir, { recursive: true });

    // Create problem-specific directory
    const problemDir = path.join(this.cphDir, this.sanitizeProblemTitle(problemTitle));
    await fs.mkdir(problemDir, { recursive: true });

    // Create test_cases directory inside problem directory
    const testCasesDir = path.join(problemDir, 'test_cases');
    await fs.mkdir(testCasesDir, { recursive: true });

    return { problemDir, testCasesDir };
  }
  sanitizeProblemTitle(title) {
    return title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  async saveTestCases(data) {
    if (!data.metadata || !data.metadata.title) {
      throw new Error('Problem title is required in metadata');
    }

    const { problemDir, testCasesDir } = await this.ensureDirectoryExists(data.metadata.title);

    // Save each test case, including empty ones
    for (let i = 0; i < data.testCases.length; i++) {
      let testCase = data.testCases[i];

      // Ensure test case is in correct format even if empty
      try {
        // If it's a string, try to parse it
        if (typeof testCase === 'string') {
          testCase = JSON.parse(testCase);
        }

        // If parsing failed or test case is null/undefined, create an empty object
        if (!testCase) {
          testCase = {};
        }

        // Write the test case file, even if empty
        await fs.writeFile(
          path.join(testCasesDir, `input_${i + 1}.txt`),
          JSON.stringify(testCase)
        );
      } catch (e) {
        console.error(`Error processing test case ${i + 1}:`, e);
        // Still create the file with an empty object
        await fs.writeFile(
          path.join(testCasesDir, `input_${i + 1}.txt`),
          JSON.stringify({})
        );
      }
    }

    // Save metadata with all expected outputs
    const metadata = {
      ...data.metadata,
      expectedOutputs: Array.isArray(data.metadata.expectedOutputs)
        ? data.metadata.expectedOutputs
        : []
    };

    await fs.writeFile(
      path.join(problemDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    await fs.writeFile(
      path.join(problemDir, 'templates.json'),
      JSON.stringify(data.templates || [], null, 2)
    );

    return { problemDir, testCasesDir };
  }
  async saveTestOutput(problemTitle, testNumber, output, passed) {
    const { testCasesDir } = await this.ensureDirectoryExists(problemTitle);

    const outputData = {
      output: output.trim(),
      passed: passed
    };

    await fs.writeFile(
      path.join(testCasesDir, `output_${testNumber}.txt`),
      JSON.stringify(outputData, null, 2)
    );
  }


  async loadTestData(problemTitle) {
    if (!problemTitle) {
      throw new Error('Problem title is required to load test data');
    }

    const sanitizedTitle = this.sanitizeProblemTitle(problemTitle);
    const problemDir = path.join(this.cphDir, sanitizedTitle);
    const testCasesDir = path.join(problemDir, 'test_cases');

    try {
      // Ensure directories exist
      await fs.mkdir(testCasesDir, { recursive: true });

      // Read metadata first
      const metadata = JSON.parse(
        await fs.readFile(path.join(problemDir, 'metadata.json'), 'utf8')
      );

      // Read test cases
      const files = await fs.readdir(testCasesDir);
      const inputFiles = files.filter(f => f.startsWith('input_')).sort();

      const testCases = [];
      for (const file of inputFiles) {
        try {
          const content = await fs.readFile(path.join(testCasesDir, file), 'utf8');
          testCases.push(content);
        } catch (error) {
          console.error(`Error reading test case file ${file}:`, error);
          testCases.push(JSON.stringify({}));
        }
      }

      // Read templates
      let templates;
      try {
        templates = JSON.parse(
          await fs.readFile(path.join(problemDir, 'templates.json'), 'utf8')
        );
      } catch (error) {
        templates = [];
      }

      return { testCases, metadata, templates };
    } catch (error) {
      throw new Error(`Failed to load metadata: ${error.message}`);
    }
  }


  getProblemPath(problemTitle) {
    return path.join(this.cphDir, this.sanitizeProblemTitle(problemTitle));
  }
  async saveOutput(testNumber, output) {
    const testFilesDir = path.join(this.testCasesDir, 'test_cases');
    await fs.writeFile(
      path.join(testFilesDir, `output_${testNumber}.txt`),
      output
    );
  }


  async generateDriverCode(userCode, language, metadata) {
    if (!metadata || !metadata.params) {
      throw new Error('Invalid metadata');
    }
    return this.getLanguageDriver(language, metadata, userCode);
  }


  async getLanguageDriver(language, metadata, userCode) {
    const paramTypes = typeof metadata.params === 'string'
      ? JSON.parse(metadata.params)
      : metadata.params;

    const returnType = typeof metadata.return === 'string'
      ? JSON.parse(metadata.return)
      : metadata.return;

    switch (language) {
      case 'cpp':
        return this.getCppDriver(userCode, paramTypes, returnType, metadata);
      case 'python':
        return this.getPythonDriver(userCode, paramTypes, returnType, metadata);
      case 'java':
        return this.getJavaDriver(userCode, paramTypes, returnType, metadata);
      default:
        throw new Error(`Language ${language} not supported`);
    }
  }

  getCppDriver(userCode, paramTypes, returnType, metadata) {
    return `#include <bits/stdc++.h>
using namespace std;
// Data structure definitions
struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};

struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};

${userCode}

class Parser {
public:
    static vector<int> parseIntArray(const string& input) {
        vector<int> result;
        string cleaned = input;
        // Remove all whitespace
        cleaned.erase(remove_if(cleaned.begin(), cleaned.end(), ::isspace), cleaned.end());
        // Remove outer brackets
        if (cleaned.front() == '[') cleaned = cleaned.substr(1);
        if (cleaned.back() == ']') cleaned = cleaned.substr(0, cleaned.length() - 1);
        
        if(cleaned.empty()) return result;
        
        stringstream ss(cleaned);
        string item;
        while (getline(ss, item, ',')) {
            if (!item.empty()) {
                // Remove quotes if present
                if (item.front() == '"') item = item.substr(1);
                if (item.back() == '"') item = item.substr(0, item.length() - 1);
                result.push_back(stoi(item));
            }
        }
        return result;
    }
static ListNode* parseListNode(const string& input) {
            vector<int> values = parseIntArray(input);
            if (values.empty()) return nullptr;
            
            ListNode* head = new ListNode(values[0]);
            ListNode* current = head;
            for (size_t i = 1; i < values.size(); i++) {
                current->next = new ListNode(values[i]);
                current = current->next;
            }
            return head;
        }

        static TreeNode* parseTreeNode(const string& input) {
            vector<string> values = parseStringArray(input);
            if (values.empty()) return nullptr;

            TreeNode* root = new TreeNode(stoi(values[0]));
            queue<TreeNode*> q;
            q.push(root);
            
            size_t i = 1;
            while (!q.empty() && i < values.size()) {
                TreeNode* current = q.front();
                q.pop();

                if (i < values.size() && values[i] != "null") {
                    current->left = new TreeNode(stoi(values[i]));
                    q.push(current->left);
                }
                i++;

                if (i < values.size() && values[i] != "null") {
                    current->right = new TreeNode(stoi(values[i]));
                    q.push(current->right);
                }
                i++;
            }
            return root;
        }

    static vector<string> parseStringArray(const string& input) {
        vector<string> result;
        string cleaned = input;
        // Remove outer brackets
        if (cleaned.front() == '[') cleaned = cleaned.substr(1);
        if (cleaned.back() == ']') cleaned = cleaned.substr(0, cleaned.length() - 1);
        
        if(cleaned.empty()) return result;
        
        stringstream ss(cleaned);
        string item;
        while (getline(ss, item, ',')) {
            if (!item.empty()) {
                // Remove quotes
                if (item.front() == '"') item = item.substr(1);
                if (item.back() == '"') item = item.substr(0, item.length() - 1);
                result.push_back(item);
            }
        }
        return result;
    }

    static string parseParam(const string& line, const string& paramName) {
        string prefix = "\\"" + paramName + "\\":";
        size_t start = line.find(prefix);
        if (start == string::npos) return "";
        
        start += prefix.length();
        while (start < line.length() && (line[start] == ' ' || line[start] == '"')) start++;
        
        size_t end;
        if (line[start] == '[') {
            // Handle array
            int bracketCount = 1;
            end = start + 1;
            while (end < line.length() && bracketCount > 0) {
                if (line[end] == '[') bracketCount++;
                if (line[end] == ']') bracketCount--;
                end++;
            }
        } else {
            // Handle non-array
            end = line.find(',', start);
            if (end == string::npos) {
                end = line.find('}', start);
            }
            if (end == string::npos) end = line.length();
        }
        
        string value = line.substr(start, end - start);
        // Remove trailing quotes if present
        if (value.back() == '"') value = value.substr(0, value.length() - 1);
        return value;
    }
};
class MemoryManager {
    public:
        static void freeListNode(ListNode* head) {
            while (head) {
                ListNode* temp = head;
                head = head->next;
                delete temp;
            }
        }

        static void freeTreeNode(TreeNode* root) {
            if (!root) return;
            freeTreeNode(root->left);
            freeTreeNode(root->right);
            delete root;
        }
};
// Formatter class implementation remains the same...

int main() {
    string line;
    while (getline(cin, line)) {
        try {
            // Parse parameters
            ${this.generateParamParsing(metadata)}
            
            // Create solution instance and call function
            Solution solution;
            auto result = solution.${metadata.name}(${this.generateFunctionParams(metadata)});
            
            // Format and output result
            ${this.generateOutputFormatting(returnType)}
            // Cleanup if needed
            ${this.generateCleanup(returnType)}
        } catch (const exception& e) {
            cerr << "Error: " << e.what() << endl;
        }
    }
    return 0;
}`;
  }

  generateCleanup(returnType) {
    const mappedType = this.mapLeetCodeType(returnType.type);
    switch (mappedType) {
      case 'ListNode*':
        return 'MemoryManager::freeListNode(result);';
      case 'TreeNode*':
        return 'MemoryManager::freeTreeNode(result);';
      default:
        return '';
    }
  }
  
  generateParamParsing(metadata) {
    return metadata.params.map((param) => {
      const mappedType = this.mapLeetCodeType(param.type);
      switch (mappedType) {
        case 'vector<int>':
          return `
                string ${param.name}_str = Parser::parseParam(line, "${param.name}");
                vector<int> ${param.name} = Parser::parseIntArray(${param.name}_str);`;
        case 'int':
          return `
                string ${param.name}_str = Parser::parseParam(line, "${param.name}");
                int ${param.name} = stoi(${param.name}_str);`;
        case 'vector<string>':
          return `
                string ${param.name}_str = Parser::parseParam(line, "${param.name}");
                vector<string> ${param.name} = Parser::parseStringArray(${param.name}_str);`;
        case 'string':
          return `
                string ${param.name} = Parser::parseParam(line, "${param.name}");
                if (${param.name}[0] == '"') {
                    ${param.name} = ${param.name}.substr(1, ${param.name}.length() - 2);
                }`;
        case 'bool':
          return `
                string ${param.name}_str = Parser::parseParam(line, "${param.name}");
                bool ${param.name} = (${param.name}_str == "true" || ${param.name}_str == "1");`;
        case 'ListNode*':
          return `
                string ${param.name}_str = Parser::parseParam(line, "${param.name}");
                ListNode* ${param.name} = Parser::parseListNode(${param.name}_str);`;
        case 'TreeNode*':
          return `
                string ${param.name}_str = Parser::parseParam(line, "${param.name}");
                TreeNode* ${param.name} = Parser::parseTreeNode(${param.name}_str);`;
        default:
          throw new Error(`Unsupported parameter type: ${mappedType}`);
      }
    }).join('\n            ');
  }

  mapLeetCodeType(type) {
    // Clean up the type string - remove any optional markers and trim
    const cleanType = type.replace('?', '').trim();

    const typeMap = {
      'integer[]': 'vector<int>',
      'integer': 'int',
      'string[]': 'vector<string>',
      'string': 'string',
      'boolean': 'bool',
      'double': 'double',
      'list<integer>': 'vector<int>',
      'list<string>': 'vector<string>',
      'listnode': 'ListNode*',
      'ListNode': 'ListNode*',
      'ListNode*': 'ListNode*',
      'listnode*': 'ListNode*',
      'treenode': 'TreeNode*',
      'TreeNode': 'TreeNode*',
      'TreeNode*': 'TreeNode*',
      'treenode*': 'TreeNode*'
    };

    // Case-insensitive lookup
    const mappedType = typeMap[cleanType.toLowerCase()];
    if (!mappedType) {
      console.warn(`Warning: Unknown type mapping for ${type}`);
      return type;
    }
    return mappedType;
  }
  generateFunctionParams(metadata) {
    return metadata.params.map(param => param.name).join(', ');
  }
  generateOutputFormatting(returnType) {
    const mappedType = this.mapLeetCodeType(returnType.type);
    switch (mappedType) {
      case 'vector<int>':
        return `
          cout << "[";
          for(size_t i = 0; i < result.size(); i++) {
              if(i > 0) cout << ",";
              cout << result[i];
          }
          cout << "]" << endl;`;
      case 'vector<string>':
        return `
          cout << "[";
          for(size_t i = 0; i < result.size(); i++) {
              if(i > 0) cout << ",";
              cout << "\\"" << result[i] << "\\"";
          }
          cout << "]" << endl;`;
      case 'int':
        return 'cout << result << endl;';
      case 'string':
        return 'cout << "\\"" << result << "\\"" << endl;';
      case 'bool':
        return 'cout << (result ? "true" : "false") << endl;';
      case 'ListNode*':
        return `
          cout << "[";
          ListNode* current = result;
          bool first = true;
          while (current != nullptr) {
              if (!first) cout << ",";
              cout << current->val;
              first = false;
              current = current->next;
          }
          cout << "]" << endl;`;
      case 'TreeNode*':
        return `
          if (!result) {
              cout << "[]" << endl;
              return;
          }
          vector<string> output;
          queue<TreeNode*> q;
          q.push(result);
          while (!q.empty()) {
              TreeNode* node = q.front();
              q.pop();
              if (node) {
                  output.push_back(to_string(node->val));
                  q.push(node->left);
                  q.push(node->right);
              } else {
                  output.push_back("null");
              }
          }
          // Remove trailing nulls
          while (!output.empty() && output.back() == "null") {
              output.pop_back();
          }
          cout << "[";
          for (size_t i = 0; i < output.size(); i++) {
              if (i > 0) cout << ",";
              cout << output[i];
          }
          cout << "]" << endl;`;
      default:
        throw new Error(`Unsupported return type: ${mappedType}`);
    }
  }
  mapPythonType(type) {
    // Clean up the type string - remove any optional markers and trim
    const cleanType = typeof type === 'string' ? type.replace('?', '').trim() : type.type.replace('?', '').trim();

    const typeMap = {
      'integer[]': 'List[int]',
      'integer': 'int',
      'string[]': 'List[str]',
      'string': 'str',
      'boolean': 'bool',
      'double': 'float',
      'list<integer>': 'List[int]',
      'list<string>': 'List[str]',
      'listnode': 'Optional[ListNode]',
      'ListNode': 'Optional[ListNode]',
      'treenode': 'Optional[TreeNode]',
      'TreeNode': 'Optional[TreeNode]'
    };

    // Case-insensitive lookup
    const mappedType = typeMap[cleanType.toLowerCase()];
    if (!mappedType) {
      console.warn(`Warning: Unknown type mapping for ${cleanType}`);
      return 'Any';  // Default to Any for unknown types
    }
    return mappedType;
  }


  getPythonDriver(userCode, paramTypes, returnType, metadata) {
    return `import sys
import json
from typing import List, Optional, Any
from collections import deque

# Definition for singly-linked list
class ListNode:
  def __init__(self, val=0, next=None):
    self.val = val
    self.next = next

# Definition for a binary tree node
class TreeNode:
  def __init__(self, val=0, left=None, right=None):
    self.val = val
    self.left = left
    self.right = right

${userCode}

def parse_param(param_str, param_type):
  try:
    if not param_str or param_str == 'null' or param_str == '{}':
        if param_type in ['ListNode', 'listnode', 'TreeNode', 'treenode','ListNode*', 'listnode*', 'TreeNode*', 'treenode*']:
                return None
        elif param_type.endswith('[]'):
                return []
        elif param_type == 'integer':
                return 0
        elif param_type == 'string':
                return ""
        elif param_type == 'boolean':
                return False
        return None  
    if param_type.endswith('[]'):
        data = json.loads(param_str)
        return [int(x) if x is not None else None for x in data]
    elif param_type == 'integer':
        return int(param_str)
    elif param_type == 'string':
        return str(param_str)
    elif param_type == 'boolean':
        return param_str.lower() == 'true'
    elif param_type in ['ListNode', 'listnode','ListNode*', 'listnode*']:
        values = json.loads(param_str)
        if not values:
            return None
        dummy = ListNode(0)
        curr = dummy
        for val in values:
            if val is not None:
                curr.next = ListNode(val)
                curr = curr.next
        return dummy.next
    elif param_type in ['TreeNode', 'treenode','TreeNode*', 'treenode*']:
        values = json.loads(param_str)
        if not values:
            return None
        root = TreeNode(values[0])
        queue = deque([root])
        i = 1
        while queue and i < len(values):
            node = queue.popleft()
            if i < len(values) and values[i] is not None:
                node.left = TreeNode(values[i])
                queue.append(node.left)
            i += 1
            if i < len(values) and values[i] is not None:
                node.right = TreeNode(values[i])
                queue.append(node.right)
            i += 1
        return root
    return param_str
  except Exception as e:
    print(f"Error parsing parameter: {e}", file=sys.stderr)
    return None

def serialize_result(result, return_type):
  if result is None:
    return '[]' if return_type.endswith('[]') else 'null'
  if return_type.endswith('[]'):
    return json.dumps(result)
  elif isinstance(result, (ListNode, TreeNode)):
    values = []
    if isinstance(result, ListNode):
      curr = result
      while curr:
        values.append(curr.val)
        curr = curr.next
    else:  # TreeNode
      if not result:
        return '[]'
      queue = deque([result])
      while queue:
          node = queue.popleft()
          if node:
              values.append(node.val)
              queue.append(node.left)
              queue.append(node.right)
          else:
              values.append(None)
      while values and values[-1] is None:
          values.pop()
    return json.dumps(values)
  return json.dumps(result)

def main():
  for line in sys.stdin:
    try:
      data = json.loads(line)
      solution = Solution()

      # Parse parameters
      params = []
      ${this.generatePythonParamParsing(metadata)}

      # Call solution function
      result = solution.${metadata.name}(*params)

      # Serialize and print result
      print(serialize_result(result, "${returnType.type}"))

    except Exception as e:
      print(f"Error: {str(e)}", file=sys.stderr)
      sys.exit(1)

if __name__ == '__main__':
  main()`
  }
  generatePythonParamParsing(metadata) {
    return metadata.params.map((param, index) => {
      return `params.append(parse_param(data['${param.name}'], '${param.type}'))`
    }).join();
  }

  mapJavaType(type) {
    // Clean up the type string - remove any optional markers and trim
    const cleanType = typeof type === 'string' ? type.replace('?', '').trim() : type.type.replace('?', '').trim();
    
    const typeMap = {
      'integer[]': 'int[]',
      'Integer[]': 'int[]',
      'integer': 'int',
      'Integer': 'int',
      'string[]': 'String[]',
      'String[]': 'String[]',
      'string': 'String',
      'String': 'String',
      'boolean': 'boolean',
      'Boolean': 'boolean',
      'double': 'double',
      'Double': 'double',
      'list<integer>': 'List<Integer>',
      'list<string>': 'List<String>',
      'listnode': 'ListNode',
      'ListNode': 'ListNode',
      'treenode': 'TreeNode',
      'TreeNode': 'TreeNode'
    };
    
    const mappedType = typeMap[cleanType] || typeMap[cleanType.toLowerCase()];
    if (!mappedType) {
      console.warn(`Warning: Unknown Java type mapping for ${type}`);
      return 'Object';  // Default to Object for unknown types
    }
    return mappedType;
  }
  getJavaDriver(userCode, paramTypes, returnType, metadata) {
    if (!metadata || !metadata.params) {
      throw new Error('Invalid metadata: missing params');
    }

    return `import java.util.*;
import java.io.*;

// Data structure definitions
class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}

class TreeNode {
    int val;
    TreeNode left;
    TreeNode right;
    TreeNode() {}
    TreeNode(int val) { this.val = val; }
    TreeNode(int val, TreeNode left, TreeNode right) {
        this.val = val;
        this.left = left;
        this.right = right;
    }
}

${userCode}

class Main {
    public static void main(String[] args) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in))) {
            Solution solution = new Solution();
            String line;
            
            while ((line = reader.readLine()) != null && !line.trim().isEmpty()) {
                try {
                    // Parse input line as JSON object
                    Map<String, String> input = parseInput(line);
                    
                    // Parse parameters
                    ${this.generateJavaParamParsing(metadata)}
                    
                    // Call solution method
                    var result = solution.${metadata.name}(${metadata.params.map(p => p.name).join(', ')});
                    
                    // Format and print result
                    System.out.println(formatResult(result, "${metadata.return.type}"));
                    
                } catch (Exception e) {
                    System.err.println("Error processing test case: " + e.getMessage());
                    e.printStackTrace();
                }
            }
        } catch (IOException e) {
            System.err.println("IO Error: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private static Map<String, String> parseInput(String line) {
        Map<String, String> result = new HashMap<>();
        line = line.trim();
        if (line.startsWith("{")) line = line.substring(1);
        if (line.endsWith("}")) line = line.substring(0, line.length() - 1);
        
        StringBuilder key = new StringBuilder();
        StringBuilder value = new StringBuilder();
        boolean inKey = true;
        boolean inQuotes = false;
        int bracketCount = 0;
        
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            
            if (c == '"' && (i == 0 || line.charAt(i - 1) != '\\\\')) {  // Fixed backslash escaping
                inQuotes = !inQuotes;
                continue;  // Skip to next iteration after handling quote
            }
            
            if (c == '[' || c == '{') {
                bracketCount++;
            } else if (c == ']' || c == '}') {
                bracketCount--;
            }
            
            if (c == ':' && !inQuotes && bracketCount == 0 && inKey) {
                inKey = false;
            } else if (c == ',' && !inQuotes && bracketCount == 0 && !inKey) {
                String keyStr = key.toString().trim().replace("\\"", "");
                String valueStr = value.toString().trim();
                result.put(keyStr, valueStr);
                key = new StringBuilder();
                value = new StringBuilder();
                inKey = true;
            } else if (inKey && !Character.isWhitespace(c)) {
                key.append(c);
            } else if (!inKey && !Character.isWhitespace(c)) {
                value.append(c);
            }
        }
        
        // Add the last key-value pair
        if (key.length() > 0) {
            String keyStr = key.toString().trim().replace("\\"", "");
            String valueStr = value.toString().trim();
            result.put(keyStr, valueStr);
        }
        
        return result;
    }

    private static int[] parseIntArray(String value) {
        if (value == null || value.equals("null")) return null;
        value = value.trim();
        if (value.startsWith("[")) value = value.substring(1);
        if (value.endsWith("]")) value = value.substring(0, value.length() - 1);
        if (value.isEmpty()) return new int[0];
        
        String[] parts = value.split(",");
        int[] result = new int[parts.length];
        for (int i = 0; i < parts.length; i++) {
            result[i] = Integer.parseInt(parts[i].trim());
        }
        return result;
    }

    private static String[] parseStringArray(String value) {
        if (value == null || value.equals("null")) return null;
        value = value.trim();
        if (value.startsWith("[")) value = value.substring(1);
        if (value.endsWith("]")) value = value.substring(0, value.length() - 1);
        if (value.isEmpty()) return new String[0];
        
        String[] parts = value.split(",");
        for (int i = 0; i < parts.length; i++) {
            parts[i] = parts[i].trim();
            if (parts[i].startsWith("\\"")) parts[i] = parts[i].substring(1);
            if (parts[i].endsWith("\\"")) parts[i] = parts[i].substring(0, parts[i].length() - 1);
        }
        return parts;
    }

    private static ListNode parseListNode(String value) {
        int[] values = parseIntArray(value);
        if (values == null || values.length == 0) return null;
        
        ListNode dummy = new ListNode(0);
        ListNode current = dummy;
        for (int val : values) {
            current.next = new ListNode(val);
            current = current.next;
        }
        return dummy.next;
    }

    private static TreeNode parseTreeNode(String value) {
        if (value == null || value.equals("null") || value.equals("[]")) return null;
        
        value = value.trim();
        if (value.startsWith("[")) value = value.substring(1);
        if (value.endsWith("]")) value = value.substring(0, value.length() - 1);
        if (value.isEmpty()) return null;
        
        String[] parts = value.split(",");
        Queue<TreeNode> queue = new LinkedList<>();
        TreeNode root = new TreeNode(Integer.parseInt(parts[0].trim()));
        queue.offer(root);
        
        int i = 1;
        while (!queue.isEmpty() && i < parts.length) {
            TreeNode current = queue.poll();
            
            if (i < parts.length && !parts[i].trim().equals("null")) {
                current.left = new TreeNode(Integer.parseInt(parts[i].trim()));
                queue.offer(current.left);
            }
            i++;
            
            if (i < parts.length && !parts[i].trim().equals("null")) {
                current.right = new TreeNode(Integer.parseInt(parts[i].trim()));
                queue.offer(current.right);
            }
            i++;
        }
        
        return root;
    }

    private static String formatResult(Object result, String type) {
        if (result == null) {
            return "null";
        }

        if (type.endsWith("[]")) {
            if (result instanceof int[]) {
                return Arrays.toString((int[]) result).replace(" ", "");
            } else if (result instanceof String[]) {
                StringBuilder sb = new StringBuilder("[");
                String[] arr = (String[]) result;
                for (int i = 0; i < arr.length; i++) {
                    if (i > 0) sb.append(",");
                    sb.append("\\"").append(arr[i]).append("\\"");
                }
                return sb.append("]").toString();
            } else if (result instanceof List) {
                return result.toString().replace(" ", "");
            }
        } else if (result instanceof ListNode) {
            return listNodeToString((ListNode) result);
        } else if (result instanceof TreeNode) {
            return treeNodeToString((TreeNode) result);
        } else if (result instanceof String) {
            return "\\"" + result + "\\"";
        } else if (result instanceof Boolean || result instanceof Integer) {
            return result.toString();
        }
        
        return result.toString();
    }

    private static String listNodeToString(ListNode node) {
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        while (node != null) {
            if (!first) sb.append(",");
            sb.append(node.val);
            first = false;
            node = node.next;
        }
        return sb.append("]").toString();
    }

    private static String treeNodeToString(TreeNode root) {
        if (root == null) return "[]";
        
        List<String> values = new ArrayList<>();
        Queue<TreeNode> queue = new LinkedList<>();
        queue.offer(root);
        
        while (!queue.isEmpty()) {
            TreeNode node = queue.poll();
            if (node == null) {
                values.add("null");
            } else {
                values.add(String.valueOf(node.val));
                queue.offer(node.left);
                queue.offer(node.right);
            }
        }
        
        // Remove trailing nulls
        while (!values.isEmpty() && values.get(values.size() - 1).equals("null")) {
            values.remove(values.size() - 1);
        }
        
        return values.toString().replace(" ", "");
    }
}`;
}
generateJavaParamParsing(metadata) {
  return metadata.params.map(param => {
    const javaType = this.mapJavaType(param.type);
    const parsing = this.getJavaParamParser(javaType, param.name);
    return `${javaType} ${param.name} = ${parsing};`;
  }).join('\n                    ');
}
getJavaParamParser(javaType, paramName) {
  switch (javaType) {
    case 'int[]':
      return `parseIntArray(input.get("${paramName}"))`;
    case 'String[]':
      return `parseStringArray(input.get("${paramName}"))`;
    case 'int':
      return `Integer.parseInt(input.get("${paramName}").trim())`;
    case 'String':
      return `input.get("${paramName}").trim().replace("\\"", "")`;
    case 'boolean':
      return `Boolean.parseBoolean(input.get("${paramName}").trim())`;
    case 'ListNode':
      return `parseListNode(input.get("${paramName}"))`;
    case 'TreeNode':
      return `parseTreeNode(input.get("${paramName}"))`;
    default:
      return `input.get("${paramName}")`;
  }
}
}

module.exports = { FileHandler };