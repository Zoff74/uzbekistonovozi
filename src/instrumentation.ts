export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        // 1. Жестко глушим низкоуровневый вывод в stderr, куда GramJS шлет весь спам
        const originalStderrWrite = process.stderr.write.bind(process.stderr);
        process.stderr.write = (chunk: any, encoding?: any, cb?: any) => {
            const msg = String(chunk);
            if (
                msg.includes('TIMEOUT') ||
                msg.includes('updates.js') ||
                msg.includes('Connection closed') ||
                msg.includes('Not connected') ||
                msg.includes('MTProtoSender')
            ) {
                return true; // Игнорируем и не выводим в консоль
            }
            return originalStderrWrite(chunk, encoding, cb);
        };

        // 2. Дублируем перехват для stdout на всякий случай
        const originalStdoutWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = (chunk: any, encoding?: any, cb?: any) => {
            const msg = String(chunk);
            if (
                msg.includes('TIMEOUT') ||
                msg.includes('updates.js') ||
                msg.includes('Connection closed') ||
                msg.includes('Not connected') ||
                msg.includes('MTProtoSender')
            ) {
                return true;
            }
            return originalStdoutWrite(chunk, encoding, cb);
        };

        // 3. Перехват нераспознанных промисов
        process.on('unhandledRejection', (reason: any) => {
            const msg = String(reason?.message || reason);
            if (msg.includes('TIMEOUT') || msg.includes('updates.js') || msg.includes('Connection closed') || msg.includes('Not connected')) {
                return;
            }
        });
    }
}