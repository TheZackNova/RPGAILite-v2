export interface OpenAiCompatibleResponseResult {
    text: string;
    totalTokens: number;
}

const extractTextFromPayload = (payload: any): string => {
    const firstChoice = payload?.choices?.[0];
    const content = firstChoice?.delta?.content ?? firstChoice?.message?.content ?? firstChoice?.text ?? '';
    return typeof content === 'string' ? content : '';
};

const parsePayload = (payloadText: string): any | null => {
    try {
        return JSON.parse(payloadText);
    } catch {
        return null;
    }
};

const consumeStreamChunk = (
    chunkText: string,
    currentText: string,
    currentTokens: number
): OpenAiCompatibleResponseResult => {
    let nextText = currentText;
    let nextTokens = currentTokens;

    const lines = chunkText
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

    for (const line of lines) {
        const payloadText = line.startsWith('data:') ? line.slice(5).trim() : line;
        if (!payloadText || payloadText === '[DONE]') {
            continue;
        }

        const payload = parsePayload(payloadText);
        if (!payload) {
            continue;
        }

        const chunkContent = extractTextFromPayload(payload);
        if (chunkContent) {
            nextText += chunkContent;
        }

        if (typeof payload?.usage?.total_tokens === 'number') {
            nextTokens = payload.usage.total_tokens;
        }
    }

    return {
        text: nextText,
        totalTokens: nextTokens
    };
};

export const parseOpenAiCompatibleResponse = async (response: Response): Promise<OpenAiCompatibleResponseResult> => {
    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('text/event-stream') || !response.body) {
        const data = await response.json();
        return {
            text: extractTextFromPayload(data).trim(),
            totalTokens: typeof data?.usage?.total_tokens === 'number' ? data.usage.total_tokens : 0
        };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let aggregatedText = '';
    let totalTokens = 0;

    while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
            const parsed = consumeStreamChunk(chunk, aggregatedText, totalTokens);
            aggregatedText = parsed.text;
            totalTokens = parsed.totalTokens;
        }

        if (done) {
            break;
        }
    }

    if (buffer.trim()) {
        const parsed = consumeStreamChunk(buffer, aggregatedText, totalTokens);
        aggregatedText = parsed.text;
        totalTokens = parsed.totalTokens;
    }

    return {
        text: aggregatedText.trim(),
        totalTokens
    };
};