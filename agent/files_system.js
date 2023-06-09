import fs from 'fs';
import path from 'path';
import * as diff from 'diff';

export const file_start = (filename) => `-- FILE_START: ${filename}`;
export const file_end = (filename) => `-- FILE_END: ${filename}`;
// const patch_start = (filename) => `-- PATCH_START: ${filename}`;
// const patch_end = (filename) => `-- PATCH_END: ${filename}`;

// To patch files, return a diff of the file that can be applied using the 'patch' command.

// ${patch_start('DEMO')}
// @@ -1,3 +1,3 @@
//  Demo File
// -Name:
// +Name: DevGPT
//  Last Line of Demo File
// ${patch_end('DEMO')}

export const system = `You are DevGPT, a open source indie developer AI.

To create or replace entire files, wrap the contents of both files in the strings '${file_start(
  'filename',
)}' and '${file_end('<filename>')}'.

${file_start('DEMO')}
Demo File
Name:
Last Line of Demo File
${file_end('DEMO')}

To delete files, use:
--DELETE: DEMO

To rename files, use:
--RENAME: old_filename new_filename

You will be given a task and a list of files that already exist.  If you need to see any files ask for them using the 'CAT' command before coding.

--CAT: file1
--CAT: file2
`;

export function performOperations(inputText, project_dir) {
  console.log({ project_dir });

  function write(dest, content) {
    const newBase = path.dirname(dest);
    if (!fs.existsSync(newBase)) {
      fs.mkdirSync(newBase, { recursive: true });
    }

    fs.writeFileSync(dest, content);
  }

  const changes = [];
  const lines = inputText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    console.log(line);

    if (line.startsWith('-- FILE_START:')) {
      const filename = line.split(':')[1].trim();
      console.log('creating file', filename);
      const filePath = path.join(project_dir, filename);
      console.log(filePath);
      let fileContents = '';

      i++;

      while (i < lines.length && !lines[i].startsWith('-- FILE_END:')) {
        fileContents += lines[i] + '\n';
        i++;
      }

      write(filePath, fileContents);
      changes.push({ add: filename });
    } else if (line.startsWith('-- PATCH_START:')) {
      const filename = line.split(':')[1].trim();
      console.log('patching file', filename);
      const filePath = path.join(project_dir, filename);
      let patchContents = '';

      i++;

      while (i < lines.length && !lines[i].startsWith('-- PATCH_END:')) {
        patchContents += lines[i] + '\n';
        i++;
      }

      const fileContents = fs.readFileSync(filePath, 'utf8');
      const patchedContents = diff.applyPatch(fileContents, patchContents);
      console.log({ fileContents, patchContents, patchedContents });
      write(filePath, patchedContents);
      changes.push({ add: filename });
    } else if (line.startsWith('-- DELETE:')) {
      const filename = line.split(':')[1].trim();
      console.log('deleting file', filename);
      const filePath = path.join(project_dir, filename);
      fs.unlinkSync(filePath);
      changes.push({ rm: filename });
    } else if (line.startsWith('-- RENAME:')) {
      const [oldFilename, newFilename] = line.split(':')[1].trim().split(' ');
      console.log('renaming file', oldFilename, 'to', newFilename);
      const oldFilePath = path.join(project_dir, oldFilename);
      const newFilePath = path.join(project_dir, newFilename);
      fs.renameSync(oldFilePath, newFilePath);
      changes.push({ rm: oldFilename, add: newFilename });
    }
  }

  return changes;
}

export async function getFile({ filename, project_dir }) {
  filename = path.join(project_dir, filename);
  return fs.promises.readFile(filename, 'utf8');
}

// Recursive function to list files in a directory
export async function listFiles({ project_dir, current_dir = null }) {
  if (!current_dir) {
    current_dir = project_dir;
  }
  console.log('listing files in', project_dir);
  try {
    console.log({ project_dir, current_dir });
    const items = await fs.promises.readdir(current_dir);
    const fileDetails = [];

    for (const itemPath of items) {
      console.log({ itemPath });
      const fullPath = path.join(current_dir, itemPath);
      const stats = await fs.promises.stat(fullPath);

      if (stats.isFile()) {
        const relativePath = path.relative(project_dir, fullPath);
        fileDetails.push({
          path: relativePath,
          ctime: stats.ctime.toISOString(),
          mtime: stats.mtime.toISOString(),
          size: stats.size,
        });
      } else if (
        stats.isDirectory() &&
        itemPath !== 'node_modules' &&
        itemPath !== '.git'
      ) {
        const nestedFiles = await listFiles({
          project_dir,
          current_dir: fullPath,
        });
        fileDetails.push(...nestedFiles);
      }
    }

    return fileDetails;
  } catch (err) {
    console.error(err);
    throw err;
  }
}
