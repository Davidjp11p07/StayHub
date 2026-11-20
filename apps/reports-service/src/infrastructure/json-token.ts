export function assertNoDuplicateJsonKeys(source: string): void {
    let index = 0;
    const whitespace = (): void => { while (/\s/.test(source[index] ?? ''))
        index += 1; };
    const parseString = (): string => {
        const start = index;
        index += 1;
        while (index < source.length) {
            if (source[index] === '\\')
                index += 2;
            else if (source[index++] === '"')
                break;
        }
        return JSON.parse(source.slice(start, index)) as string;
    };
    const parseValue = (): void => {
        whitespace();
        if (source[index] === '{') {
            index += 1;
            whitespace();
            const keys = new Set<string>();
            if (source[index] === '}') {
                index += 1;
                return;
            }
            while (index < source.length) {
                whitespace();
                const key = parseString();
                if (keys.has(key))
                    throw new Error('Duplicate JSON key');
                keys.add(key);
                whitespace();
                index += 1;
                parseValue();
                whitespace();
                if (source[index] === '}') {
                    index += 1;
                    return;
                }
                index += 1;
            }
            throw new Error('Malformed JSON object');
        }
        if (source[index] === '[') {
            index += 1;
            whitespace();
            if (source[index] === ']') {
                index += 1;
                return;
            }
            while (index < source.length) {
                parseValue();
                whitespace();
                if (source[index] === ']') {
                    index += 1;
                    return;
                }
                index += 1;
            }
            throw new Error('Malformed JSON array');
        }
        if (source[index] === '"') {
            parseString();
            return;
        }
        while (index < source.length && !/[\s,\]}]/.test(source[index] ?? ''))
            index += 1;
        if (index === source.length && source.length === 0)
            throw new Error('Malformed JSON value');
    };
    parseValue();
    whitespace();
    if (index !== source.length)
        throw new Error('Malformed JSON');
}
