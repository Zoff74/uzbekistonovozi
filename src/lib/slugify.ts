import { nanoid } from 'nanoid';
//src\lib\slugify.ts
/**
 * Генерирует уникальный юзернейм, сохраняя исходные символы (кириллицу или латиницу),
 * делает первые буквы заглавными и добавляет уникальный суффикс для избежания конфликтов в БД.
 * @param text Исходное имя пользователя.
 * @returns Имя с уникальным суффиксом (например, "Иван Иванов-skfhm").
 */
export function slugify(text: string): string {
    if (!text) return nanoid(6);

    // Приводим первую букву каждого слова к заглавной, а остальные оставляем как есть
    const formattedBase = text
        .trim()
        .replace(/\s+/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    const uniqueSuffix = nanoid(5); // Уникальный хвост (например, skfhm)
    return formattedBase ? `${formattedBase}-${uniqueSuffix}` : uniqueSuffix;
}