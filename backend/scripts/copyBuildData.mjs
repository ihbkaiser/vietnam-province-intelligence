import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(scriptDirectory, '..');

const copies = [
  ['src/data/realProvinceFeatures.json', 'dist/data/realProvinceFeatures.json'],
  ['src/data/province_in4', 'dist/data/province_in4'],
  ['src/data/pdf', 'dist/data/pdf'],
  ['src/data/tinhThanhVnProvinceReference.json', 'dist/data/tinhThanhVnProvinceReference.json'],
  ['src/data/questionBank.json', 'dist/data/questionBank.json'],
  ['src/data/studyQuestionBank.json', 'dist/data/studyQuestionBank.json'],
  ['src/data/studyQuestionBank.meta.json', 'dist/data/studyQuestionBank.meta.json']
];

for (const [source, destination] of copies) {
  const sourcePath = path.resolve(backendDirectory, source);
  if (!fs.existsSync(sourcePath)) continue;
  const destinationPath = path.resolve(backendDirectory, destination);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.cpSync(sourcePath, destinationPath, { recursive: true, force: true });
}

console.log('Copied backend data files to dist/data.');
