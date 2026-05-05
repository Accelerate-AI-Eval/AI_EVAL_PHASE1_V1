// utils/system.js
const os = require('os');
function getServerInfo() {
    const interfaces = os.networkInterfaces();
    let ip = null;
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                ip = net.address;
            }
        }
    }
    return {
        ip,
        hostname: os.hostname()
    };
}
module.exports = getServerInfo;
export {};
