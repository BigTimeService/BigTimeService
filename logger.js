function initLogger() {
    window.addLog = function (message, options = {}) {
        const {
            isError = false,
            module = 'SYSTEM'
        } = options;

        const logOutput = document.getElementById('logOutput');
        if (!logOutput) return;
        
        const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
        const logEntry = document.createElement('div');

        logEntry.innerHTML = `
            <span class="text-muted">[${timestamp}]</span>
            <span class="badge bg-${getModuleColor(module)}">${module}</span>
            ${isError ? '<span class="text-danger">[错误]</span>' : '<span class="text-success">[成功]</span>'}
            ${message}
        `;

        logOutput.appendChild(logEntry);
        logOutput.scrollTop = logOutput.scrollHeight;
        if (isError && message.includes('用户数据获取失败')) {
            const userErrorModal = new bootstrap.Modal(document.getElementById('userErrorModal'));
            userErrorModal.show();
        }
    };
    function getModuleColor(module) {
        const colors = {
            'USER': 'primary',
            'SPACE': 'info',
            'GUARD': 'warning',
            'SYSTEM': 'secondary'
        };
        return colors[module] || 'dark';
    }
}
if (document.readyState === 'complete') {
    initLogger();
    document.dispatchEvent(new Event('loggerReady'));
} else {
    document.addEventListener('DOMContentLoaded', initLogger);
}
