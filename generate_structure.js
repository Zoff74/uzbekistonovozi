//generate_structure.js   ЗАПУСК: node generate_structure.js

// generate_structure.js
const fs = require('fs');
const path = require('path');

const IGNORE_LIST = ['.github', '.next', '.vscode', 'node_modules', '.git', 'structure.txt', 'project_structure_clean.txt'];
const OUTPUT_FILE = 'structure.txt';

let outputBuffer = 'ПОЛНАЯ СТРУКТУРА ПРОЕКТА:\n.\n';

function buildTree(dir, prefix = '') {
    let entries;
    try {
        entries = fs.readdirSync(dir);
    } catch (e) {
        return; // Обработка закрытых системных папок
    }

    entries = entries.filter(entry => !IGNORE_LIST.includes(entry));

    const dirs = [];
    const files = [];

    entries.forEach(entry => {
        const fullPath = path.join(dir, entry);
        try {
            if (fs.statSync(fullPath).isDirectory()) {
                dirs.push(entry);
            } else {
                files.push(entry);
            }
        } catch (e) {}
    });

    // Сортировка для предсказуемости
    dirs.sort();
    files.sort();

    const finalOrder = [...dirs, ...files];

    finalOrder.forEach((name, index) => {
        const fullPath = path.join(dir, name);
        const isLast = index === finalOrder.length - 1;
        const isDirectory = fs.statSync(fullPath).isDirectory();

        outputBuffer += `${prefix}${isLast ? '└── ' : '├── '}${name}\n`;

        if (isDirectory) {
            buildTree(fullPath, prefix + (isLast ? '    ' : '│   '));
        }
    });
}

console.log("Generating structure...");
buildTree(process.cwd());
fs.writeFileSync(OUTPUT_FILE, outputBuffer, 'utf8');
console.log(`✅ Результат сохранен в: ${OUTPUT_FILE}`);