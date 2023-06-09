import { Configuration, OpenAIApi } from 'openai';
import * as files from './files_system.js';
import { performCommit, commitInstructions } from './commit_system.js';
import { promises as fs } from 'fs';

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const chat = async ({ model, messages }) => {
  const logFn =
    'logs/' +
    (new Date().toISOString().replace(/:/g, '-') +
      Math.random().toString(36).substring(7) +
      '.json');
  await fs.writeFile(logFn, JSON.stringify({ messages, model }, null, 2));
  const response = await openai.createChatCompletion({ model, messages });
  const message = response.data.choices[0].message;
  await fs.writeFile(
    logFn,
    JSON.stringify({ messages, model, response: message }, null, 2),
  );
  return message;
};

const run = async ({ model, prompt, project_dir }) => {
  console.log({ model, project_dir });
  const fileDetails = await files.listFiles({ project_dir });
  const fileNames = fileDetails.map((file) => file.path);
  let messages = [
    { role: 'system', content: files.system },
    { role: 'user', content: 'files:\n' + fileNames.join('\n') },
    { role: 'user', content: prompt },
  ];

  let message = await chat({ model, messages });

  if (message.content.includes('--CAT:')) {
    for (const line of message.content.split('\n')) {
      if (line.startsWith('--CAT:')) {
        const filename = line.split(':')[1].trim();
        console.log('catting file', filename);
        let content = await files.getFile({
          filename: filename.trim(),
          project_dir,
        });
        content = `${files.file_start(
          filename.trim(),
        )}${content}${files.file_end(filename.trim())}`;
        messages.push({ role: 'user', content });
        messages.push({
          role: 'user',
          content: 'ok, please generate the code',
        });
      }
      message = await chat({ model, messages });
    }
  }

  messages.push(message);

  // todo: if the bot asks for a --CAT: file1, ... return that, and re-run the previous prompt

  console.log({ message });
  const changes = files.performOperations(message.content, project_dir);
  console.log({ changes });

  if (changes.length === 0) {
    return;
  }
  messages.push({ role: 'user', content: commitInstructions });

  message = await chat({ model, messages });

  await performCommit({ message: message.content, changes }, project_dir);
};

export default run;
